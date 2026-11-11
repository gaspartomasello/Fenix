import { CREATURES } from '@fenix/shared/creatures/creature-catalog';
import { tileDistance, type Position } from '@fenix/shared/geometry/position';
import {
  LOYAL,
  MAX_MERCENARIES,
  MERCENARIES,
  MERCENARY_CAPTAINS,
  WAGE_GRACE_MS,
  WAGE_PERIOD_MS,
  mercenaryMood,
  mercenaryStanding,
  type Mercenary,
} from '@fenix/shared/guilds/mercenaries';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { regionCenter } from '@fenix/shared/world/compass';
import { Creature } from '../../../domain/creatures/creature';
import { emptyChanges } from '../../../domain/items/items';
import { Npc } from '../../../domain/npcs/npc';
import type { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { ItemNotifications } from '../../kernel/item-notifications';
import type { MobileNotifications } from '../../kernel/mobile-notifications';
import type { GameServices } from '../../kernel/services';
import type { Notifier, IdGenerator, RandomSource } from '../../ports';

/** Un mercenario contratado: quién es, su cuerpo en el mundo y cómo va el trato. */
interface Hire {
  readonly merc: Mercenary;
  readonly ownerId: EntityId;
  creature: Creature;
  loyalty: number;
  /** Hasta cuándo está pagado. */
  paidUntil: number;
  /** Cuándo avisó que no cobró (0: no avisó). */
  unpaidSince: number;
  /** Cuándo empezó a mirar el oro del patrón con codicia (0: no). */
  temptedSince: number;
}

/** Desde cuánto oro encima (en sueldos del mercenario) le empieza a tentar. */
const TEMPTING_WAGES = 30;
/** Cuánto aguanta tentado antes de decidir (si nada cambia). */
const TEMPTATION_MS = 60 * 1000;
/** A qué distancia escucha las órdenes del patrón. */
const HEARING = 12;

/**
 * Los mercenarios (ver `@fenix/shared/guilds/mercenaries`): los capitanes,
 * al lado de la taberna de algunos pueblos, los presentan y los contratan.
 * Contratados, siguen al patrón y pelean con él (como una invocación sin
 * tiempo). Cobran solos del oro de la mochila; la lealtad sube al pagarles,
 * con propinas y peleando juntos, y baja si no cobran. Uno codicioso y poco
 * leal puede irse, darse vuelta si no cobra, o traicionar al patrón si lo ve
 * cargado de oro (antes se le nota). La lealtad se guarda con el personaje.
 */
export class Mercenaries {
  private readonly hires: Hire[] = [];
  private readonly captains = new Map<Npc, string>();

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

  /** Pone a cada capitán al lado de la taberna de su pueblo (si el mapa tiene el pueblo). */
  settle(): void {
    for (const { town, name } of MERCENARY_CAPTAINS) {
      const region = this.world.map.regions.find((r) => r.name === town && !r.floor);
      if (!region) continue;
      const innkeeper = this.world
        .allNpcs()
        .find((n) => n.role === 'innkeeper' && this.world.map.regionAt(n.position)?.name === town);
      const spot = this.freeNear(innkeeper?.position ?? regionCenter(region), 3);
      if (!spot) continue;
      const captain = new Npc(this.ids.next(), 'mercenary', spot, name);
      this.world.addNpc(captain);
      this.captains.set(captain, town);
    }
  }

  /** Lo que contesta un capitán (o null si no le hablan a uno). */
  talk(player: Player, npc: Npc, words: string): string | null {
    const town = this.captains.get(npc);
    if (!town) return null;
    const roster = MERCENARIES.filter((m) => m.town === town);
    const named = roster.find((m) => words.includes(plain(m.name).split(' ')[0] ?? '~'));
    if (named) return this.hire(player, named);
    if (/\b(mercenario|mercenarios|contratar|gente|lista|quienes|espadas)\b/.test(words)) {
      const list = roster.map((m) => {
        const busy = this.hires.some((h) => h.merc === m);
        const traitor = player.standing.get(mercenaryStanding(m.name)) === -1;
        const note = traitor
          ? ' (no quiere saber nada de vos)'
          : busy
            ? ' (ya está contratado)'
            : '';
        return `${m.name}, ${CREATURES[m.kind].name}, ${m.wage} de oro cada diez minutos${note}`;
      });
      return `Mi gente: ${list.join('; ')}. Decime el nombre de quien quieras. Cobran solos de tu bolsa; si no hay oro, se enojan.`;
    }
    return null;
  }

  /** El patrón dijo algo: sus mercenarios cercanos obedecen (o contestan). */
  heard(player: Player, words: string): void {
    for (const hire of this.hiresOf(player.id)) {
      const first = plain(hire.merc.name).split(' ')[0] ?? '~';
      if (!words.includes(first) && !/\b(mercenarios|todos)\b/.test(words)) continue;
      if (tileDistance(hire.creature.position, player.position) > HEARING) continue;
      if (/\b(despedido|te despido|andate|vete|fuera)\b/.test(words)) {
        this.dismiss(
          hire,
          `${hire.merc.name}: Como digas, patrón. Cuando me necesites, sabés dónde encontrarme.`,
        );
      } else if (/\b(propina|bonus|toma|regalo|premio)\b/.test(words)) {
        this.tip(player, hire);
      } else if (/\b(paga|sueldo|cuanto|cobras)\b/.test(words)) {
        const left = Math.max(0, Math.ceil((hire.paidUntil - this.now()) / 60000));
        this.speak(
          hire,
          `Cobro ${hire.merc.wage} de oro cada diez minutos. Me quedan ${left} minuto${left === 1 ? '' : 's'} pagados.`,
        );
      } else if (/\b(lealtad|como estas|contento|todo bien|historia)\b/.test(words)) {
        this.speak(
          hire,
          /\bhistoria\b/.test(words) ? hire.merc.story : mercenaryMood(hire.loyalty),
        );
      }
    }
  }

  /** Murió una criatura a manos del patrón: si sus mercenarios estaban cerca, la pelea los une. */
  slain(killer: Player): void {
    for (const hire of this.hiresOf(killer.id))
      if (tileDistance(hire.creature.position, killer.position) <= HEARING)
        this.setLoyalty(hire, hire.loyalty + 1);
  }

  /** El patrón se va: sus mercenarios vuelven con su capitán (la lealtad queda guardada). */
  leaving(player: Player): void {
    for (const hire of this.hiresOf(player.id)) this.dismiss(hire, null);
  }

  tick(now: number): void {
    for (const hire of [...this.hires]) {
      const owner = this.world.get(hire.ownerId);
      if (!owner) continue;
      if (hire.creature.gone || hire.creature.combat.isDead) {
        this.forget(hire);
        this.say(owner, `${hire.merc.name} cayó peleando a tu lado.`);
        continue;
      }
      this.wages(owner, hire, now);
      if (this.hires.includes(hire)) this.greed(owner, hire, now);
    }
  }

  private hire(player: Player, merc: Mercenary): string {
    const key = mercenaryStanding(merc.name);
    if (player.standing.get(key) === -1)
      return `${merc.name} no quiere ni verte. Dice que ya sabe cómo pagás vos.`;
    const own = this.hiresOf(player.id);
    if (own.some((h) => h.merc === merc)) return `${merc.name} ya trabaja para vos.`;
    if (this.hires.some((h) => h.merc === merc))
      return `${merc.name} está contratado por otro. Volvé más tarde.`;
    if (own.length >= MAX_MERCENARIES)
      return `Ya tenés ${MAX_MERCENARIES} a tu servicio. Más gente no se puede mandar.`;
    if (player.combat.isDead) return 'Los fantasmas no contratan a nadie.';
    if (!this.pay(player, merc.wage))
      return `${merc.name} cobra ${merc.wage} de oro por adelantado, y no los tenés en la bolsa.`;
    const spot = this.freeNear(player.position, 3) ?? player.position;
    const creature = this.body(merc, spot, player.id);
    const saved = player.standing.get(key);
    const hire: Hire = {
      merc,
      ownerId: player.id,
      creature,
      loyalty: saved ?? merc.loyalty,
      paidUntil: this.now() + WAGE_PERIOD_MS,
      unpaidSince: 0,
      temptedSince: 0,
    };
    this.hires.push(hire);
    player.standing.set(key, hire.loyalty);
    this.speak(hire, merc.story);
    return `Trato hecho. ${merc.name} es tuyo mientras le pagues. Hablale por su nombre: «propina», «paga», «cómo estás», «despedido».`;
  }

  /** Cobrar el sueldo cuando toca; si no hay oro, avisar; si sigue sin haber, irse o darse vuelta. */
  private wages(owner: Player, hire: Hire, now: number): void {
    if (now < hire.paidUntil) return;
    if (this.pay(owner, hire.merc.wage)) {
      hire.paidUntil += WAGE_PERIOD_MS;
      hire.unpaidSince = 0;
      this.setLoyalty(hire, hire.loyalty + 4);
      this.say(owner, `Le pagaste ${hire.merc.wage} de oro a ${hire.merc.name}.`);
      return;
    }
    if (hire.unpaidSince === 0) {
      hire.unpaidSince = now;
      this.speak(
        hire,
        `Patrón, ¿y mi paga? Son ${hire.merc.wage} de oro. Si en dos minutos no los veo, me voy... o me los cobro yo.`,
      );
      return;
    }
    if (now < hire.unpaidSince + WAGE_GRACE_MS) return;
    this.setLoyalty(hire, hire.loyalty - 25);
    // Uno codicioso y resentido se cobra solo; los demás se van.
    const revolt =
      hire.loyalty < LOYAL && this.random.next() < hire.merc.greed * (1 - hire.loyalty / 100);
    if (revolt)
      this.betray(
        owner,
        hire,
        '¡Me cansé de pelear gratis! ¡Lo que no me pagaste me lo cobro de tu cuerpo!',
      );
    else this.dismiss(hire, `${hire.merc.name}: Sin paga no hay espada. Me vuelvo con mi capitán.`);
  }

  /** Mucho oro a la vista: a un codicioso poco leal se le nota... y si nada cambia, traiciona. */
  private greed(owner: Player, hire: Hire, now: number): void {
    const gold = this.world.items.countInBackpack(owner.id, 'gold');
    const tempted =
      hire.loyalty < LOYAL && hire.merc.greed >= 0.3 && gold >= hire.merc.wage * TEMPTING_WAGES;
    if (!tempted) {
      hire.temptedSince = 0;
      return;
    }
    if (hire.temptedSince === 0) {
      hire.temptedSince = now;
      this.say(owner, `${hire.merc.name} mira tu bolsa de oro con demasiado interés...`);
      return;
    }
    if (now < hire.temptedSince + TEMPTATION_MS) return;
    hire.temptedSince = now;
    // Cuanto más oro, más codicia y menos lealtad, más probable.
    const lure = Math.min(1, gold / (hire.merc.wage * TEMPTING_WAGES * 3));
    const chance = hire.merc.greed * (1 - hire.loyalty / LOYAL) * lure;
    if (this.random.next() < chance)
      this.betray(owner, hire, 'Con todo ese oro no necesito patrón. ¡Dámelo!');
  }

  /** Se da vuelta: deja de ser del patrón y lo ataca. Nunca más trabaja para él. */
  private betray(owner: Player, hire: Hire, line: string): void {
    this.speak(hire, line);
    const { creature } = hire;
    const health = creature.combat.health;
    this.forget(hire);
    this.combat.dismiss(creature);
    const traitor = this.body(hire.merc, creature.position, null);
    traitor.combat.takeDamage(Math.round((1 - health) * traitor.combat.current.maxHits));
    traitor.combat.targetId = owner.id;
    this.mobiles.broadcastHealth(traitor);
    owner.standing.set(mercenaryStanding(hire.merc.name), -1);
    this.say(owner, `¡${hire.merc.name} te traicionó!`);
  }

  private tip(player: Player, hire: Hire): void {
    if (!this.pay(player, hire.merc.wage)) {
      this.speak(hire, 'Las propinas se dan con oro, patrón, no con palabras.');
      return;
    }
    this.setLoyalty(hire, hire.loyalty + 10);
    hire.temptedSince = 0;
    this.speak(hire, `¡Gracias, patrón! ${mercenaryMood(hire.loyalty)}`);
  }

  private dismiss(hire: Hire, line: string | null): void {
    if (line) this.speak(hire, line);
    this.forget(hire);
    if (!hire.creature.gone && !hire.creature.combat.isDead) this.combat.dismiss(hire.creature);
  }

  private forget(hire: Hire): void {
    const i = this.hires.indexOf(hire);
    if (i >= 0) this.hires.splice(i, 1);
  }

  private setLoyalty(hire: Hire, value: number): void {
    hire.loyalty = Math.max(0, Math.min(100, value));
    this.world.get(hire.ownerId)?.standing.set(mercenaryStanding(hire.merc.name), hire.loyalty);
  }

  private hiresOf(playerId: EntityId): Hire[] {
    return this.hires.filter((h) => h.ownerId === playerId);
  }

  private pay(player: Player, amount: number): boolean {
    const changes = emptyChanges();
    if (!this.world.items.consumeFromBackpack(player.id, 'gold', amount, changes)) return false;
    this.items.publish(changes, player.id);
    return true;
  }

  /** Su cuerpo en el mundo: del patrón (lo sigue y pelea con él) o suelto (hostil). */
  private body(merc: Mercenary, at: Position, ownerId: EntityId | null): Creature {
    const creature = new Creature(
      this.ids.next(),
      merc.kind,
      at,
      ownerId ? { ownerId, expiresAt: null } : null,
    );
    creature.name = merc.name;
    creature.temporary = true;
    this.world.addCreature(creature);
    this.mobiles.appear(creature);
    return creature;
  }

  private speak(hire: Hire, text: string): void {
    const listeners = this.world.playersNear(hire.creature.position).map((p) => p.id);
    if (!listeners.includes(hire.ownerId)) listeners.push(hire.ownerId);
    this.notifier.sendMany(listeners, {
      type: 'chat',
      id: hire.creature.id,
      name: hire.merc.name,
      text,
      channel: 'say',
    });
  }

  private say(player: Player, text: string): void {
    this.notifier.send(player.id, { type: 'system', text });
  }

  private freeNear(at: Position, radius: number): Position | null {
    const x0 = Math.floor(at.x);
    const y0 = Math.floor(at.y);
    for (let r = 1; r <= radius; r++)
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
}

/** Minúsculas, sin acentos ni signos (como se entiende lo que se dice). */
export function plain(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
