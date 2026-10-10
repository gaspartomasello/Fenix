import {
  type NpcRole,
  Terrain,
  TileMap,
  type Position,
  type RegionData,
  type SignData,
  type StaticKind,
  type StaticPlacement,
} from '@fenix/shared';
import { cheapestPath } from './roads';
import type { MapRegion, PlacedItem } from './tiled-map-loader';

export interface GeneratedWorld {
  readonly map: TileMap;
  readonly spawnPoint: Position;
  /** Objetos sueltos puestos en el mapa, en coordenadas del mundo. */
  readonly items: readonly PlacedItem[];
  readonly npcs: readonly {
    readonly role: NpcRole;
    readonly position: Position;
    readonly name?: string;
  }[];
}

/** Región del continente: qué crece y quién vive en cada lugar. */
export type Biome =
  | 'ocean'
  | 'beach'
  | 'grassland'
  | 'forest'
  | 'mountain'
  | 'foothill'
  | 'swamp'
  | 'desert'
  | 'snow';

/** Clima que se le pide al terreno alrededor de un pueblo. */
export type TownClimate = 'temperate' | 'mountain' | 'swamp';

/** Un pueblo diseñado en Tiled y dónde va en el continente. */
export interface TownPlan {
  readonly map: MapRegion;
  /** Centro del pueblo como fracción del mapa (0 a 1). */
  readonly at: Position;
  readonly climate: TownClimate;
  /** La capital: ahí aparecen los jugadores nuevos. */
  readonly capital?: boolean;
}

export interface WorldGenerationOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly towns?: readonly TownPlan[];
}

/** Un pueblo ya ubicado. */
export interface PlacedTown {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly climate: TownClimate;
}

/** Lo que el generador deja armado para ubicar lugares y criaturas encima. */
export interface Continent extends GeneratedWorld {
  readonly biomes: readonly Biome[];
  readonly towns: readonly PlacedTown[];
  /** Tiles de camino (para no tapar caminos con lugares). */
  readonly roads: ReadonlySet<number>;
  /** Tiles de camino que pasan junto a una cordillera. */
  readonly passes: readonly Position[];
}

/** Nivel del mar en el campo de elevación (0 a 1). */
const SEA = 0.4;
/** Lo que cuesta doblar al trazar un camino: tramos largos y rectos. */
const ROAD_TURN = 6;
/** Los caminos van empedrados hasta esta distancia de un pueblo. */
const PAVED_NEAR_TOWN = 24;
/** Radio de tierra firme y clima propio alrededor de cada pueblo. */
const TOWN_INFLUENCE = 34;

/**
 * Genera un continente: la elevación decide el mar, las costas y las
 * cordilleras; la latitud y la humedad, el bioma (nieve al norte, desierto al
 * sur, pantanos en lo bajo y húmedo, bosques y praderas en el resto). Los
 * ríos bajan de las montañas al mar. Encima se estampan los pueblos de Tiled
 * y se trazan caminos entre ellos, con puentes y carteles.
 */
