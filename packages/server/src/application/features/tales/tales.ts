import type { Position } from '@fenix/shared/geometry/position';
import { tileDistance } from '@fenix/shared/geometry/position';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { TALE_MS, TALE_REST_MS, taleFor, type PlaceTale } from '@fenix/shared/quests/tales';
import { heading } from '@fenix/shared/world/compass';
import { Creature } from '../../../domain/creatures/creature';
import { emptyChanges } from '../../../domain/items/items';
import type { Npc } from '../../../domain/npcs/npc';
import type { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { ItemNotifications } from '../../kernel/item-notifications';
import type { MobileNotifications } from '../../kernel/mobile-notifications';
import type { GameServices } from '../../kernel/services';
import type { IdGenerator, Notifier, RandomSource } from '../../ports';

/** Un relato en curso: de quién, qué queda suelto y hasta cuándo. */
interface Errand {
  readonly tale: PlaceTale;
  readonly giver: Npc;
  readonly where: string;
  readonly foes: Creature[];
  readonly until: number;
  done: boolean;
}

/** Lo que hace que alguien cuente su problema. */
const ASK =
  /\b(ayuda|ayudar|ayudo|trabajo|problema|problemas|encargo|mision|necesitas|pasa|pasando)\b/;
const GREET = /\b(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|saludos)\b/;

/**
 * Los relatos de los lugares (`@fenix/shared/quests/tales`): la gente de las
 * granjas, los caseríos, los campamentos y las rarezas tiene un problema
 * propio. Al pedirle «ayuda» lo cuenta, y lo suelto aparece a un trecho del
 * lugar; al terminar con eso se vuelve a cobrar.
 */
export class Tales {
  private readonly errands = new Map<EntityId, Errand>();
  /** Hasta cuándo cada lugar no tiene problemas para cada jugador. */
  private readonly resting = new Map<string, number>();

  constructor(
    private readonly world: World,
    private readonly ids: IdGenerator,
    private readonly random: RandomSource,
    private readonly items: ItemNotifications,
    private readonly mobiles: MobileNotifications,
    private readonly notifier: Notifier,
    private readonly combat: GameServices['combat'],
    private readonly now: () => number,
  ) {}

  /** Lo que contesta alguien de un lugar con relato (o null si no le toca). */
  talk(player: Player, npc: Npc, words: string): string | null {
    const place = this.world.map.regionAt(npc.home)?.name;
    const tale = place ? taleFor(place, npc.role) : null;
    if (!tale) return null;
    const errand = this.errands.get(player.id);
    if (errand?.giver === npc) {
      if (errand.done) return this.pay(player, errand);
      if (!ASK.test(words) && !GREET.test(words)) return null;
      const left = errand.foes.filter((f) => !f.gone && !f.combat.isDead).length;
      return `¿Y? Todavía ${left === 1 ? 'queda uno' : `quedan ${left}`}, ${errand.where}.`;
    }
    const asked = ASK.test(words);
    const resting = (this.resting.get(this.key(player, npc)) ?? 0) > this.now();
    if (GREET.test(words) && !asked)
      return resting
        ? null
        : `Hola, forastero. Si tenés un rato... tengo un problema. Pedime ayuda y te cuento.`;
    if (!asked) return null;
    if (resting) return 'Gracias otra vez por lo de la otra vez. Por ahora está todo tranquilo.';
    if (errand && !errand.done)
      return `Se te ve ocupado con lo de ${errand.giver.name}. Terminá eso y volvé.`;
    return this.assign(player, npc, tale);
  }

  /** Murió una criatura: si era de un relato, cuenta (la mate quien la mate). */
  slain(creature: Creature): void {
    for (const [playerId, errand] of this.errands) {
      if (errand.done || !errand.foes.includes(creature)) continue;
      if (errand.foes.some((f) => !f.gone && !f.combat.isDead)) continue;
      errand.done = true;
      const player = this.world.get(playerId);
      if (player) this.say(player, `Listo: volvé con ${errand.giver.name} a contarle.`);
    }
  }

  /** Cada tanto: lo que no se resolvió a tiempo se va. */
  tick(now: number): void {
    for (const [playerId, errand] of this.errands) {
      if (errand.done || now < errand.until) continue;
      this.drop(playerId);
      const player = this.world.get(playerId);
      if (player)
        this.say(
          player,
          `Se hizo tarde: lo de ${errand.giver.name} se resolvió solo... o se fue lejos.`,
        );
    }
  }

  leaving(player: Player): void {
    this.drop(player.id);
  }

  private assign(player: Player, npc: Npc, tale: PlaceTale): string {
    const spot = this.spotAway(npc.home);
    if (!spot) return 'Hoy está todo tranquilo, por suerte.';
    const foes = tale.foes.map((f, i) =>
      this.spawn(f.kind, i === 0 ? spot : (this.freeNear(spot, 3) ?? spot), f.name),
    );
    const distance = tileDistance(npc.home, spot);
    const where = `hacia ${heading(spot.x - npc.home.x, spot.y - npc.home.y)}, ${distance < 18 ? 'cerca de acá' : 'a un trecho'}`;
    this.errands.set(player.id, {
      tale,
      giver: npc,
      where,
      foes,
      until: this.now() + TALE_MS,
      done: false,
    });
    return tale.story(where);
  }

  private pay(player: Player, errand: Errand): string {
    this.errands.delete(player.id);
    this.resting.set(this.key(player, errand.giver), this.now() + TALE_REST_MS);
    const changes = emptyChanges();
    this.world.items.addToBackpack(
      player.id,
      'gold',
      errand.tale.gold,
      () => this.ids.next(),
      changes,
    );
    const extra = errand.tale.item;
    if (extra)
      this.world.items.addToBackpack(
        player.id,
        extra.kind,
        extra.amount,
        () => this.ids.next(),
        changes,
      );
    this.items.publish(changes, player.id);
    player.reputation.award(30, 40);
    this.say(player, `Recibiste ${errand.tale.gold} monedas de oro${extra ? ' y un regalo' : ''}.`);
    return errand.tale.thanks;
  }

  private drop(playerId: EntityId): void {
    const errand = this.errands.get(playerId);
    if (!errand) return;
    this.errands.delete(playerId);
    for (const foe of errand.foes) if (!foe.gone && !foe.combat.isDead) this.combat.dismiss(foe);
  }

  private spawn(kind: Creature['definition']['kind'], at: Position, name?: string): Creature {
    const creature = new Creature(this.ids.next(), kind, at);
    if (name) creature.name = name;
    creature.temporary = true;
    this.world.addCreature(creature);
    this.mobiles.appear(creature);
    return creature;
  }

  /** Un lugar a 12–22 pasos, fuera de los pueblos, donde se pueda estar. */
  private spotAway(from: Position): Position | null {
    for (let attempt = 0; attempt < 60; attempt++) {
      const angle = this.random.next() * Math.PI * 2;
      const distance = 12 + this.random.next() * 10;
      const p = {
        x: Math.round(from.x + Math.cos(angle) * distance),
        y: Math.round(from.y + Math.sin(angle) * distance),
      };
      if (this.world.map.safeZoneAt(p)) continue;
      const free = this.freeNear(p, 2);
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

  private key(player: Player, npc: Npc): string {
    return `${player.name}\u0000${npc.name}`;
  }

  private say(player: Player, text: string): void {
    this.notifier.send(player.id, { type: 'system', text });
  }
}
