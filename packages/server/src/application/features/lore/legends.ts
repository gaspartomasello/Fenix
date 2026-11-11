import type { Position } from '@fenix/shared/geometry/position';
import { ITEMS, type ItemKind } from '@fenix/shared/items/item-catalog';
import type { EntityId } from '@fenix/shared/protocol/messages';
import {
  LEGENDS,
  LEGEND_IDS,
  MASTERY_GAIN,
  MASTERY_SCROLLS,
  legendEnd,
  legendHint,
  legendPlace,
  type Legend,
  type LegendId,
  type LegendStep,
} from '@fenix/shared/quests/legends';
import { SKILL_MAX, SKILL_NAMES } from '@fenix/shared/skills/skill-catalog';
import type { RegionData } from '@fenix/shared/world/tile-map';
import { Creature } from '../../../domain/creatures/creature';
import { emptyChanges } from '../../../domain/items/items';
import { Npc } from '../../../domain/npcs/npc';
import type { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { ItemNotifications } from '../../kernel/item-notifications';
import type { MobileNotifications } from '../../kernel/mobile-notifications';
import { directions, regionCenter } from '@fenix/shared/world/compass';
import { normalize } from './npc-talk';
import type { Clock, IdGenerator, Notifier } from '../../ports';

/** Cada cuánto se mira si alguien llegó al lugar de su leyenda. */
const CHECK_MS = 2000;

/**
 * Las leyendas (ver `LEGENDS`): misiones largas que empiezan con un rumor y
 * siguen paso a paso (preguntar, ir a un lugar, encontrar a alguien, vencer a
 * un jefe, devolver lo que dejó). Cada jugador lleva su propio avance; los
 * jefes y las personas escondidas son unos para todos mientras estén. El
 * diario dice qué hacer y hacia dónde queda el lugar (desde el pueblo más
 * cercano), y el mapa lo marca.
 */
export class Legends {
  /** El jefe vivo de cada leyenda (si apareció). */
  private readonly bosses = new Map<LegendId, Creature>();
  /** La persona escondida de cada leyenda (si ya apareció). */
  private readonly people = new Map<LegendId, Npc>();
  private nextCheckAt = 0;

  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly items: ItemNotifications,
    private readonly mobiles: MobileNotifications,
    private readonly notifier: Notifier,
  ) {}

  /** El vecino contó el rumor: el jugador ya conoce la leyenda. */
  heard(player: Player, legend: Legend): void {
    if (player.legends.has(legend.id)) return;
    player.legends.set(legend.id, 0);
    this.say(player, `Nueva leyenda en tu diario: «${legend.title}».`);
    this.send(player);
  }

  /** ¿Es una de las personas escondidas de las leyendas? */
  isLegendPerson(npc: Npc): boolean {
    return [...this.people.values()].includes(npc);
  }

  /**
   * Le hablan a un vecino: si tiene que ver con alguna leyenda del jugador,
   * devuelve lo que contesta (o null para seguir la charla normal).
   */
  ask(player: Player, npc: Npc, words: string): string | null {
    for (const id of LEGEND_IDS) {
      const legend = LEGENDS[id];
      const progress = player.legends.get(id);
      const step = progress === undefined ? null : legend.steps[progress];
      // Lo que toca ahora.
      if (progress !== undefined && step) {
        const reply = this.tryStep(player, npc, words, legend, progress, step);
        if (reply) return reply;
      }
      // Ya le contó lo suyo: lo repite (por si se olvidó adónde ir).
      const told = legend.steps.findIndex(
        (s, i) =>
          s.kind === 'ask' &&
          s.role === npc.role &&
          progress !== undefined &&
          i < progress &&
          s.keywords.some((k) => words.includes(normalize(k))),
      );
      if (told >= 0 && progress !== undefined) {
        if (progress >= legendEnd(id)) return 'Ya hiciste más de lo que te pedí. Gracias otra vez.';
        return `Ya te dije lo que sé. ${legendHint(legend, progress)}${this.where(legend, progress, npc.position)}`;
      }
    }
    // La persona escondida, si le hablan sin que toque: algo dice igual.
    const person = [...this.people.entries()].find(([, n]) => n === npc);
    if (person) return 'Shh... no hagas ruido, que nos encuentran.';
    return null;
  }

  private tryStep(
    player: Player,
    npc: Npc,
    words: string,
    legend: Legend,
    progress: number,
    step: LegendStep,
  ): string | null {
    switch (step.kind) {
      case 'ask': {
        if (step.role !== npc.role || this.isLegendPerson(npc)) return null;
        if (!step.keywords.some((k) => words.includes(normalize(k)))) return null;
        this.advance(player, legend, progress, step.gives);
        return step.reply + this.where(legend, progress + 1, npc.position);
      }
      case 'meet': {
        if (this.people.get(legend.id) !== npc) return null;
        this.advance(player, legend, progress);
        return step.reply;
      }
      case 'return': {
        const right = step.person ? npc.name === step.person : step.role === npc.role;
        if (!right || (!step.person && this.isLegendPerson(npc))) return null;
        const relic = this.world.items.backpackOf(player.id).find((i) => i.kind === step.item);
        // Se devuelve con solo hablarle (aunque no se digan las palabras exactas).
        if (!relic) return null;
        return this.complete(player, legend, relic.id, step.thanks);
      }
      default:
        return null;
    }
  }

  /** Revisa (cada tanto) quién llegó al lugar de su paso: rastros, personas y jefes. */
  tick(now: number): void {
    if (now < this.nextCheckAt) return;
    this.nextCheckAt = now + CHECK_MS;
    for (const player of this.world.allPlayers()) {
      if (player.combat.isDead || player.legends.size === 0) continue;
      const here = this.world.map.regionAt(player.position)?.name;
      if (!here) continue;
      for (const [id, progress] of player.legends) {
        const legend = LEGENDS[id];
        const step = legend.steps[progress];
        if (!step || progress === 0) continue;
        if (step.kind === 'visit' && step.place === here) {
          this.advance(player, legend, progress, step.gives);
          this.say(player, step.found);
          const next = this.where(legend, progress + 1, player.position);
          if (next) this.say(player, next.trim());
        } else if (step.kind === 'meet' && step.place === here) {
          this.bringPerson(legend, step, player);
        } else if (step.kind === 'return' && step.person) {
          // La persona a la que hay que devolverle algo vuelve a estar donde se la encontró.
          const met = legend.steps.find((s) => s.kind === 'meet' && s.person.name === step.person);
          if (met?.kind === 'meet' && met.place === here) this.bringPerson(legend, met, player);
        } else if (step.kind === 'slay' && step.place === here) {
          const boss = this.bosses.get(id);
          if (!boss || boss.combat.isDead || boss.gone) this.summon(legend, step, player);
        }
      }
    }
  }

  /** Murió una criatura: si era el jefe de una leyenda, quien la venció se lleva la reliquia. */
  slain(killer: Player, creature: Creature): void {
    for (const [id, boss] of this.bosses) {
      if (boss !== creature) continue;
      this.bosses.delete(id);
      const legend = LEGENDS[id];
      const progress = killer.legends.get(id);
      const step = progress === undefined ? null : legend.steps[progress];
      if (progress === undefined || step?.kind !== 'slay') return;
      const changes = emptyChanges();
      if (!this.world.items.addToBackpack(killer.id, step.relic, 1, () => this.ids.next(), changes))
        return this.say(killer, 'No tenés lugar en la mochila para llevarte lo que dejó.');
      this.items.publish(changes, killer.id);
      killer.legends.set(id, progress + 1);
      const relic = ITEMS[step.relic];
      this.say(
        killer,
        `Entre los restos de ${step.boss.name} encontrás ${relic.article} ${relic.name}.`,
      );
      this.send(killer);
    }
  }

  /** Leer un pergamino de maestría: +5 en su habilidad (hasta el máximo). */
  readMastery(playerId: EntityId, itemId: EntityId): void {
    const player = this.world.get(playerId);
    const item = this.world.items.get(itemId);
    const skill = item ? MASTERY_SCROLLS[item.kind] : undefined;
    if (!player || !item || !skill) return;
    const before = player.skills.get(skill);
    if (before >= SKILL_MAX)
      return this.say(player, `Ya sabés todo lo que se puede saber de ${SKILL_NAMES[skill]}.`);
    const after = Math.min(SKILL_MAX, before + MASTERY_GAIN);
    player.skills.set(skill, after);
    const changes = emptyChanges();
    this.world.items.destroy(itemId, changes);
    this.items.publish(changes, playerId);
    this.mobiles.skillGains([{ player, skill }]);
    this.say(
      player,
      `Leés el pergamino y las palabras se te graban: ${SKILL_NAMES[skill]} sube a ${(after / 10).toFixed(1)}.`,
    );
  }

  /** Manda al jugador su diario de leyendas (con hacia dónde queda cada lugar, y cuál marcar). */
  send(player: Player): void {
    this.notifier.send(player.id, {
      type: 'legends',
      legends: [...player.legends].map(([id, step]) => {
        const legend = LEGENDS[id];
        const place = legendPlace(legend, step);
        return {
          id,
          title: legend.title,
          hint: legendHint(legend, step) + this.where(legend, step, null),
          done: step >= legendEnd(id),
          ...(place ? { place } : {}),
        };
      }),
    });
  }

  /**
   * " La Granja Quemada queda hacia el noreste de Roca Alta, a un buen
   * trecho." — para el lugar del paso que toca, desde `from` (el que habla) o
   * desde el pueblo más cercano al lugar. Vacío si el paso no tiene lugar.
   */
  private where(legend: Legend, step: number, from: Position | null): string {
    const name = legendPlace(legend, step);
    const region = name ? this.region(name) : undefined;
    if (!region) return '';
    if (from) return ` ${directions(from, { name: region.name, center: regionCenter(region) })}`;
    const center = regionCenter(region);
    const town = this.world.map.regions
      .filter((r) => !r.wild && !r.dungeon && !r.floor)
      .sort(
        (a, b) =>
          Math.hypot(regionCenter(a).x - center.x, regionCenter(a).y - center.y) -
          Math.hypot(regionCenter(b).x - center.x, regionCenter(b).y - center.y),
      )[0];
    if (!town) return '';
    return ` ${directions(regionCenter(town), { name: region.name, center }, town.name)}`;
  }

  private region(name: string): RegionData | undefined {
    return this.world.map.regions.find((r) => r.name === name);
  }

  private advance(player: Player, legend: Legend, progress: number, gives?: ItemKind): void {
    if (gives) {
      const changes = emptyChanges();
      if (this.world.items.addToBackpack(player.id, gives, 1, () => this.ids.next(), changes)) {
        this.items.publish(changes, player.id);
        const item = ITEMS[gives];
        this.say(player, `Te llevás ${item.article} ${item.name}.`);
      }
    }
    player.legends.set(legend.id, progress + 1);
    this.send(player);
  }

  private complete(player: Player, legend: Legend, relicId: EntityId, thanks: string): string {
    const changes = emptyChanges();
    this.world.items.destroy(relicId, changes);
    const { scroll, gold, items = [] } = legend.reward;
    for (const [kind, amount] of [[scroll, 1] as const, ['gold', gold] as const, ...items])
      this.world.items.addToBackpack(player.id, kind, amount, () => this.ids.next(), changes);
    this.items.publish(changes, player.id);
    player.legends.set(legend.id, legendEnd(legend.id));
    player.reputation.award(500, 400);
    this.send(player);
    const extras = items.map(([kind, n]) =>
      n === 1 ? ITEMS[kind].name : `${n} ${ITEMS[kind].plural}`,
    );
    this.say(
      player,
      `Recibiste ${ITEMS[scroll].article} ${ITEMS[scroll].name}, ${gold} monedas de oro${extras.length ? ` y ${extras.join(', ')}` : ''}. Leyenda terminada: «${legend.title}».`,
    );
    return thanks;
  }

  /** Aparece la persona escondida (una sola, para todos los que la busquen). */
  private bringPerson(
    legend: Legend,
    step: Extract<LegendStep, { kind: 'meet' }>,
    seeker: Player,
  ): void {
    if (this.people.has(legend.id)) return;
    const region = this.region(step.place);
    if (!region) return;
    const spot = this.freeNear(regionCenter(region)) ?? seeker.position;
    const npc = new Npc(this.ids.next(), step.person.role, spot, step.person.name);
    this.world.addNpc(npc);
    this.people.set(legend.id, npc);
    this.say(seeker, 'Entre las sombras se mueve alguien que se esconde de vos.');
  }

  /** Aparece el jefe (con su escolta) cerca del centro de su lugar. */
  private summon(
    legend: Legend,
    step: Extract<LegendStep, { kind: 'slay' }>,
    seeker: Player,
  ): void {
    const region = this.region(step.place);
    if (!region) return;
    const spot = this.freeNear(regionCenter(region)) ?? seeker.position;
    const boss = new Creature(this.ids.next(), step.boss.kind, spot);
    boss.name = step.boss.name;
    boss.temporary = true;
    this.world.addCreature(boss);
    this.bosses.set(legend.id, boss);
    for (const kind of step.escort) {
      const at = this.freeNear(spot) ?? spot;
      const guard = new Creature(this.ids.next(), kind, at);
      guard.temporary = true;
      this.world.addCreature(guard);
    }
    this.say(seeker, `Se te eriza la piel: ${step.boss.name} está acá.`);
  }

  private freeNear(at: Position): Position | null {
    const x0 = Math.floor(at.x);
    const y0 = Math.floor(at.y);
    for (let r = 0; r <= 4; r++)
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

function hash(text: string): number {
  let h = 5;
  for (const c of text) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** La leyenda cuyo rumor sabe un vecino (una por vecino, según su nombre). */
export function rumorOf(npc: Npc): Legend | null {
  const known = LEGEND_IDS.map((id) => LEGENDS[id]).filter((l) => l.rumor.roles.includes(npc.role));
  if (known.length === 0) return null;
  return known[hash(npc.name) % known.length] ?? null;
}
