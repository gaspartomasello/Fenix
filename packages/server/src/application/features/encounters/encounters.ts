import type { CreatureKind } from '@fenix/shared/creatures/creature-catalog';
import type { Position } from '@fenix/shared/geometry/position';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { daylight } from '@fenix/shared/rules/daylight';
import { heading, regionCenter } from '@fenix/shared/world/compass';
import { Terrain } from '@fenix/shared/world/terrain';
import { Creature } from '../../../domain/creatures/creature';
import { emptyChanges } from '../../../domain/items/items';
import type { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { WorldClock } from '../../../domain/world-clock';
import type { ItemNotifications } from '../../kernel/item-notifications';
import type { MobileNotifications } from '../../kernel/mobile-notifications';
import type { GameServices } from '../../kernel/services';
import type { IdGenerator, Notifier, RandomSource } from '../../ports';

/** Entre un encuentro y otro, para cada jugador. */
export const ENCOUNTER_REST_MS = 6 * 60 * 1000;
/** Probabilidad de un encuentro en cada paso por un camino (pasado el descanso). */
export const ENCOUNTER_CHANCE = 1 / 180;
/** Cuánto se quedan los que aparecen (después se van). */
const STAY_MS = 5 * 60 * 1000;

type Kind = 'ambush' | 'peddler' | 'wolves' | 'rumor';

/** Un encuentro en curso. */
interface Encounter {
  readonly kind: Kind;
  readonly playerId: EntityId;
  readonly creatures: Creature[];
  /** La buhonera en apuros (si es ese encuentro). */
  readonly victim: Creature | null;
  readonly until: number;
}

const BANDITS = ['Cholo el salteador', 'Mandinga Ruiz', 'el Zurdo Ferreyra', 'Tránsito la Navaja'];
const AMBUSH_LINES = [
  '¡Alto ahí! La bolsa o la vida... y la bolsa primero.',
  '¡Quieto, caminante! Este camino cobra peaje.',
  'Mirá lo que trajo el viento: un bolsillo lleno. ¡A él, muchachos!',
];
const PEDDLERS = ['Doña Pura la buhonera', 'Remigia la buhonera', 'Casimira la vendedora'];
const WANDERERS = ['Hilario el caminante', 'Ña Eduviges', 'Fray Nicanor', 'Jacinto el arriero'];

/**
 * Encuentros fortuitos en los caminos: al andar por un camino, cada tanto
 * pasa algo — una emboscada de salteadores, una buhonera a la que quieren
 * robar (si la salvás, paga), lobos de noche, o un caminante que cuenta un
 * rumor de algún lugar escondido que no está en los mapas.
 */
export class Encounters {
  private readonly encounters: Encounter[] = [];
  /** Desde cuándo puede tener otro encuentro cada jugador. */
  private readonly nextAt = new Map<EntityId, number>();

  constructor(
    private readonly world: World,
    private readonly worldClock: WorldClock,
    private readonly ids: IdGenerator,
    private readonly random: RandomSource,
    private readonly items: ItemNotifications,
    private readonly mobiles: MobileNotifications,
    private readonly notifier: Notifier,
    private readonly combat: GameServices['combat'],
    private readonly now: () => number,
  ) {}

  /** Un jugador dio un paso: si va por un camino, quizás pase algo. */
  stepped(player: Player): void {
    if (player.combat.isDead) return;
    const now = this.now();
    const next = this.nextAt.get(player.id);
    if (next === undefined) {
      // Recién llegado: un rato de calma antes del primero.
      this.nextAt.set(player.id, now + ENCOUNTER_REST_MS / 2);
      return;
    }
    if (now < next) return;
    if (!this.onRoad(player.position)) return;
    if (this.random.next() >= ENCOUNTER_CHANCE) return;
    this.start(player);
  }

  /** Empieza un encuentro para `player` (al azar entre los que pueden pasar ahora). */
  start(player: Player, kind?: Kind): void {
    this.nextAt.set(player.id, this.now() + ENCOUNTER_REST_MS);
    const night = daylight(this.worldClock.timeAt(this.now()).dayProgress) < 0.45;
    const roll = this.random.next();
    const chosen: Kind =
      kind ??
      (night && roll < 0.4 ? 'wolves' : roll < 0.6 ? 'ambush' : roll < 0.8 ? 'peddler' : 'rumor');
    const spot = this.spotAhead(player.position);
    if (!spot) return;
    const until = this.now() + STAY_MS;
    if (chosen === 'ambush') {
      const leader = this.spawn('brigand', spot, this.pick(BANDITS));
      const crew = [
        leader,
        ...[1, 2].map(() => this.spawn('brigand', this.freeNear(spot, 2) ?? spot)),
      ];
      this.encounters.push({
        kind: chosen,
        playerId: player.id,
        creatures: crew,
        victim: null,
        until,
      });
      this.shout(leader, this.pick(AMBUSH_LINES));
    } else if (chosen === 'peddler') {
      const victim = this.spawn('peddler', spot, this.pick(PEDDLERS));
      const thugs = [1, 2].map(() => this.spawn('brigand', this.freeNear(spot, 2) ?? spot));
      this.encounters.push({ kind: chosen, playerId: player.id, creatures: thugs, victim, until });
      this.shout(victim, '¡Socorro! ¡Ayúdenme, que me quieren robar la mercadería!');
    } else if (chosen === 'wolves') {
      const pack = [0, 1, 2].map(() => this.spawn('wolf', this.freeNear(spot, 2) ?? spot));
      this.encounters.push({
        kind: chosen,
        playerId: player.id,
        creatures: pack,
        victim: null,
        until,
      });
      this.tell(player, 'Se oyen aullidos cerca... y cada vez más cerca.');
    } else {
      const wanderer = this.spawn('traveler', spot, this.pick(WANDERERS));
      this.encounters.push({
        kind: chosen,
        playerId: player.id,
        creatures: [wanderer],
        victim: null,
        until,
      });
      this.shout(wanderer, this.rumor(spot));
    }
  }

  /** Murió una criatura: si era de una buhonera en apuros y ya no queda ninguno, ella paga. */
  slain(killer: Player, creature: Creature): void {
    for (const e of this.encounters) {
      if (e.kind !== 'peddler' || !e.victim || !e.creatures.includes(creature)) continue;
      if (e.creatures.some((c) => !c.gone && !c.combat.isDead)) continue;
      if (e.victim.gone || e.victim.combat.isDead) continue;
      const gold = 40 + Math.floor(this.random.next() * 41);
      const changes = emptyChanges();
      this.world.items.addToBackpack(killer.id, 'gold', gold, () => this.ids.next(), changes);
      this.world.items.addToBackpack(killer.id, 'bandage', 5, () => this.ids.next(), changes);
      this.items.publish(changes, killer.id);
      killer.reputation.award(20, 50);
      this.shout(
        e.victim,
        '¡Gracias, gracias! Sin vos me dejaban en la calle. Tomá, es lo que puedo darte.',
      );
      this.tell(killer, `Recibiste ${gold} monedas de oro y unas vendas.`);
      e.creatures.length = 0;
    }
  }

  /** Cada tanto: los que ya se quedaron demasiado, se van. */
  tick(now: number): void {
    for (let i = this.encounters.length - 1; i >= 0; i--) {
      const e = this.encounters[i];
      if (!e || now < e.until) continue;
      for (const c of [...e.creatures, ...(e.victim ? [e.victim] : [])])
        if (!c.gone && !c.combat.isDead) this.combat.dismiss(c);
      this.encounters.splice(i, 1);
    }
  }

  leaving(player: Player): void {
    this.nextAt.delete(player.id);
  }

  /** ¿Va por un camino, fuera de los pueblos? */
  private onRoad(p: Position): boolean {
    const t = this.world.map.terrainAt(p);
    if (t !== Terrain.Path && t !== Terrain.OldRoad) return false;
    return !this.world.map.safeZoneAt(p);
  }

  /** «Dicen que hacia el norte hay…»: el lugar escondido más cercano (que no esté en el mapa). */
  private rumor(from: Position): string {
    const hidden = this.world.map.regions
      .filter((r) => r.hidden)
      .map((r) => ({ r, c: regionCenter(r) }))
      .map((o) => ({ ...o, d: Math.hypot(o.c.x - from.x, o.c.y - from.y) }))
      .filter((o) => o.d > 15 && o.d < 400)
      .sort((a, b) => a.d - b.d)[0];
    if (!hidden)
      return 'Buen día, caminante. Cuidate en estos caminos: de noche andan los lobos, y de día, cosas peores.';
    const far = hidden.d < 80 ? 'no muy lejos' : hidden.d < 200 ? 'a un buen trecho' : 'lejos';
    return `Buen día. ¿Sabías que hacia ${heading(hidden.c.x - from.x, hidden.c.y - from.y)}, ${far}, está ${hidden.r.name}? No figura en ningún mapa, pero yo pasé por ahí.`;
  }

  private spawn(kind: CreatureKind, at: Position, name?: string): Creature {
    const creature = new Creature(this.ids.next(), kind, at);
    if (name) creature.name = name;
    creature.temporary = true;
    this.world.addCreature(creature);
    this.mobiles.appear(creature);
    return creature;
  }

  /** Un lugar a 8–12 pasos, fuera de los pueblos. */
  private spotAhead(from: Position): Position | null {
    for (let attempt = 0; attempt < 40; attempt++) {
      const angle = this.random.next() * Math.PI * 2;
      const distance = 8 + this.random.next() * 4;
      const p = {
        x: Math.round(from.x + Math.cos(angle) * distance),
        y: Math.round(from.y + Math.sin(angle) * distance),
      };
      if (this.world.map.safeZoneAt(p)) continue;
      const free = this.freeNear(p, 1);
      if (free) return free;
    }
    return null;
  }

  private freeNear(at: Position, radius: number): Position | null {
    for (let r = 0; r <= radius; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const p = { x: at.x + dx, y: at.y + dy };
          if (
            this.world.map.isWalkable(p) &&
            !this.world.mobilesNear(p).some((m) => m.position.x === p.x && m.position.y === p.y)
          )
            return p;
        }
    return null;
  }

  private pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.random.next() * list.length)] as T;
  }

  /** Lo dice en voz alta (lo oyen los que están cerca). */
  private shout(creature: Creature, text: string): void {
    const listeners = this.world.playersNear(creature.position).map((p) => p.id);
    this.notifier.sendMany(listeners, {
      type: 'chat',
      id: creature.id,
      name: creature.name,
      text,
      channel: 'say',
    });
  }

  private tell(player: Player, text: string): void {
    this.notifier.send(player.id, { type: 'system', text });
  }
}