export function generateIslandMap(options: WorldGenerationOptions): Continent {
  const { width, height, seed } = options;
  const size = Math.min(width, height);
  const total = width * height;
  const index = (x: number, y: number): number => y * width + x;

  const towns = (options.towns ?? []).map((plan) => {
    const cx = Math.round(plan.at.x * width);
    const cy = Math.round(plan.at.y * height);
    const x = Math.max(
      2,
      Math.min(width - plan.map.width - 2, cx - Math.floor(plan.map.width / 2)),
    );
    const y = Math.max(
      2,
      Math.min(height - plan.map.height - 2, cy - Math.floor(plan.map.height / 2)),
    );
    return { plan, x, y, cx: x + plan.map.width / 2, cy: y + plan.map.height / 2 };
  });
  const inTown = (x: number, y: number, margin = 0): boolean =>
    towns.some(
      (t) =>
        x >= t.x - margin &&
        y >= t.y - margin &&
        x < t.x + t.plan.map.width + margin &&
        y < t.y + t.plan.map.height + margin,
    );
  const townInfluence = (x: number, y: number, climate?: TownClimate): number => {
    let best = 0;
    for (const t of towns) {
      if (climate && t.plan.climate !== climate) continue;
      const d = Math.hypot(x - t.cx, y - t.cy);
      best = Math.max(best, 1 - d / TOWN_INFLUENCE);
    }
    return best;
  };

  // ── Campos: elevación, cordilleras, frío y humedad ──
  const shape = [
    new ValueNoise(seed, Math.max(8, size / 5)),
    new ValueNoise(seed + 1, Math.max(5, size / 11)),
    new ValueNoise(seed + 2, Math.max(3, size / 26)),
  ];
  const ridges = new ValueNoise(seed + 3, Math.max(6, size / 8));
  const ridgeDetail = new ValueNoise(seed + 4, Math.max(3, size / 22));
  // Solo algunas regiones tienen cordilleras: el resto del continente queda abierto.
  const ranges = new ValueNoise(seed + 11, Math.max(10, size / 4));
  const chill = new ValueNoise(seed + 5, Math.max(6, size / 7));
  const wetness = new ValueNoise(seed + 6, Math.max(6, size / 6));
  const forests = new ValueNoise(seed + 7, 14);
  const conifers = new ValueNoise(seed + 8, 20);
  const puddles = new ValueNoise(seed + 9, 5);
  const patches = new ValueNoise(seed + 10, 7);

  const elevation = new Float32Array(total);
  const biomes: Biome[] = new Array<Biome>(total).fill('ocean');
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const base =
        (shape[0]?.at(x, y) ?? 0) * 0.55 +
        (shape[1]?.at(x, y) ?? 0) * 0.3 +
        (shape[2]?.at(x, y) ?? 0) * 0.15;
      const dx = (x - width / 2) / (width / 2);
      const dy = (y - height / 2) / (height / 2);
      const falloff = smoothstep(0.68, 1.05, Math.hypot(dx, dy));
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
      const coastGuard = edge < 3 ? 1 : 0;
      elevation[index(x, y)] =
        base + 0.12 - falloff * 0.62 + townInfluence(x, y) * 0.3 - coastGuard;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = index(x, y);
      const e = elevation[i] ?? 0;
      if (e < SEA) continue;
      const cold = 1 - y / height + (chill.at(x, y) - 0.5) * 0.18;
      const wet = wetness.at(x, y) + townInfluence(x, y, 'swamp') * 0.45;
      const ridge =
        1 -
        Math.abs(2 * ridges.at(x, y) - 1) * 0.8 -
        Math.abs(2 * ridgeDetail.at(x, y) - 1) * 0.2 +
        mountainRing(x, y) * 0.5;
      const nearTown = inTown(x, y, 5);
      const marsh = townInfluence(x, y, 'swamp');
      let biome: Biome;
      if (e < SEA + 0.02) biome = 'beach';
      else if (
        !nearTown &&
        ridge > 0.94 &&
        e > SEA + 0.1 &&
        (ranges.at(x, y) > 0.7 || mountainRing(x, y) > 0)
      )
        biome = 'mountain';
      else if (marsh > 0 && marsh + (wet - 0.5) * 0.4 > 0.06) biome = 'swamp';
      else if (cold > 0.8) biome = 'snow';
      else if (cold < 0.27 && wet < 0.62) biome = 'desert';
      else if (wet > 0.66 && e < SEA + 0.2 + townInfluence(x, y, 'swamp') * 0.35) biome = 'swamp';
      else biome = forests.at(x, y) > 0.68 ? 'forest' : 'grassland';
      biomes[i] = biome;
    }
  }
  // Sin cordones finos de montaña (parecen cercos): solo quedan los macizos.
  const massif = (x: number, y: number): boolean =>
    neighbors8(x, y).filter(([nx, ny]) => biomes[index(nx, ny)] === 'mountain').length >= 5;
  const core = new Uint8Array(total);
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++)
      if (biomes[index(x, y)] === 'mountain' && massif(x, y)) core[index(x, y)] = 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = index(x, y);
      if (biomes[i] !== 'mountain') continue;
      const kept = core[i] || neighbors8(x, y).some(([nx, ny]) => core[index(nx, ny)]);
      if (!kept) biomes[i] = (forests.at(x, y) > 0.68 ? 'forest' : 'grassland') as Biome;
    }
  }
  // El suelo de cada bioma, antes de marcar el pie de las montañas (que conserva el suyo).
  const ground: Terrain[] = biomes.map((b) => terrainOf(b));
  // Al pie de las montañas: algo de piedra y pinos, sobre el suelo de la zona.
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = index(x, y);
      const biome = biomes[i];
      if (biome === 'mountain' || biome === 'ocean' || biome === 'beach') continue;
      if (neighbors8(x, y).some(([nx, ny]) => biomes[index(nx, ny)] === 'mountain'))
        biomes[i] = 'foothill';
    }
  }

  /** Alrededor del pueblo de montaña, un arco de cordillera abierto hacia la capital. */
  function mountainRing(x: number, y: number): number {
    let best = 0;
    for (const t of towns) {
      if (t.plan.climate !== 'mountain') continue;
      const d = Math.hypot(x - t.cx, y - t.cy);
      if (d < 18 || d > 34) continue;
      const capital = towns.find((c) => c.plan.capital) ?? t;
      const toCapital = Math.atan2(capital.cy - t.cy, capital.cx - t.cx);
      const angle = Math.atan2(y - t.cy, x - t.cx);
      const gap = Math.abs(Math.atan2(Math.sin(angle - toCapital), Math.cos(angle - toCapital)));
      if (gap < 0.9) continue;
      best = Math.max(best, 1 - Math.abs(d - 26) / 8);
    }
    return best;
  }

  // ── Terreno según el bioma ──
  const terrain: Terrain[] = new Array<Terrain>(total).fill(Terrain.Water);
  for (let i = 0; i < total; i++) terrain[i] = ground[i] ?? Terrain.Water;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = index(x, y);
      if (biomes[i] === 'swamp' && puddles.at(x, y) > 0.7) terrain[i] = Terrain.Water;
      else if (biomes[i] === 'grassland' && patches.at(x, y) > 0.9) terrain[i] = Terrain.Dirt;
      else if (biomes[i] === 'desert' && patches.at(x, y) > 0.88) terrain[i] = Terrain.Dirt;
    }
  }

  // ── Ríos: bajan desde la montaña buscando siempre lo más bajo ──
  const river = new Uint8Array(total);
  const sources = riverSources();
  for (const source of sources) carveRiver(source);

  function riverSources(): Position[] {
    const wanted = Math.max(1, Math.round(size / 70));
    const candidates: Position[] = [];
    for (let y = 4; y < height - 4; y += 3) {
      for (let x = 4; x < width - 4; x += 3) {
        if (biomes[index(x, y)] !== 'foothill' || inTown(x, y, 10)) continue;
        candidates.push({ x, y });
      }
    }
    candidates.sort((a, b) => hash(seed + 21, a.x, a.y) - hash(seed + 21, b.x, b.y));
    const chosen: Position[] = [];
    for (const c of candidates) {
      if (chosen.length >= wanted) break;
      if (chosen.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > size / 5)) chosen.push(c);
    }
    return chosen;
  }

  function carveRiver(source: Position): void {
    let { x, y } = source;
    const visited = new Set<number>();
    for (let step = 0; step < size * 4; step++) {
      const i = index(x, y);
      visited.add(i);
      if ((elevation[i] ?? 0) < SEA || (terrain[i] === Terrain.Water && step > 0 && !river[i]))
        return;
      setRiver(x, y);
      // Más abajo se ensancha.
      if (step > 25) setRiver(x + 1, y);
      let next: Position | null = null;
      let lowest = Infinity;
      for (const [nx, ny] of neighbors4(x, y)) {
        const ni = index(nx, ny);
        if (visited.has(ni) || biomes[ni] === 'mountain' || inTown(nx, ny, 2)) continue;
        const e = (elevation[ni] ?? 0) + hash(seed + 23, nx, ny) * 0.004;
        if (e < lowest) {
          lowest = e;
          next = { x: nx, y: ny };
        }
      }
      if (!next) {
        // Encerrado: el río termina en una laguna.
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5) setRiver(x + dx, y + dy);
        return;
      }
      x = next.x;
      y = next.y;
    }
  }

  function setRiver(x: number, y: number): void {
    if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1 || inTown(x, y, 1)) return;
    const i = index(x, y);
    if (biomes[i] === 'mountain') return;
    terrain[i] = Terrain.Water;
    river[i] = 1;
  }

  // ── Vegetación y rocas ──
  const statics = new Map<number, StaticPlacement>();
  const place = (x: number, y: number, kind: StaticKind): void => {
    statics.set(index(x, y), { kind, x, y });
  };
  const nearWater = (x: number, y: number): boolean =>
    neighbors8(x, y).some(([nx, ny]) => terrain[index(nx, ny)] === Terrain.Water);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = index(x, y);
      const biome = biomes[i] ?? 'ocean';
      if (terrain[i] === Terrain.Water) continue;
      const roll = hash(seed, x, y);
      const pick = hash(seed + 11, x, y);
      if (biome === 'mountain') {
        place(x, y, 'mountain');
        continue;
      }
      const kind = vegetation(
        biome,
        terrain[i],
        roll,
        pick,
        forests.at(x, y),
        conifers.at(x, y),
        nearWater(x, y),
      );
      if (kind) place(x, y, kind);
    }
  }

  // ── Pueblos ──
  const regions: RegionData[] = [];
  const items: PlacedItem[] = [];
  const npcs: { role: NpcRole; position: Position; name?: string }[] = [];
  let spawnPoint: Position = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  for (const { plan, x: ox, y: oy } of towns) {
    const town = plan.map;
    for (let y = oy - 1; y < oy + town.height + 1; y++)
      for (let x = ox - 1; x < ox + town.width + 1; x++) statics.delete(index(x, y));
    town.terrain.forEach((tile, i) => {
      const x = ox + (i % town.width);
      const y = oy + Math.floor(i / town.width);
      // Lo que el pueblo deja vacío toma el terreno de su clima.
      terrain[index(x, y)] = tile ?? climateGround(plan.climate);
    });
    for (const s of town.statics) place(s.x + ox, s.y + oy, s.kind);
    regions.push(...town.regions.map((r) => ({ ...r, x: r.x + ox, y: r.y + oy })));
    if (plan.capital && town.spawn) spawnPoint = { x: town.spawn.x + ox, y: town.spawn.y + oy };
    npcs.push(
      ...town.npcs.map((n) => ({ ...n, position: { x: n.position.x + ox, y: n.position.y + oy } })),
    );
    items.push(
      ...town.items.map((it) => ({
        ...it,
        position: { x: it.position.x + ox, y: it.position.y + oy },
      })),
    );
  }
  if (towns.length === 0) {
    // Sin pueblos: una plaza empedrada en el centro, sobre tierra firme.
    const c = spawnPoint;
    for (let y = c.y - 6; y <= c.y + 6; y++) {
      for (let x = c.x - 6; x <= c.x + 6; x++) {
        terrain[index(x, y)] = Terrain.Stone;
        statics.delete(index(x, y));
      }
    }
    for (let y = c.y - 7; y <= c.y + 7; y++)
      for (let x = c.x - 7; x <= c.x + 7; x++) statics.delete(index(x, y));
  }

  // ── Caminos entre los pueblos, con puentes y carteles ──
  const roads = new Set<number>();
  const passes: Position[] = [];
  const signs: SignData[] = [];
  const placed = towns.map((t) => ({
    name: t.plan.map.regions[0]?.name ?? 'pueblo',
    x: t.x,
    y: t.y,
    width: t.plan.map.width,
    height: t.plan.map.height,
    climate: t.plan.climate,
  }));
  const posts: [Position, Position[], string][] = [];
  const links: [number, number][] = [];
  for (let a = 0; a < placed.length; a++)
    for (let b = a + 1; b < placed.length; b++) links.push([a, b]);
  for (const [a, b] of links) {
    const from = placed[a];
    const to = placed[b];
    if (!from || !to) continue;
    const start = gate(from, to);
    const end = gate(to, from);
    const path = cheapestPath(width, height, start, end, roadCost, ROAD_TURN);
    if (!path) continue;
    for (const p of path) carveRoad(p.x, p.y);
    posts.push([start, path, to.name], [end, [...path].reverse(), from.name]);
  }
  // Los carteles van al final, cuando ya no se abren más caminos que los tapen.
  for (const [start, path, destination] of posts) signpost(start, path, destination);

  /** La salida del pueblo que mira hacia el otro (los pueblos tienen caminos al medio de cada lado). */
  function gate(town: PlacedTown, toward: PlacedTown): Position {
    const cx = town.x + Math.floor(town.width / 2);
    const cy = town.y + Math.floor(town.height / 2);
    const dx = toward.x + toward.width / 2 - cx;
    const dy = toward.y + toward.height / 2 - cy;
    if (Math.abs(dx) > Math.abs(dy))
      return dx > 0 ? { x: town.x + town.width, y: cy } : { x: town.x - 1, y: cy };
    return dy > 0 ? { x: cx, y: town.y + town.height } : { x: cx, y: town.y - 1 };
  }

  function roadCost(x: number, y: number): number {
    const i = index(x, y);
    if (inTown(x, y)) return Infinity;
    if (roads.has(i)) return 0.3;
    const biome = biomes[i];
    if (biome === 'ocean') return Infinity;
    if (terrain[i] === Terrain.Water) return river[i] ? 14 : 30;
    if (biome === 'mountain') return 70;
    if (biome === 'swamp') return 3;
    if (biome === 'forest' || biome === 'foothill' || biome === 'snow') return 1.25;
    if (biome === 'desert' || biome === 'beach') return 1.15;
    return 1;
  }

  /** Un camino de tres tiles de ancho, despejado a los costados. */
  function carveRoad(x: number, y: number): void {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (inTown(px, py) || px < 1 || py < 1 || px >= width - 1 || py >= height - 1) continue;
        const i = index(px, py);
        if (biomes[i] === 'ocean') continue;
        if (biomes[i] === 'mountain') biomes[i] = 'foothill';
        // Un camino entre montañas: candidato a paso.
        if (neighbors8(px, py).some(([nx, ny]) => biomes[index(nx, ny)] === 'mountain'))
          passes.push({ x: px, y: py });
        // Sobre el agua, un puente de tablones; cerca de los pueblos, empedrado.
        terrain[i] =
          terrain[i] === Terrain.Water || terrain[i] === Terrain.Wood
            ? Terrain.Wood
            : nearTownEdge(px, py) <= PAVED_NEAR_TOWN
              ? Terrain.Stone
              : roadGround(biomes[i]);
        statics.delete(i);
        roads.add(i);
      }
    }
    // Banquinas: dos tiles a cada lado sin árboles ni piedras.
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const kind = statics.get(index(x + dx, y + dy))?.kind;
        if (kind && kind !== 'mountain' && !inTown(x + dx, y + dy))
          statics.delete(index(x + dx, y + dy));
      }
  }

  /** Distancia (en tiles) al borde del pueblo más cercano. */
  function nearTownEdge(x: number, y: number): number {
    let best = Infinity;
    for (const t of towns) {
      const dx = Math.max(t.x - x, 0, x - (t.x + t.plan.map.width - 1));
      const dy = Math.max(t.y - y, 0, y - (t.y + t.plan.map.height - 1));
      best = Math.min(best, Math.max(dx, dy));
    }
    return best;
  }

  /** Un cartel al costado del camino, unos pasos afuera del pueblo. */
  function signpost(start: Position, path: readonly Position[], destination: string): void {
    const at = path[Math.min(3, path.length - 1)] ?? start;
    for (const [dx, dy] of [
      [-2, 0],
      [0, -2],
      [2, 0],
      [0, 2],
      [-3, 0],
      [3, 0],
    ] as const) {
      const x = at.x + dx;
      const y = at.y + dy;
      const i = index(x, y);
      if (roads.has(i) || inTown(x, y) || terrain[i] === Terrain.Water) continue;
      place(x, y, 'sign');
      signs.push({ x, y, text: `Camino a ${destination}` });
      return;
    }
  }

  const map = new TileMap({
    width,
    height,
    terrain,
    statics: [...statics.values()],
    regions,
    signs,
  });
  return { map, spawnPoint, items, npcs, biomes, towns: placed, roads, passes };

  function neighbors4(x: number, y: number): [number, number][] {
    return (
      [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as [number, number][]
    ).filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < width && ny < height);
  }

  function neighbors8(x: number, y: number): [number, number][] {
    const out: [number, number][] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height) out.push([nx, ny]);
      }
    return out;
  }
}

