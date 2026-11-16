import type { Position } from '@fenix/shared/geometry/position';
import { heading } from '@fenix/shared/world/compass';
import type { StaticPlacement } from '@fenix/shared/world/statics';
import { Terrain, isWater } from '@fenix/shared/world/terrain';
import type { RegionData, SignData } from '@fenix/shared/world/tile-map';
import type { SeededRandom } from '../system/seeded-random';
import { type Biome, wanderField } from './procedural-map';
import { cheapestPath, curvePath, straighten } from './roads';

/**
 * La red de caminos del campo: además de los caminos entre pueblos, caminos
 * de tierra que unen los lugares, las bocas de las mazmorras y encrucijadas
 * repartidas por las tierras vacías. Se unen como un grafo de vecinos
 * relativos (cada uno con los que tiene más cerca, sin atajos que crucen a
 * otro), así quedan cruces de tres y cuatro ramas. Las encrucijadas de tres
 * o más ramas tienen nombre y un cartel que dice adónde lleva cada rama; donde
 * un camino nuevo sale de uno viejo, un cartel indica el desvío.
 */

/** Algo con nombre adonde llevan los caminos (un lugar, la boca de una mazmorra). */
export interface Destination {
  readonly name: string;
  readonly at: Position;
}

export interface NetworkInput {
  readonly width: number;
  readonly height: number;
  readonly terrain: Terrain[];
  readonly statics: Map<number, StaticPlacement>;
  readonly biomes: readonly Biome[];
  /** Los caminos que ya hay; se le suman los de la red. */
  readonly roads: Set<number>;
  readonly towns: readonly {
    readonly name: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[];
  readonly destinations: readonly Destination[];
  /** Zonas con nombre que ya hay (los caminos no se trazan por adentro). */
  readonly regions: readonly RegionData[];
  readonly random: SeededRandom;
  readonly seed: number;
  /** De qué tierra son los nombres de las encrucijadas. */
  readonly land: 'main' | 'jungle';
}

export interface Network {
  /** Las encrucijadas con nombre (zonas salvajes chicas). */
  readonly regions: readonly RegionData[];
  readonly signs: readonly SignData[];
  /** Tiles de los caminos nuevos. */
  readonly tiles: readonly number[];
  /** Puntas de camino que no llevan a ningún lado (para poner algo más adelante). */
  readonly deadEnds: readonly Position[];
  /** Los destinos a los que llegó algún camino de la red. */
  readonly linked: ReadonlySet<string>;
}

/** Cada cuántos tiles se intenta poner una encrucijada. */
const SPACING = 110;
/** Más largo que esto, dos puntos no se unen directo. */
const MAX_EDGE = 250;
/** Una encrucijada no queda tan cerca de un pueblo o lugar. */
const CLEAR_OF = 45;
/** Lo que se aleja la búsqueda del camino de la recta entre las puntas. */
const WINDOW = 70;

/** Cómo terminan los nombres de las encrucijadas («Cruce del Lobo»), de cada tierra. */
const CROSSROAD_NAMES: Readonly<Record<'main' | 'jungle', readonly string[]>> = {
  main: [
    'del Ahorcado',
    'de los Tres Robles',
    'de la Viuda',
    'del Molino Viejo',
    'de la Piedra Partida',
    'de las Ánimas',
    'del Buhonero',
    'de los Peregrinos',
    'del Lobo',
    'del Roble Hueco',
    'de las Carretas',
    'del Cardo',
    'del Zorro',
    'de la Horca',
    'del Mojón',
    'de la Cruz Torcida',
    'del Sauce Llorón',
    'del Halcón',
    'de la Vieja Posta',
    'de los Caminantes',
    'del Pozo Seco',
    'de la Luna',
    'de los Cuatro Vientos',
    'del Espino',
    'del Arriero',
    'del Búho',
    'de la Calavera',
    'del Trébol',
    'de los Mendigos',
    'del Ciervo Blanco',
    'del Jabalí',
    'de la Campana',
    'del Herrero Muerto',
    'de las Brujas',
    'del Tejo',
    'de la Fuente Rota',
    'del Cordero',
    'de los Ladrones',
    'del Ermitaño',
    'de la Niebla',
    'del Gallo',
    'de las Urracas',
    'del Fresno',
    'de la Cabra',
    'del Carbonero',
    'de las Moras',
    'del Puente Caído',
    'del Abedul',
    'del Oso',
    'de la Vieja Encina',
  ],
  jungle: [
    'del Jaguar',
    'del Tucán',
    'de la Ceiba',
    'de los Monos Aulladores',
    'de la Serpiente',
    'del Ídolo',
    'de la Orquídea',
    'del Caimán',
    'del Guacamayo',
    'de la Liana',
    'del Tapir',
    'de las Ranas',
    'del Mono',
    'de la Pluma',
    'del Colibrí',
    'de la Cascada',
    'de la Piedra del Sol',
    'de los Mangles',
    'del Coatí',
    'del Quetzal',
    'de la Hormiga Roja',
    'del Cacao',
    'de la Máscara',
    'del Pantano Verde',
    'de la Luna Negra',
  ],
};

interface Node {
  readonly at: Position;
  readonly name: string | null;
  /** Índice del pueblo, si es un pueblo (se sale por la puerta que mira al otro). */
  readonly town: number | null;
  readonly land: number;
  readonly crossroad: boolean;
  readonly edges: { readonly to: number; readonly path: readonly Position[] }[];
}

export function buildRoadNetwork(input: NetworkInput): Network {
  const { width, height, terrain, statics, biomes, roads, towns, random } = input;
  const index = (x: number, y: number): number => y * width + x;
  const inside = (x: number, y: number): boolean =>
    x > 2 && y > 2 && x < width - 3 && y < height - 3;

  // Pueblos y zonas: por dónde no se traza ni se cava.
  const townMask = new Uint8Array(width * height);
  towns.forEach((t) => {
    for (let y = Math.max(0, t.y); y < Math.min(height, t.y + t.height); y++)
      for (let x = Math.max(0, t.x); x < Math.min(width, t.x + t.width); x++)
        townMask[index(x, y)] = 1;
  });
  const regionMask = new Uint8Array(width * height);
  for (const r of input.regions)
    for (let y = Math.max(0, r.y); y < Math.min(height, r.y + r.height); y++)
      for (let x = Math.max(0, r.x); x < Math.min(width, r.x + r.width); x++)
        regionMask[index(x, y)] = 1;

  const land = landmasses(width, height, biomes);
  const meander = wanderField(input.seed + 3, Math.min(width, height));
  // Lo que cuesta cada tile, calculado una vez (y vuelto a poner al cavar un camino).
  const costs = new Float32Array(width * height).fill(-1);

  // ── Los nodos: pueblos, destinos y encrucijadas ──
  const nodes: Node[] = [];
  const add = (
    at: Position,
    name: string | null,
    town: number | null,
    crossroad: boolean,
  ): void => {
    const l = land[index(Math.round(at.x), Math.round(at.y))] ?? -1;
    if (l < 0) return;
    nodes.push({ at, name, town, land: l, crossroad, edges: [] });
  };
  towns.forEach((t, i) =>
    add({ x: t.x + Math.floor(t.width / 2), y: t.y + Math.floor(t.height / 2) }, t.name, i, false),
  );
  for (const d of input.destinations) add(d.at, d.name, null, false);
  for (let gy = SPACING / 2; gy < height; gy += SPACING)
    for (let gx = SPACING / 2; gx < width; gx += SPACING) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const x = Math.round(gx + (random.next() - 0.5) * SPACING * 0.6);
        const y = Math.round(gy + (random.next() - 0.5) * SPACING * 0.6);
        if (!inside(x, y) || !firm(x, y)) continue;
        if (nodes.some((n) => Math.hypot(n.at.x - x, n.at.y - y) < CLEAR_OF)) continue;
        // Lejos del borde de los pueblos (no solo de su centro).
        const nearTown = towns.some(
          (t) =>
            Math.max(t.x - x, 0, x - (t.x + t.width)) < CLEAR_OF - 10 &&
            Math.max(t.y - y, 0, y - (t.y + t.height)) < CLEAR_OF - 10,
        );
        if (nearTown) continue;
        add({ x, y }, null, null, true);
        break;
      }
    }

  function firm(x: number, y: number): boolean {
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const i = index(x + dx, y + dy);
        const b = biomes[i];
        if (b === 'ocean' || b === 'mountain' || b === 'wasteland') return false;
        if (isWater(terrain[i]) || townMask[i] || regionMask[i] || roads.has(i)) return false;
        if (statics.get(i)?.kind === 'mountain') return false;
      }
    return true;
  }

  // ── Las uniones: grafo de vecinos relativos (sin los pares de pueblos, que ya tienen camino) ──
  const pairs: [number, number, number][] = [];
  const dist = (a: Node, b: Node): number => Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y);
  for (let a = 0; a < nodes.length; a++)
    for (let b = a + 1; b < nodes.length; b++) {
      const na = nodes[a];
      const nb = nodes[b];
      if (!na || !nb || na.land !== nb.land) continue;
      if (na.town !== null && nb.town !== null) continue;
      const d = dist(na, nb);
      if (d > MAX_EDGE) continue;
      const shadowed = nodes.some(
        (nc, c) =>
          c !== a && c !== b && nc.land === na.land && Math.max(dist(na, nc), dist(nb, nc)) < d,
      );
      if (!shadowed) pairs.push([a, b, d]);
    }
  pairs.sort((p, q) => p[2] - q[2]);

  const tiles: number[] = [];
  const junctions: { at: Position; toward: Position; far: number }[] = [];
  for (const [a, b] of pairs) {
    const na = nodes[a];
    const nb = nodes[b];
    if (!na || !nb) continue;
    const from = endpoint(na, nb);
    const to = endpoint(nb, na);
    const straight = cheapestPath(width, height, from, to, cost, 0.6, WINDOW, false);
    if (!straight) continue;
    const path = curvePath(straighten(straight, cost), cost, input.seed + a * 131 + b * 7, 16, 6);
    // Que el camino no sea casi todo un camino que ya existe.
    const fresh = path.filter((p) => !roads.has(index(p.x, p.y))).length;
    if (fresh < 6) continue;
    carve(path, a, b);
    na.edges.push({ to: b, path });
    nb.edges.push({ to: a, path: [...path].reverse() });
  }

  /** De qué tile sale el camino: de un pueblo, por la puerta que mira al otro extremo. */
  function endpoint(node: Node, other: Node): Position {
    const t = node.town === null ? null : towns[node.town];
    if (!t) return { x: Math.round(node.at.x), y: Math.round(node.at.y) };
    const cx = t.x + Math.floor(t.width / 2);
    const cy = t.y + Math.floor(t.height / 2);
    const dx = other.at.x - cx;
    const dy = other.at.y - cy;
    if (Math.abs(dx) > Math.abs(dy))
      return dx > 0 ? { x: t.x + t.width, y: cy } : { x: t.x - 1, y: cy };
    return dy > 0 ? { x: cx, y: t.y + t.height } : { x: cx, y: t.y - 1 };
  }

  function cost(x: number, y: number): number {
    const i = index(x, y);
    const known = costs[i] ?? -1;
    if (known >= 0) return known;
    const value = tileCost(x, y, i);
    costs[i] = value;
    return value;
  }

  function tileCost(x: number, y: number, i: number): number {
    if (townMask[i]) return Infinity;
    if (roads.has(i)) return 0.5;
    const biome = biomes[i];
    if (biome === 'ocean') return Infinity;
    if (regionMask[i]) return 5;
    if (statics.get(i)?.kind === 'mountain' || biome === 'mountain') return 60;
    if (terrain[i] === Terrain.ShallowWater) return 9;
    if (isWater(terrain[i])) return 25;
    // Un poco de ruido: los caminos serpentean en vez de ir en escuadra.
    const bend = meander(x, y);
    if (biome === 'swamp') return 2.5 + bend;
    if (biome === 'forest' || biome === 'jungle' || biome === 'snow') return 1.3 + bend;
    return 1 + bend;
  }

  /** Cava el camino (dos de ancho) y anota dónde se desvía de uno viejo. */
  function carve(path: readonly Position[], a: number, b: number): void {
    const fresh: number[] = [];
    // Donde el camino nuevo sale de uno viejo (después de ir un trecho por él), un cartel.
    const old = path.map((p) => roads.has(index(p.x, p.y)));
    for (let k = 0; k < path.length;) {
      if (!old[k]) {
        k++;
        continue;
      }
      let e = k;
      while (e + 1 < path.length && old[e + 1]) e++;
      if (e - k >= 6) {
        const first = path[k];
        const last = path[e];
        if (k > 0 && first)
          junctions.push({ at: first, toward: path[Math.max(0, k - 12)] ?? first, far: a });
        if (e < path.length - 1 && last)
          junctions.push({
            at: last,
            toward: path[Math.min(path.length - 1, e + 12)] ?? last,
            far: b,
          });
      }
      k = e + 1;
    }
    path.forEach((p, k) => {
      const wasRoad = old[k];
      if (wasRoad) return;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        const x = p.x + dx;
        const y = p.y + dy;
        if (!inside(x, y)) continue;
        const j = index(x, y);
        if (townMask[j] || regionMask[j] || biomes[j] === 'ocean' || roads.has(j)) continue;
        terrain[j] =
          isWater(terrain[j]) || terrain[j] === Terrain.Wood
            ? Terrain.Wood
            : pathGround(terrain[j]);
        const kind = statics.get(j)?.kind;
        if (kind !== 'cave-entrance' && kind !== 'sign') statics.delete(j);
        fresh.push(j);
      }
      // Banquinas: sin árboles ni piedras a un paso del camino.
      for (let dy = -1; dy <= 2; dy++)
        for (let dx = -1; dx <= 2; dx++) {
          const x = p.x + dx;
          const y = p.y + dy;
          if (!inside(x, y)) continue;
          const j = index(x, y);
          const kind = statics.get(j)?.kind;
          if (!kind || townMask[j] || regionMask[j]) continue;
          if (kind === 'mountain' || kind === 'sign' || kind === 'cave-entrance') continue;
          statics.delete(j);
        }
    });
    for (const j of fresh) {
      roads.add(j);
      costs[j] = 0.5;
      tiles.push(j);
    }
  }

  // ── Nombres de las encrucijadas y carteles ──
  const names = CROSSROAD_NAMES[input.land].map(
    (end) => `${random.next() < 0.5 ? 'Cruce' : 'Encrucijada'} ${end}`,
  );
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(random.next() * (i + 1));
    [names[i], names[j]] = [names[j] ?? '', names[i] ?? ''];
  }
  const named: (string | null)[] = nodes.map((n) => n.name);
  const regions: RegionData[] = [];
  const signs: SignData[] = [];
  const deadEnds: Position[] = [];
  nodes.forEach((n, i) => {
    if (!n.crossroad) return;
    if (n.edges.length === 1) deadEnds.push(n.at);
    if (n.edges.length < 3) return;
    const name = names.shift();
    if (!name) return;
    named[i] = name;
    regions.push({ name, x: n.at.x - 4, y: n.at.y - 4, width: 9, height: 9, wild: true });
  });

  nodes.forEach((n, i) => {
    const name = named[i];
    if (!n.crossroad || !name) return;
    const branches = new Map<string, string>();
    for (const edge of n.edges) {
      const toward = edge.path[Math.min(edge.path.length - 1, 14)] ?? n.at;
      const where = nearestNamed(edge.to, i, edge.path.length);
      if (!where) continue;
      const dir = heading(toward.x - n.at.x, toward.y - n.at.y);
      const before = branches.get(dir);
      branches.set(dir, before && before !== where ? `${before} y ${where}` : where);
    }
    const lines = [...branches].map(([dir, where]) => `${dir.replace(/^el /, 'Al ')}: ${where}`);
    signpost(n.at, `${name}\n${lines.join('\n')}`);
  });
  for (const j of junctions) {
    const where = nearestNamed(j.far, -1, 0);
    if (!where) continue;
    const dir = heading(j.toward.x - j.at.x, j.toward.y - j.at.y);
    signpost(j.at, `Desvío ${dir.replace(/^el /, 'al ')}: ${where}.`);
  }

  /** El nombre más cercano, por el camino, saliendo de `start` (sin volver por `from`). */
  function nearestNamed(start: number, from: number, already: number): string | null {
    const best = new Map<number, number>([[start, already]]);
    const open = [start];
    while (open.length > 0) {
      open.sort((p, q) => (best.get(p) ?? 0) - (best.get(q) ?? 0));
      const at = open.shift() ?? start;
      const name = named[at];
      if (name) return name;
      const d = best.get(at) ?? 0;
      for (const e of nodes[at]?.edges ?? []) {
        if (e.to === from) continue;
        const nd = d + e.path.length;
        if (nd < (best.get(e.to) ?? Infinity)) {
          best.set(e.to, nd);
          open.push(e.to);
        }
      }
    }
    return null;
  }

  /** Un cartel al costado del camino, cerca de `at` (no se pisan dos carteles). */
  function signpost(at: Position, text: string): void {
    if (signs.some((s) => Math.hypot(s.x - at.x, s.y - at.y) < 10)) return;
    for (let r = 2; r <= 4; r++)
      for (const [dx, dy] of [
        [-r, 0],
        [0, -r],
        [r, 0],
        [0, r],
        [-r, -r],
        [r, r],
      ] as const) {
        const x = Math.round(at.x) + dx;
        const y = Math.round(at.y) + dy;
        if (!inside(x, y)) continue;
        const i = index(x, y);
        if (roads.has(i) || townMask[i] || regionMask[i] || isWater(terrain[i])) continue;
        const kind = statics.get(i)?.kind;
        if (kind === 'mountain' || kind === 'sign' || kind === 'cave-entrance') continue;
        statics.set(i, { kind: 'sign', x, y });
        signs.push({ x, y, text });
        return;
      }
  }

  const linked = new Set<string>();
  for (const n of nodes) if (n.name && n.town === null && n.edges.length > 0) linked.add(n.name);
  return { regions, signs, tiles, deadEnds, linked };
}

/** El suelo del camino: tierra apisonada (en la nieve y la arena, el mismo suelo). */
function pathGround(ground: Terrain | undefined): Terrain {
  if (ground === Terrain.Snow || ground === Terrain.Sand) return ground;
  return Terrain.Path;
}

/** A qué tierra (continente, isla) pertenece cada tile; -1 en el mar. */
function landmasses(width: number, height: number, biomes: readonly Biome[]): Int32Array {
  const total = width * height;
  const land = new Int32Array(total).fill(-1);
  let next = 0;
  const queue = new Int32Array(total);
  for (let start = 0; start < total; start++) {
    if (land[start] !== -1 || biomes[start] === 'ocean' || biomes[start] === undefined) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    land[start] = next;
    while (head < tail) {
      const i = queue[head++] ?? 0;
      const x = i % width;
      const y = (i - x) / width;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (land[j] !== -1 || biomes[j] === 'ocean') continue;
        land[j] = next;
        queue[tail++] = j;
      }
    }
    next++;
  }
  return land;
}
