import { isFaunaKind } from '@fenix/shared/creatures/fauna-catalog';
import type { EntityId, TrackSighting } from '@fenix/shared/protocol/messages';
import { detectChance } from '@fenix/shared/skills/stealth';
import {
  TRACKING_CATEGORY_NAMES,
  TRACKING_FOLLOW_MS,
  TRACKING_LIST_MAX,
  compassDirection,
  trackChance,
  trackingRange,
  type TrackingCategory,
} from '@fenix/shared/skills/tracking';
import type { Creature } from '../domain/creatures/creature';
import type { Mobile } from '../domain/mobile';
import { Npc } from '../domain/npcs/npc';
import { Player } from '../domain/player';
import type { World } from '../domain/world';
import type { MobileNotifications } from './mobile-notifications';
import type { Clock, Notifier, RandomSource } from './ports';

/** Cada cuánto se avisa dónde está el rastro que se sigue. */
const FOLLOW_EVERY_MS = 1000;

interface Following {
  readonly targetId: EntityId;
  readonly until: number;
  next: number;
}

/**
 * Rastrear, como en UO: el jugador elige qué buscar y ve los rastros a la
 * redonda (más lejos y más seguros con práctica); los escondidos cuestan
 * más. Puede seguir uno de los que encontró: mientras dura, el servidor le
 * manda dónde está para la flecha. Las reglas están en `@fenix/shared`.
 */
export class Tracking {
  /** Los rastros que encontró cada jugador la última vez (solo esos se pueden seguir). */
  private readonly found = new Map<EntityId, Set<EntityId>>();
  private readonly following = new Map<EntityId, Following>();

  constructor(
    private readonly world: World,
    private readonly mobiles: MobileNotifications,
    private readonly notifier: Notifier,
    private readonly random: RandomSource,
    private readonly clock: Clock,
  ) {}

  /** Buscar rastros de una clase. */
  track(playerId: EntityId, category: TrackingCategory): void {
    const player = this.world.get(playerId);
    if (!player) return;
    if (player.combat.isDead) return this.say(player, 'Los fantasmas no pueden hacer eso.');
    const skill = player.skills.get('tracking');
    if (player.skills.tryGain('tracking', this.roll))
      this.mobiles.skillGains([{ player, skill: 'tracking' }]);
    const range = trackingRange(skill);
    const from = player.position;
    const sightings: TrackSighting[] = [];
    for (const mobile of this.candidates(category, player)) {
      const distance = Math.max(
        Math.abs(mobile.position.x - from.x),
        Math.abs(mobile.position.y - from.y),
      );
      if (distance > range) continue;
      let chance = trackChance(skill, distance, range);
      // A uno escondido le cuesta más encontrarlo: depende de su Esconderse.
      if (mobile instanceof Player && mobile.hidden !== null)
        chance *= detectChance(skill, mobile.skills.get('hiding'));
      if (this.roll() >= chance) continue;
      sightings.push({
        id: mobile.id,
        name: mobile.name,
        direction: compassDirection(from, mobile.position),
        distance,
      });
    }
    sightings.sort((a, b) => a.distance - b.distance);
    const shown = sightings.slice(0, TRACKING_LIST_MAX);
    this.found.set(player.id, new Set(shown.map((s) => s.id)));
    this.notifier.send(player.id, { type: 'tracking', category, found: shown });
    if (shown.length === 0)
      this.say(
        player,
        `No encontrás rastros de ${TRACKING_CATEGORY_NAMES[category].toLocaleLowerCase()} cerca.`,
      );
  }

  /** Seguir uno de los rastros que encontró. */
  follow(playerId: EntityId, targetId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player || !this.found.get(playerId)?.has(targetId)) return;
    const now = this.clock.now();
    this.following.set(playerId, { targetId, until: now + TRACKING_FOLLOW_MS, next: now });
    this.tick(now);
  }

  /** Avisa a cada rastreador dónde está lo que sigue; lo pierde lejos, al morir o con el tiempo. */
  tick(now: number): void {
    for (const [playerId, follow] of this.following) {
      if (now < follow.next) continue;
      follow.next = now + FOLLOW_EVERY_MS;
      const player = this.world.get(playerId);
      if (!player) {
        this.following.delete(playerId);
        continue;
      }
      const target = this.world.getMobile(follow.targetId);
      const range = trackingRange(player.skills.get('tracking')) * 1.5;
      const lost =
        !target ||
        target.combat.isDead ||
        now > follow.until ||
        (target instanceof Player && target.hidden !== null) ||
        Math.max(
          Math.abs(target.position.x - player.position.x),
          Math.abs(target.position.y - player.position.y),
        ) > range;
      if (lost || !target) {
        this.following.delete(playerId);
        this.notifier.send(playerId, { type: 'trackPoint', targetId: follow.targetId, lost: true });
        continue;
      }
      this.notifier.send(playerId, {
        type: 'trackPoint',
        targetId: target.id,
        name: target.name,
        x: target.position.x,
        y: target.position.y,
      });
    }
  }

  /** Lo que puede encontrar en cada clase. */
  private candidates(category: TrackingCategory, player: Player): readonly Mobile[] {
    switch (category) {
      case 'animals':
        return this.wild().filter((c) => isFaunaKind(c.body));
      case 'monsters':
        return this.wild().filter((c) => !isFaunaKind(c.body));
      case 'people':
        return this.world.allPlayers().filter((p) => p.id !== player.id && !p.combat.isDead);
      case 'npcs':
        return this.world.allNpcs().filter((n): n is Npc => n instanceof Npc);
    }
  }

  /** Criaturas vivas que no son de nadie (ni monturas ni invocaciones). */
  private wild(): Creature[] {
    return this.world
      .allCreatures()
      .filter((c) => !c.gone && !c.combat.isDead && c.ownerId === null);
  }

  private readonly roll = (): number => this.random.next();

  private say(player: Player, text: string): void {
    this.notifier.send(player.id, { type: 'system', text });
  }
}
