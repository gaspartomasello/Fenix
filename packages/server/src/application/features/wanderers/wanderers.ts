import type { Position } from '@fenix/shared/geometry/position';
import { WANDERERS, wandererByName, type Wanderer } from '@fenix/shared/social/wanderers';
import { directions, regionCenter } from '@fenix/shared/world/compass';
import { Npc } from '../../../domain/npcs/npc';
import type { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { IdGenerator, RandomSource } from '../../ports';

/**
 * Los caminantes (`@fenix/shared/social/wanderers`): gente de nombre azul
 * repartida por las encrucijadas del continente, lejos de los pueblos. Al
 * hablarles cuentan quiénes son, su historia y sus temas; y si se les
 * pregunta qué hay cerca, nombran el lugar escondido más próximo (los que
 * no figuran en los mapas).
 */
export class Wanderers {
  private readonly people = new Map<Npc, Wanderer>();
  /** A quién saludó ya cada uno (la presentación se da una sola vez). */
  private readonly met = new Set<string>();

  constructor(
    private readonly world: World,
    private readonly ids: IdGenerator,
    private readonly random: RandomSource,
  ) {}

  /** Reparte a los caminantes por las encrucijadas del mapa (los que entren). */
  settle(): void {
    const crossroads = this.world.map.regions
      .filter((r) => r.wild && /^(Cruce|Encrucijada) /.test(r.name))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.x - b.x));
    if (crossroads.length === 0) return;
    const count = Math.min(WANDERERS.length, crossroads.length);
    for (let i = 0; i < count; i++) {
      const wanderer = WANDERERS[i];
      const region = crossroads[Math.floor((i * crossroads.length) / count)];
      if (!wanderer || !region) continue;
      const spot = this.freeNear(regionCenter(region), 3);
      if (!spot) continue;
      const npc = new Npc(this.ids.next(), 'wanderer', spot, wanderer.name);
      this.world.addNpc(npc);
      this.people.set(npc, wanderer);
    }
  }

  /** Todos los que están en el mundo (para las pruebas y para otros usos). */
  all(): readonly Npc[] {
    return [...this.people.keys()];
  }

  /** Lo que contesta un caminante (o null si no le hablan a uno, o no es tema suyo). */
  talk(player: Player, npc: Npc, words: string): string | null {
    const wanderer =
      this.people.get(npc) ?? (npc.role === 'wanderer' ? wandererByName(npc.name) : undefined);
    if (!wanderer) return null;
    const key = `${npc.id}>${player.name}`;
    if (wanderer.fortunes && /\b(suerte|leeme|leer la mano|mi futuro|adivina)\b/.test(words))
      return (
        wanderer.fortunes[Math.floor(this.random.next() * wanderer.fortunes.length)] ??
        wanderer.fortunes[0] ??
        null
      );
    const topic = wanderer.topics.find((t) => t.words.test(words));
    if (topic) return topic.reply;
    if (
      /\b(historia|quien sos|quien eres|tu vida|de donde sos|de donde venis|contame de vos|tu pasado|que haces aca|que haces)\b/.test(
        words,
      )
    )
      return wanderer.story;
    if (
      /\b(que hay cerca|que hay por aca|alrededores|lugares|sabes algo|que sabes|rumor|rumores)\b/.test(
        words,
      )
    ) {
      const hint = this.nearbySecret(npc.position);
      // Los rumores de las historias largas los da la charla de siempre; acá, lo escondido de cerca.
      if (hint && !/\b(rumor|rumores)\b/.test(words)) return hint;
      if (hint && this.random.next() < 0.5) return hint;
      return null;
    }
    if (/\b(hola|buen[oa]s?|saludos|que tal)\b/.test(words) && !this.met.has(key)) {
      this.met.add(key);
      return wanderer.intro;
    }
    return null;
  }

  /** «Hacia el norte, cerca de acá, está…»: el lugar escondido más próximo. */
  private nearbySecret(from: Position): string | null {
    const hidden = this.world.map.regions
      .filter((r) => r.hidden)
      .map((r) => ({ name: r.name, center: regionCenter(r) }))
      .map((p) => ({ ...p, d: Math.hypot(p.center.x - from.x, p.center.y - from.y) }))
      .filter((p) => p.d > 12 && p.d < 400)
      .sort((a, b) => a.d - b.d)[0];
    if (!hidden) return null;
    return `No figura en los mapas, pero yo pasé por ahí: ${directions(from, hidden)}`;
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
            !this.world.map.safeZoneAt(p) &&
            !this.world.mobilesNear(p).some((m) => m.position.x === p.x && m.position.y === p.y)
          )
            return p;
        }
    return null;
  }
}
