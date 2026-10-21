import {
  ITEMS,
  LEGENDS,
  LEGEND_DONE,
  LEGEND_FOUND,
  LEGEND_HEARD,
  LEGEND_IDS,
  LEGEND_SEEKING,
  MASTERY_GAIN,
  MASTERY_SCROLLS,
  SKILL_MAX,
  SKILL_NAMES,
  legendHint,
  type EntityId,
  type Legend,
  type LegendId,
  type Position,
} from '@fenix/shared';
import { Creature } from '../domain/creatures/creature';
import { emptyChanges } from '../domain/items/items';
import type { Npc } from '../domain/npcs/npc';
import type { Player } from '../domain/player';
import type { World } from '../domain/world';
import type { ItemNotifications } from './item-notifications';
import type { MobileNotifications } from './mobile-notifications';
import { normalize } from './npc-talk';
import type { Clock, IdGenerator, Notifier } from './ports';

/** Cada cuánto se mira si alguien llegó al lugar de su leyenda. */
const CHECK_MS = 2000;

/**
 * Las leyendas (ver `LEGENDS`): misiones largas que empiezan con un rumor.
 * Paso a paso: oír el rumor → preguntarle al que sabe → vencer al jefe en
 * su lugar (aparece cuando llega alguien que lo busca) → devolver la
 * reliquia y recibir el pergamino de maestría. Cada jugador lleva su propio
 * avance; el jefe es uno para todos mientras viva.
 */
