import {
  DOORS,
  STATICS,
  TERRAINS,
  Terrain,
  type Position,
  type RegionData,
  type StaticKind,
  type StaticPlacement,
} from '@fenix/shared';
import { hash } from './procedural-map';

/** Lo más alto que sube el suelo (en escalones). */
const MAX_LEVEL = 80;
/** Cuánto sube la montaña por cada tile que se entra en el macizo. */
const RISE_PER_TILE = 7;
/** Lo más que sube la montaña sobre su pie. */
const MAX_RISE = 46;
/** Escalones de diferencia entre dos tiles de montaña vecinos (laderas empinadas). */
const CLIFF = 12;
/** Macizos desde este tamaño tienen una mina. */
const MINE_MIN_SIZE = 180;
const MAX_MINES = 6;
const MINE_NAMES = [
  'Mina del Eco',
  'Mina Honda',
  'Mina de la Veta Vieja',
  'Mina de los Topos',
  'Mina Quebrada',
  'Mina del Farol',
];
/** Lo que es parte de una construcción: no se saca para abrir paso. */
const STRUCTURE =
  /wall|rampart|palisade|fence|tower|door|post|corner|window|crypt|fountain|ladder|cave-entrance|sign/;
const CRAGS: readonly StaticKind[] = ['crag', 'crag', 'crag-ledge', 'crag-spire'];

export interface MountainWorld {
  readonly width: number;
  readonly height: number;
  readonly terrain: Terrain[];
  readonly statics: Map<number, StaticPlacement>;
  readonly heights: number[] | undefined;
  readonly regions: RegionData[];
  /** Desde donde se tiene que poder llegar caminando a todo (la capital). */
  readonly spawn: Position;
  readonly seed: number;
}

/**
 * Las montañas como en UO: no una laja repetida en cada tile, sino terreno de
 * roca que sube en laderas (más alto cuanto más adentro del macizo), con
 * riscos sueltos de distintas formas encima. Los macizos grandes tienen una
 * mina: un socavón que entra en la montaña hasta una galería, donde se pica
 * la roca de las paredes. Y ningún rincón queda encerrado entre montañas: si
 * lo hay, se le abre un paso.
 */