function terrainOf(biome: Biome): Terrain {
  switch (biome) {
    case 'ocean':
      return Terrain.Water;
    case 'beach':
    case 'desert':
      return Terrain.Sand;
    case 'mountain':
    case 'foothill':
      return Terrain.Dirt;
    case 'snow':
      return Terrain.Snow;
    case 'swamp':
      return Terrain.Swamp;
    default:
      return Terrain.Grass;
  }
}

/** El suelo de un camino según por dónde pasa. */
function roadGround(biome: Biome | undefined): Terrain {
  if (biome === 'snow') return Terrain.Snow;
  if (biome === 'desert' || biome === 'beach') return Terrain.Sand;
  return Terrain.Dirt;
}

/** Lo que no pinta el mapa de Tiled de un pueblo toma el suelo de su clima. */
function climateGround(climate: TownClimate): Terrain {
  if (climate === 'swamp') return Terrain.Swamp;
  if (climate === 'mountain') return Terrain.Dirt;
  return Terrain.Grass;
}

/**
 * Qué crece en un tile según el bioma. `roll` decide si hay algo y `pick`
 * qué especie; los bosques son densos donde el ruido es alto.
 */
function vegetation(
  biome: Biome,
  ground: Terrain | undefined,
  roll: number,
  pick: number,
  forest: number,
  conifer: number,
  wet: boolean,
): StaticKind | null {
  switch (biome) {
    case 'beach':
      return roll < 0.004 ? 'rock' : null;
    case 'foothill':
      if (roll < 0.025) return 'rock';
      if (roll < 0.06) return 'pine';
      return null;
    case 'snow':
      // Bosquecillos con claros, no una pared de pinos.
      if (forest > 0.62 && roll < 0.2) return 'snow-pine';
      if (roll < 0.015) return 'snow-pine';
      if (roll < 0.018) return 'rock';
      return null;
    case 'desert':
      if (ground === Terrain.Dirt) return roll < 0.006 ? 'rock' : null;
      if (roll < 0.012) return 'cactus';
      if (roll < 0.015) return 'rock';
      if (roll < 0.017) return 'dead-tree';
      return null;
    case 'swamp':
      if (roll < 0.07) return 'reeds';
      if (roll < 0.09) return 'willow';
      if (roll < 0.105) return 'dead-tree';
      return null;
    case 'grassland':
    case 'forest': {
      if (ground === Terrain.Dirt) return roll < 0.004 ? 'rock' : null;
      if (wet) return roll < 0.05 ? (pick < 0.55 ? 'willow' : 'ceibo') : null;
      if (biome === 'forest') {
        // Bosque abierto: árboles con espacio entre ellos para pasar.
        if (roll < 0.2) return conifer > 0.55 ? 'pine' : pick < 0.05 ? 'dead-tree' : 'oak';
        if (roll < 0.23) return 'bush';
        return null;
      }
      if (roll < 0.014) return conifer > 0.55 ? 'pine' : loneTree(pick);
      if (roll < 0.024) return 'bush';
      if (roll < 0.04) return 'flowers';
      if (roll < 0.042) return 'rock';
      return null;
    }
    default:
      return null;
  }
}

/** Árbol suelto en el campo. */
function loneTree(pick: number): StaticKind {
  if (pick < 0.5) return 'oak';
  if (pick < 0.68) return 'gomero';
  if (pick < 0.82) return 'poplar';
  if (pick < 0.94) return 'ceibo';
  return 'dead-tree';
}

export function hash(seed: number, x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed + 7, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ruido de valor 2D suavizado sobre una grilla de `cell` tiles. */
class ValueNoise {
  constructor(
    private readonly seed: number,
    private readonly cell: number,
  ) {}

  at(x: number, y: number): number {
    const gx = x / this.cell;
    const gy = y / this.cell;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = smooth(gx - x0);
    const ty = smooth(gy - y0);
    const top = lerp(hash(this.seed, x0, y0), hash(this.seed, x0 + 1, y0), tx);
    const bottom = lerp(hash(this.seed, x0, y0 + 1), hash(this.seed, x0 + 1, y0 + 1), tx);
    return lerp(top, bottom, ty);
  }
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => t * t * (3 - 2 * t);
const smoothstep = (a: number, b: number, t: number): number =>
  smooth(Math.max(0, Math.min(1, (t - a) / (b - a))));