export class Legends {
  /** El jefe vivo de cada leyenda (si apareció). */
  private readonly bosses = new Map<LegendId, Creature>();
  private nextCheckAt = 0;

  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly items: ItemNotifications,
    private readonly mobiles: MobileNotifications,
    private readonly notifier: Notifier,
  ) {}

  /** La leyenda cuyo rumor sabe este vecino (una por vecino, según su nombre). */
  rumorOf(npc: Npc): Legend | null {
    const known = LEGEND_IDS.map((id) => LEGENDS[id]).filter((l) =>
      l.rumor.roles.includes(npc.role),
    );
    if (known.length === 0) return null;
    return known[hash(npc.name) % known.length] ?? null;
  }

  /** El vecino contó el rumor: el jugador ya conoce la leyenda. */
  heard(player: Player, legend: Legend): void {
    if (player.legends.has(legend.id)) return;
    player.legends.set(legend.id, LEGEND_HEARD);
    this.say(player, `Nueva leyenda en tu diario: «${legend.title}».`);
    this.send(player);
  }

  /**
   * Le preguntan al vecino por algo de una leyenda. Devuelve lo que contesta
   * (o null si no tiene que ver con ninguna que le toque).
   */
  ask(player: Player, npc: Npc, words: string): string | null {
    for (const id of LEGEND_IDS) {
      const legend = LEGENDS[id];
      if (legend.contact !== npc.role) continue;
      const step = player.legends.get(id);
      const relic = this.world.items.backpackOf(player.id).find((i) => i.kind === legend.relic);
      // Devolver la reliquia (aunque no se la pregunte con palabras exactas).
      if (relic && step !== LEGEND_DONE) return this.complete(player, legend, relic.id);
      if (!legend.keywords.some((k) => words.includes(normalize(k)))) continue;
      if (step === LEGEND_DONE) return 'Ya hiciste más de lo que te pedí. Gracias otra vez.';
      if (step === LEGEND_SEEKING)
        return `Ya te dije: ${legend.place}. Buscá a ${legend.boss.name}.`;
      // Si no oyó el rumor, el que sabe se hace el desentendido (sigue la charla normal).
      if (step === undefined) continue;
      player.legends.set(id, LEGEND_SEEKING);
      this.send(player);
      return legend.briefing;
    }
    return null;
  }

  /** Revisa (cada tanto) si alguien que busca a un jefe llegó a su lugar, y lo hace aparecer. */
  tick(now: number): void {
    if (now < this.nextCheckAt) return;
    this.nextCheckAt = now + CHECK_MS;
    for (const id of LEGEND_IDS) {
      const boss = this.bosses.get(id);
      if (boss && !boss.combat.isDead && !boss.gone) continue;
      const legend = LEGENDS[id];
      const seeker = this.world
        .allPlayers()
        .find(
          (p) =>
            p.legends.get(id) === LEGEND_SEEKING &&
            !p.combat.isDead &&
            this.world.map.regionAt(p.position)?.name === legend.place,
        );
      if (seeker) this.summon(legend, seeker);
    }
  }

  /** Murió una criatura: si era el jefe de una leyenda, quien la venció se lleva la reliquia. */
  slain(killer: Player, creature: Creature): void {
    for (const [id, boss] of this.bosses) {
      if (boss !== creature) continue;
      this.bosses.delete(id);
      const legend = LEGENDS[id];
      if (killer.legends.get(id) !== LEGEND_SEEKING) return;
      const changes = emptyChanges();
      if (
        !this.world.items.addToBackpack(killer.id, legend.relic, 1, () => this.ids.next(), changes)
      )
        return this.say(killer, 'No tenés lugar en la mochila para llevarte lo que dejó.');
      this.items.publish(changes, killer.id);
      killer.legends.set(id, LEGEND_FOUND);
      const relic = ITEMS[legend.relic];
      this.say(
        killer,
        `Entre los restos de ${legend.boss.name} encontrás ${relic.article} ${relic.name}.`,
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
    player.skills.set(skill, Math.min(SKILL_MAX, before + MASTERY_GAIN));
    const changes = emptyChanges();
    this.world.items.destroy(itemId, changes);
    this.items.publish(changes, playerId);
    this.mobiles.skillGains([{ player, skill }]);
    this.say(
      player,
      `Leés el pergamino y las palabras se te graban: ${SKILL_NAMES[skill]} sube a ${((before + MASTERY_GAIN > SKILL_MAX ? SKILL_MAX : before + MASTERY_GAIN) / 10).toFixed(1)}.`,
    );
  }

  /** Manda al jugador su diario de leyendas. */
  send(player: Player): void {
    this.notifier.send(player.id, {
      type: 'legends',
      legends: [...player.legends].map(([id, step]) => ({
        id,
        title: LEGENDS[id].title,
        hint: legendHint(LEGENDS[id], step),
        done: step >= LEGEND_DONE,
      })),
    });
  }

  private complete(player: Player, legend: Legend, relicId: EntityId): string {
    const changes = emptyChanges();
    this.world.items.destroy(relicId, changes);
    this.world.items.addToBackpack(
      player.id,
      legend.reward.scroll,
      1,
      () => this.ids.next(),
      changes,
    );
    this.world.items.addToBackpack(
      player.id,
      'gold',
      legend.reward.gold,
      () => this.ids.next(),
      changes,
    );
    this.items.publish(changes, player.id);
    player.legends.set(legend.id, LEGEND_DONE);
    player.reputation.award(400, 300);
    this.send(player);
    const scroll = ITEMS[legend.reward.scroll];
    this.say(
      player,
      `Recibiste ${scroll.article} ${scroll.name} y ${legend.reward.gold} monedas de oro. Leyenda terminada: «${legend.title}».`,
    );
    return legend.thanks;
  }

  /** Aparece el jefe (con su escolta) cerca del centro de su lugar. */
  private summon(legend: Legend, seeker: Player): void {
    const region = this.world.map.regions.find((r) => r.name === legend.place);
    if (!region) return;
    const center = {
      x: region.x + Math.floor(region.width / 2),
      y: region.y + Math.floor(region.height / 2),
    };
    const spot = this.freeNear(center) ?? seeker.position;
    const boss = new Creature(this.ids.next(), legend.boss.kind, spot);
    boss.name = legend.boss.name;
    boss.temporary = true;
    this.world.addCreature(boss);
    this.bosses.set(legend.id, boss);
    for (const kind of legend.escort) {
      const at = this.freeNear(spot) ?? spot;
      const guard = new Creature(this.ids.next(), kind, at);
      guard.temporary = true;
      this.world.addCreature(guard);
    }
    this.say(seeker, `Se te eriza la piel: ${legend.boss.name} está acá.`);
  }

  private freeNear(at: Position): Position | null {
    for (let r = 0; r <= 4; r++)
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

  private say(player: Player, text: string): void {
    this.notifier.send(player.id, { type: 'system', text });
  }
}

function hash(text: string): number {
  let h = 5;
  for (const c of text) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return h;
}