export function shapeMountains(world: MountainWorld): void {
  const { width, height, terrain, statics, heights, regions, spawn, seed } = world;
  const total = width * height;
  const isMountain = (i: number): boolean => statics.get(i)?.kind === 'mountain';
  const neighbors = (i: number): number[] => {
    const x = i % width;
    const out: number[] = [];
    if (x > 0) out.push(i - 1);
    if (x < width - 1) out.push(i + 1);
    if (i >= width) out.push(i - width);
    if (i < total - width) out.push(i + width);
    return out;
  };

  // Debajo de cada montaña, la ladera de roca.
  for (const [i, s] of statics) if (s.kind === 'mountain') terrain[i] = Terrain.Mountain;

  const depth = depthField();
  digMines();
  openPockets();
  trimStubs();
  placeCrags();
  if (heights) raise(heights);

  /** Cuántos tiles hay hasta salir del macizo (1 en el borde). */
  function depthField(): Int16Array {
    const dist = new Int16Array(total);
    const queue: number[] = [];
    for (let i = 0; i < total; i++)
      if (isMountain(i) && neighbors(i).some((n) => !isMountain(n))) {
        dist[i] = 1;
        queue.push(i);
      }
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head] as number;
      for (const n of neighbors(c))
        if (isMountain(n) && !dist[n]) {
          dist[n] = (dist[c] ?? 0) + 1;
          queue.push(n);
        }
    }
    return dist;
  }

  function walkable(i: number): boolean {
    const t = terrain[i];
    if (t === undefined || !TERRAINS[t].walkable) return false;
    const kind = statics.get(i)?.kind;
    return !kind || !STATICS[kind].blocking || DOORS[kind] !== undefined;
  }

  function insideRegion(i: number): boolean {
    const x = i % width;
    const y = Math.floor(i / width);
    return regions.some(
      (r) => x >= r.x - 2 && y >= r.y - 2 && x < r.x + r.width + 2 && y < r.y + r.height + 2,
    );
  }

  /** Los macizos, del más grande al más chico. */
  function massifs(): number[][] {
    const seen = new Uint8Array(total);
    const out: number[][] = [];
    for (let i = 0; i < total; i++) {
      if (seen[i] || !isMountain(i)) continue;
      const group = [i];
      seen[i] = 1;
      for (let head = 0; head < group.length; head++)
        for (const n of neighbors(group[head] as number))
          if (!seen[n] && isMountain(n)) {
            seen[n] = 1;
            group.push(n);
          }
      out.push(group);
    }
    return out.sort((a, b) => b.length - a.length);
  }

  function digMines(): void {
    let made = 0;
    for (const group of massifs()) {
      if (made >= MAX_MINES || group.length < MINE_MIN_SIZE) break;
      // Bocas posibles: un tile del borde con tierra firme afuera, lejos de pueblos y lugares.
      const mouths: { from: number; into: number }[] = [];
      for (const i of group) {
        if (depth[i] !== 1) continue;
        for (const o of neighbors(i))
          if (!isMountain(o) && walkable(o) && !insideRegion(o)) mouths.push({ from: o, into: i });
      }
      // De unas cuantas bocas, la que lleva más hondo.
      let best: { from: number; path: number[] } | null = null;
      for (let k = 0; k < Math.min(40, mouths.length); k++) {
        const pick = mouths[Math.floor(hash(seed + 71 + made, k, group.length) * mouths.length)];
        if (!pick) continue;
        const path = tunnel(pick.from, pick.into);
        if (!best || path.length > best.path.length) best = { from: pick.from, path };
      }
      if (!best || best.path.length < 6) continue;
      const name = MINE_NAMES[made % MINE_NAMES.length] ?? 'Mina';
      dig(best.from, best.path, name);
      made++;
    }
  }

  /**
   * El socavón: entra derecho unos pasos y después sigue hacia lo más hondo
   * del macizo, sin acercarse a la otra ladera.
   */
  function tunnel(from: number, into: number): number[] {
    const step = into - from;
    const path = [into];
    let at = into;
    for (let n = 0; n < 22; n++) {
      const ahead = at + step;
      const options = neighbors(at).filter(
        (c) => isMountain(c) && !path.includes(c) && (depth[c] ?? 0) >= Math.min(3, n + 1),
      );
      if (options.length === 0) break;
      // Los primeros pasos, derecho; después, hacia lo más hondo (con preferencia por seguir derecho).
      const score = (c: number): number =>
        (n < 3 && c === ahead ? 100 : 0) + (depth[c] ?? 0) + (c === ahead ? 0.5 : 0);
      const next = options.sort((a, b) => score(b) - score(a))[0] as number;
      if (n >= 3 && (depth[next] ?? 0) < (depth[at] ?? 0) - 1) break;
      path.push(next);
      at = next;
    }
    return path;
  }

  function dig(from: number, path: readonly number[], name: string): void {
    const floor = new Set<number>();
    const ground = heights?.[from] ?? 0;
    const open = (i: number): void => {
      if (i < 0 || i >= total) return;
      floor.add(i);
      terrain[i] = Terrain.Cave;
      statics.delete(i);
      if (heights) heights[i] = ground;
    };
    path.forEach((i, n) => {
      open(i);
      // Dos tiles de ancho (hacia el costado que es más hondo).
      const side = neighbors(i)
        .filter((c) => isMountain(c) && !path.includes(c))
        .sort((a, b) => (depth[b] ?? 0) - (depth[a] ?? 0))[0];
      if (side !== undefined && (n < 2 || (depth[side] ?? 0) >= 2)) open(side);
    });
    // La galería del fondo: una sala redonda con paredes de por lo menos un tile.
    const end = path[path.length - 1] ?? from;
    const ex = end % width;
    const ey = Math.floor(end / width);
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy > 10) continue;
        const x = ex + dx;
        const y = ey + dy;
        if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
        const i = y * width + x;
        if (isMountain(i) && (depth[i] ?? 0) >= 2) open(i);
      }
    // Piedritas en el piso de la galería.
    let n = 0;
    for (const i of floor)
      if (hash(seed + 5, i, 3) < 0.12 && n++ < 5)
        statics.set(i, { kind: 'pebbles', x: i % width, y: Math.floor(i / width) });
    const xs = [...floor].map((i) => i % width);
    const ys = [...floor].map((i) => Math.floor(i / width));
    const x0 = Math.min(...xs) - 1;
    const y0 = Math.min(...ys) - 1;
    // Primero en la lista: dentro de la mina manda la mina.
    regions.unshift({
      name,
      x: x0,
      y: y0,
      width: Math.max(...xs) + 2 - x0,
      height: Math.max(...ys) + 2 - y0,
      wild: true,
    });
  }

  /**
   * Rincones de tierra firme encerrados (sin salida ni al mar) por montañas,
   * árboles o un farol delante de una puerta: se les abre el paso más corto
   * hasta el resto, a través de roca o despejando lo que tape (nunca
   * paredes ni cercas).
   */
  function openPockets(): void {
    for (let round = 0; round < 6; round++) {
      const { label, members, coastal } = zones();
      const home = label[spawn.y * width + spawn.x] ?? -1;
      let opened = 0;
      members.forEach((tiles, id) => {
        if (id === home || coastal[id]) return;
        if (pass(tiles, id, label)) opened++;
      });
      if (!opened) return;
    }
  }

  /** Las zonas de suelo libre unidas entre sí, y si tocan el mar. */
  function zones(): { label: Int32Array; members: number[][]; coastal: Uint8Array } {
    const label = new Int32Array(total).fill(-1);
    const members: number[][] = [];
    const coast: number[] = [];
    for (let i = 0; i < total; i++) {
      if (label[i] !== -1 || !walkable(i)) continue;
      const id = members.length;
      const tiles = [i];
      label[i] = id;
      let wet = 0;
      for (let head = 0; head < tiles.length; head++) {
        const c = tiles[head] as number;
        for (const n of neighbors(c)) {
          if (terrain[n] === Terrain.Water) wet = 1;
          if (label[n] === -1 && walkable(n)) {
            label[n] = id;
            tiles.push(n);
          }
        }
      }
      members.push(tiles);
      coast.push(wet);
    }
    return { label, members, coastal: Uint8Array.from(coast) };
  }

  /** Lo que se puede sacar para abrir paso: roca de montaña, riscos, árboles, piedras, faroles. */
  function clearable(i: number): boolean {
    const kind = statics.get(i)?.kind;
    if (isMountain(i) || kind?.startsWith('crag')) return true;
    const t = terrain[i];
    if (t === undefined || !TERRAINS[t].walkable) return false;
    return kind !== undefined && STATICS[kind].blocking && !STRUCTURE.test(kind);
  }

  /** Abre el camino más corto (de dos de ancho) entre el rincón y cualquier otra zona. */
  function pass(pocket: readonly number[], id: number, label: Int32Array): boolean {
    const from = new Map<number, number>();
    const queue = [...pocket];
    for (const p of pocket) from.set(p, p);
    for (let head = 0; head < queue.length && head < 200000; head++) {
      const c = queue[head] as number;
      for (const n of neighbors(c)) {
        if (from.has(n)) continue;
        if (label[n] !== -1 && label[n] !== id && walkable(n)) {
          for (let at = c; label[at] !== id; at = from.get(at) ?? at)
            for (const t of [at, at + 1, at + width]) {
              if (!clearable(t)) continue;
              const rocky = terrain[t] === Terrain.Mountain;
              statics.delete(t);
              if (rocky) terrain[t] = Terrain.Gravel;
            }
          return true;
        }
        if (!clearable(n)) continue;
        from.set(n, c);
        queue.push(n);
      }
    }
    return false;
  }

  /** Los socavones y pasos no dejan picos sueltos: se vuelven pedregullo. */
  function trimStubs(): void {
    for (let round = 0; round < 3; round++)
      for (const [i, s] of statics) {
        if (s.kind !== 'mountain') continue;
        let around = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if ((dx || dy) && isMountain(i + dy * width + dx)) around++;
        if (around >= 2) continue;
        statics.delete(i);
        terrain[i] = Terrain.Gravel;
      }
  }

  function placeCrags(): void {
    for (const [i, s] of statics) {
      if (s.kind !== 'mountain' || (depth[i] ?? 0) < 3) continue;
      const x = i % width;
      const y = Math.floor(i / width);
      if (hash(seed + 91, x, y) > 0.11) continue;
      const kind = CRAGS[Math.floor(hash(seed + 93, x, y) * CRAGS.length)] ?? 'crag';
      statics.set(i, { kind, x, y });
    }
  }

  /** La montaña sube hacia adentro; las laderas empinadas, pero sin paredones. */
  function raise(levels: number[]): void {
    const rocky = (i: number): boolean => terrain[i] === Terrain.Mountain;
    for (let i = 0; i < total; i++)
      if (rocky(i))
        levels[i] = Math.min(
          MAX_LEVEL,
          (levels[i] ?? 0) + Math.min(MAX_RISE, (depth[i] ?? 1) * RISE_PER_TILE),
        );
    // Junto a lo que no es montaña (y a las minas), no más de un escalón empinado.
    for (let pass = 0; pass < 4; pass++) {
      const order = pass % 2 === 0 ? 1 : -1;
      for (let k = 0; k < total; k++) {
        const i = order > 0 ? k : total - 1 - k;
        if (!rocky(i)) continue;
        let cap = levels[i] ?? 0;
        for (const n of neighbors(i)) cap = Math.min(cap, (levels[n] ?? 0) + CLIFF);
        levels[i] = cap;
      }
    }
  }
}
