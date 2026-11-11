import {
  ASSASSINS_MASTER,
  ASSASSINS_STANDING,
  ASSASSINS_TOWN,
  CONTRACT_MS,
  CONTRACT_PLACES,
  VICTIMS,
  assassinRank,
  type Victim,
} from '@fenix/shared/guilds/assassins';
import type { Position } from '@fenix/shared/geometry/position';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { directions, regionCenter } from '@fenix/shared/world/compass';
import { Creature } from '../../../domain/creatures/creature';
import { emptyChanges } from '../../../domain/items/items';
import { Npc } from '../../../domain/npcs/npc';
import type { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { GameServices } from '../../kernel/services';
import type { ItemNotifications } from '../../kernel/item-notifications';
import type { MobileNotifications } from '../../kernel/mobile-notifications';
import type { IdGenerator, Notifier, RandomSource } from '../../ports';

/** Un encargo en curso: a quién, dónde, hasta cuándo, y si ya está hecho. */
interface Contract {
  readonly victim: Victim;
  readonly place: string;
  readonly target: Creature;
  readonly escort: readonly Creature[];
  readonly until: number;
  done: boolean;
}

/** Cuánto baja el karma matar a alguien de paz (con encargo o sin él). */
const INNOCENT_KARMA = -250;

/**
 * El gremio de asesinos (ver `@fenix/shared/guilds/assassins`). Su jefa vive
 * en el Refugio de los Bandidos haciéndose pasar por mendiga: con quien no
 * sabe la contraseña ("la sombra") no habla de negocios. A los del gremio les
 * da encargos: una víctima con nombre, en algún lugar del campo. Al matarla,
 * se vuelve a cobrar; cada encargo cumplido sube de rango y paga más.
 */
export class Assassins {
  private readonly contracts = new Map<EntityId, Contract>();
  private master: Npc | null = null;

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

  /** Pone a la jefa en el Refugio (si el mapa lo tiene), cerca de la taberna. */
  settle(): void {
    const town = this.world.map.regions.find((r) => r.name === ASSASSINS_TOWN);
    if (!town) return;
    const innkeeper = this.world
      .allNpcs()
      .find(
        (n) => n.role === 'innkeeper' && this.world.map.regionAt(n.position)?.name === town.name,
      );
    const spot = this.freeNear(innkeeper?.position ?? regionCenter(town), 2);
    if (!spot) return;
    this.master = new Npc(this.ids.next(), 'beggar', spot, ASSASSINS_MASTER);
    this.world.addNpc(this.master);
  }

  /** Lo que contesta la jefa (o null si no le hablan a ella). */
  talk(player: Player, npc: Npc, words: string): string | null {
    if (npc !== this.master) return null;
    const member = player.standing.has(ASSASSINS_STANDING);
    // Su nombre lleva "la Sombra": decirlo no es saber la contraseña.
    const said = words.replace(ASSASSINS_MASTER.toLowerCase(), 'silvana');
    const password = /\b(sombra|gremio|asesinos)\b/.test(said);
    if (!member) {
      if (!password) return 'Una monedita para una pobre ciega... ¿qué? No sé de qué me hablás.';
      player.standing.set(ASSASSINS_STANDING, 0);
      return `Bajá la voz. Así que sabés de la sombra... Soy ${ASSASSINS_MASTER}, y esta mendiga ciega ve más que todos los guardias del reino. Si querés trabajar para el gremio, pedime un encargo. Pagamos bien y no preguntamos. Vos tampoco preguntes.`;
    }
    const done = player.standing.get(ASSASSINS_STANDING) ?? 0;
    const rank = assassinRank(done);
    const contract = this.contracts.get(player.id);
    if (contract?.done) return this.pay(player, contract);
    if (/\b(rango|titulo|quien soy|cuantos)\b/.test(words))
      return `Sos ${rank.title}. Cumpliste ${done} encargo${done === 1 ? '' : 's'}. Cada encargo te paga ${rank.pay} monedas.`;
    if (/\b(encargo|contrato|trabajo|victima|mision|quien)\b/.test(words)) {
      if (contract && this.alive(contract))
        return `Tu encargo sigue en pie: ${contract.victim.name}, en ${contract.place}. ${this.where(contract.place)} No me hagas esperar.`;
      return this.assign(player, done);
    }
    if (/\b(dejar|abandonar|cancelar)\b/.test(words) && contract) {
      this.drop(player.id);
      return 'Como quieras. Otro lo hará... y cobrará en tu lugar.';
    }
    return `Hola, ${rank.title}. ¿Venís por un encargo, o a contarme tu rango?`;
  }

  /** Murió una criatura: si era una víctima, el encargo queda hecho; si era gente de paz, baja el karma. */
  slain(killer: Player, creature: Creature): void {
    if (creature.definition.innocent && !creature.ownerId) {
      killer.reputation.award(0, INNOCENT_KARMA);
      this.say(killer, 'Mataste a alguien de paz. Tu karma se ensucia.');
    }
    for (const [playerId, contract] of this.contracts) {
      if (contract.target !== creature || contract.done) continue;
      if (playerId !== killer.id) {
        // Otro hizo el trabajo: el encargo se cae.
        this.contracts.delete(playerId);
        const holder = this.world.get(playerId);
        if (holder)
          this.say(
            holder,
            `Alguien se te adelantó con ${contract.victim.name}. El encargo se cae.`,
          );
        continue;
      }
      contract.done = true;
      this.say(
        killer,
        `${contract.victim.name} no va a molestar más. Volvé con ${ASSASSINS_MASTER} a cobrar.`,
      );
    }
  }

  /** Cada tanto: los encargos vencidos se caen (y la víctima se va). */
  tick(now: number): void {
    for (const [playerId, contract] of this.contracts) {
      if (contract.done || now < contract.until) continue;
      this.drop(playerId);
      const player = this.world.get(playerId);
      if (player)
        this.say(
          player,
          `Se te pasó el tiempo: ${contract.victim.name} se fue lejos. El encargo se cae.`,
        );
    }
  }

  private assign(player: Player, done: number): string {
    const victims = VICTIMS.filter((v) => v.minDone <= done);
    const victim = victims[Math.floor(this.random.next() * victims.length)] ?? VICTIMS[0];
    const places = CONTRACT_PLACES.filter((name) =>
      this.world.map.regions.some((r) => r.name === name),
    );
    const place = places[Math.floor(this.random.next() * places.length)];
    const region = place ? this.world.map.regions.find((r) => r.name === place) : undefined;
    if (!victim || !place || !region) return 'Hoy no hay trabajo. Volvé más tarde.';
    const spot = this.freeNear(regionCenter(region), 4);
    if (!spot) return 'Hoy no hay trabajo. Volvé más tarde.';
    const target = this.spawn(victim.kind, spot, victim.name);
    const escort = (victim.guards ?? []).map((kind) =>
      this.spawn(kind, this.freeNear(spot, 3) ?? spot),
    );
    this.contracts.set(player.id, {
      victim,
      place,
      target,
      escort,
      until: this.now() + CONTRACT_MS,
      done: false,
    });
    const guarded = escort.length > 0 ? ` No anda solo: lo cuidan ${escort.length}.` : '';
    return `${victim.name}. ${victim.story} Anda por ${place}. ${this.where(place)}${guarded} Tenés ${Math.round(CONTRACT_MS / 60000)} minutos. Y acordate: es gente de paz; al atacarla, quedás marcado como criminal.`;
  }

  private pay(player: Player, contract: Contract): string {
    this.contracts.delete(player.id);
    const before = player.standing.get(ASSASSINS_STANDING) ?? 0;
    const pay = assassinRank(before).pay;
    const after = before + 1;
    player.standing.set(ASSASSINS_STANDING, after);
    const changes = emptyChanges();
    this.world.items.addToBackpack(player.id, 'gold', pay, () => this.ids.next(), changes);
    // Al subir de rango, un regalo del gremio.
    const promoted = assassinRank(after).from === after && after > 0;
    if (promoted)
      this.world.items.addToBackpack(player.id, 'lockpick', 10, () => this.ids.next(), changes);
    if (promoted)
      this.world.items.addToBackpack(
        player.id,
        'mastery-stealth',
        1,
        () => this.ids.next(),
        changes,
      );
    this.items.publish(changes, player.id);
    this.say(player, `Recibiste ${pay} monedas de oro.`);
    return promoted
      ? `${contract.victim.name}... limpio. Ya no sos aprendiz de nada: desde hoy sos ${assassinRank(after).title}. Tomá, un regalo del gremio: ganzúas y un pergamino que te va a enseñar a no hacer ruido.`
      : `${contract.victim.name}... limpio. Así me gusta. Tu paga. Cuando quieras otro encargo, pedímelo.`;
  }

  private drop(playerId: EntityId): void {
    const contract = this.contracts.get(playerId);
    if (!contract) return;
    this.contracts.delete(playerId);
    for (const creature of [contract.target, ...contract.escort])
      if (!creature.gone && !creature.combat.isDead) this.combat.dismiss(creature);
  }

  private alive(contract: Contract): boolean {
    return !contract.target.gone && !contract.target.combat.isDead;
  }

  private spawn(kind: Victim['kind'], at: Position, name?: string): Creature {
    const creature = new Creature(this.ids.next(), kind, at);
    if (name) creature.name = name;
    creature.temporary = true;
    this.world.addCreature(creature);
    this.mobiles.appear(creature);
    return creature;
  }

  /** "Queda hacia el sur de Refugio de los Bandidos, lejos." */
  private where(place: string): string {
    const region = this.world.map.regions.find((r) => r.name === place);
    const town = this.world.map.regions.find((r) => r.name === ASSASSINS_TOWN);
    if (!region || !town) return '';
    return directions(
      regionCenter(town),
      { name: place, center: regionCenter(region) },
      ASSASSINS_TOWN,
    );
  }

  private freeNear(at: Position, radius: number): Position | null {
    const x0 = Math.floor(at.x);
    const y0 = Math.floor(at.y);
    for (let r = 0; r <= radius; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const p = { x: x0 + dx, y: y0 + dy };
          if (
            this.world.map.isWalkable(p) &&
            !this.world.mobilesNear(p).some((m) => m.position.x === p.x && m.position.y === p.y)
          )
            return p;
        }
    return null;
  }

  private say(player: Player, text: string): void {
    this.notifier.send(player.id, { type: 'system', text });
  }
}
