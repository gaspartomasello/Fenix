import type { CreatureKind } from '@fenix/shared/creatures/creature-catalog';
import type { NpcRole } from '@fenix/shared/economy/vendors';
import type { Position } from '@fenix/shared/geometry/position';
import type { StaticKind, StaticPlacement } from '@fenix/shared/world/statics';
import { isWater, Terrain } from '@fenix/shared/world/terrain';
import { TileMap, type RegionData, type SignData } from '@fenix/shared/world/tile-map';
import { cheapestPath, curvePath } from './roads';
import type { Descent, MapRegion, PlacedItem } from './tiled-map-loader';
import type { Ascent } from './upper-floors';

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
  | 'snow'
  | 'tundra'
  | 'jungle'
  | 'savanna'
  | 'badlands'
  | 'meadow'
  | 'plains'
  /** Las Tierras de Ceniza: valle negro de la isla grande, amurallado por montañas. */
  | 'wasteland';

/** Clima que se le pide al terreno alrededor de un pueblo. */
export type TownClimate = 'temperate' | 'mountain' | 'swamp' | 'jungle';

/** Un pueblo diseñado en Tiled y dónde va en el continente. */
export interface TownPlan {
  readonly map: MapRegion;
  /** Centro del pueblo como fracción del mapa (0 a 1). */
  readonly at: Position;
  readonly climate: TownClimate;
  /** La capital: ahí aparecen los jugadores nuevos. */
  readonly capital?: boolean;
  /** Ciudad puerto: su borde sur es mar y se abre un canal hasta el mar abierto. */
  readonly harbor?: boolean;
}

export interface WorldGenerationOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly towns?: readonly TownPlan[];
  /** `jungle`: el continente de la selva (ver `JungleShape`); si no, según las medidas. */
  readonly shape?: 'jungle';
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
  /** Criaturas que viven dentro de los pueblos (los cementerios). */
  readonly townCreatures: readonly { readonly kind: CreatureKind; readonly home: Position }[];
  /** Bajadas de los pueblos (criptas, alcantarilla), ya en coordenadas del mapa. */
  readonly descents: readonly Descent[];
  /** Subidas a pisos altos de los pueblos, ya en coordenadas del mapa. */
  readonly ascents: readonly Ascent[];
}

/** Suelos naturales que se entreveran en los bordes (los pisos y el agua no). */
const NATURAL: ReadonlySet<Terrain> = new Set<Terrain>([
  Terrain.Grass,
  Terrain.Dirt,
  Terrain.Sand,
  Terrain.Snow,
  Terrain.Swamp,
  Terrain.Tundra,
  Terrain.Jungle,
  Terrain.DryGrass,
  Terrain.Meadow,
  Terrain.Clay,
  Terrain.Mud,
  Terrain.Salt,
  Terrain.Gravel,
  Terrain.Leaves,
  Terrain.SparseGrass,
]);
/** Suelos verdes: del lado de ellos aparece el suelo mezclado. */
const GREENS: ReadonlySet<Terrain> = new Set<Terrain>([
  Terrain.Grass,
  Terrain.Meadow,
  Terrain.DryGrass,
  Terrain.Jungle,
  Terrain.Leaves,
  Terrain.Tundra,
]);
/** El suelo intermedio entre un verde y este vecino. */
const MIXES: ReadonlyMap<Terrain, Terrain> = new Map<Terrain, Terrain>([
  [Terrain.Snow, Terrain.SnowyGrass],
  [Terrain.Sand, Terrain.SandyGrass],
  [Terrain.Salt, Terrain.SandyGrass],
  [Terrain.Dirt, Terrain.SparseGrass],
  [Terrain.Clay, Terrain.SparseGrass],
  [Terrain.Gravel, Terrain.SparseGrass],
]);

/** Escalones de altura más altos (las cumbres). Cada escalón sube dos pixeles en pantalla. */
const MAX_LEVEL = 80;
/** Escalones que puede subir una ladera de un tile al vecino. */
const SLOPE = 4;
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
  // Llanuras abiertas (sin árboles, para construir), prados y tierras rojas dentro de los biomas.
  const openness = new ValueNoise(seed + 12, Math.max(10, size / 9));
  const meadows = new ValueNoise(seed + 13, Math.max(8, size / 12));
  // Claros lisos: zonas sin ninguna planta ni piedra, donde entra una casa.
  const clearings = new ValueNoise(seed + 14, Math.max(9, size / 16));
  const reds = new ValueNoise(seed + 14, Math.max(8, size / 10));
  // Matices del suelo: que los verdes no sean todos iguales.
  const greens = new ValueNoise(seed + 15, 6);
  const salts = new ValueNoise(seed + 16, Math.max(6, size / 14));
  const wander = wanderField(seed, size);
  // Bordes entre suelos: se deforman y se entreveran (transiciones graduales).
  const blendX = new ValueNoise(seed + 25, 5);
  const blendY = new ValueNoise(seed + 26, 5);
  const shoreWidth = new ValueNoise(seed + 27, 11);

  // Un mapa más alto que ancho es un continente alargado de norte a sur (ver `ElongatedShape`).
  const jungle = options.shape === 'jungle' ? new JungleShape(width, height, seed) : null;
  const elongated =
    !jungle && height > width * 1.2 ? new ElongatedShape(width, height, seed) : null;
  const elevation = new Float32Array(total);
  const biomes: Biome[] = new Array<Biome>(total).fill('ocean');
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const base =
        (shape[0]?.at(x, y) ?? 0) * 0.55 +
        (shape[1]?.at(x, y) ?? 0) * 0.3 +
        (shape[2]?.at(x, y) ?? 0) * 0.15;
      let land: number;
      if (jungle) {
        land = jungle.land(x, y);
      } else if (elongated) {
        land = elongated.land(x, y);
      } else {
        const dx = (x - width / 2) / (width / 2);
        const dy = (y - height / 2) / (height / 2);
        land = -smoothstep(0.68, 1.05, Math.hypot(dx, dy)) * 0.62;
      }
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
      const coastGuard = edge < 3 ? 1 : 0;
      elevation[index(x, y)] = base + 0.12 + land + townInfluence(x, y) * 0.3 - coastGuard;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = index(x, y);
      const e = elevation[i] ?? 0;
      if (e < SEA) continue;
      const cold =
        (elongated ? elongated.cold(y) : 1 - y / height) +
        (chill.at(x, y) - 0.5) * (elongated ? 0.34 : 0.18);
      const wet = wetness.at(x, y) + townInfluence(x, y, 'swamp') * 0.45;
      const ridge =
        1 -
        Math.abs(2 * ridges.at(x, y) - 1) * 0.8 -
        Math.abs(2 * ridgeDetail.at(x, y) - 1) * 0.2 +
        mountainRing(x, y) * 0.5 +
        (elongated?.cordillera(x, y) ?? 0) * 0.6 +
        (jungle?.highlands(x, y) ?? 0) * 0.6;
      const nearTown = inTown(x, y, 5);
      const marsh = townInfluence(x, y, 'swamp');
      let biome: Biome;
      if (e < SEA + 0.02) biome = 'beach';
      else if (
        !nearTown &&
        ridge > 0.94 &&
        e > SEA + 0.1 &&
        (ranges.at(x, y) > 0.7 ||
          mountainRing(x, y) > 0 ||
          (elongated?.cordillera(x, y) ?? 0) > 0.3 ||
          (jungle?.highlands(x, y) ?? 0) > 0.3)
      )
        biome = 'mountain';
      else if (marsh > 0 && marsh + (wet - 0.5) * 0.4 > 0.06) biome = 'swamp';
      else if (jungle) biome = jungle.biome(e - SEA, wet, x, y);
      else if (cold > 0.8) biome = 'snow';
      else if (cold > 0.7) biome = 'tundra';
      else if (cold < 0.27 && wet > (elongated ? 0.7 : 0.64)) biome = 'jungle';
      else if (cold < 0.27) biome = reds.at(x, y) > 0.68 ? 'badlands' : 'desert';
      else if (cold < 0.38 && wet < (elongated ? 0.6 : 0.52)) biome = 'savanna';
      else if (wet > 0.66 && e < SEA + 0.2 + townInfluence(x, y, 'swamp') * 0.35) biome = 'swamp';
      else biome = temperate(x, y);
      // Las Tierras de Ceniza mandan sobre el clima: anillo de montañas, valle negro y volcán.
      const ash = elongated?.ashlandPart(x, y);
      if (ash === 'wall' || ash === 'cone') biome = 'mountain';
      else if (ash) biome = 'wasteland';
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
      if (!kept) biomes[i] = temperate(x, y);
    }
  }
  // El suelo de cada bioma, antes de marcar el pie de las montañas (que conserva el suyo).
  const ground: Terrain[] = biomes.map((b) => terrainOf(b));
  // Al pie de las montañas: algo de piedra y pinos, sobre el suelo de la zona.
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = index(x, y);
      const biome = biomes[i];
      if (biome === 'mountain' || biome === 'ocean' || biome === 'beach' || biome === 'wasteland')
        continue;
      if (neighbors8(x, y).some(([nx, ny]) => biomes[index(nx, ny)] === 'mountain'))
        biomes[i] = 'foothill';
    }
  }

  /** Tierras templadas: bosque, llanura abierta (sin árboles), prado o pradera. */
  function temperate(x: number, y: number): Biome {
    if (forests.at(x, y) > 0.68) return 'forest';
    if (openness.at(x, y) > 0.6) return 'plains';
    if (meadows.at(x, y) > 0.66) return 'meadow';
    return 'grassland';
  }

  /** Alrededor del pueblo de montaña, un arco de cordillera abierto hacia la capital. */
  function mountainRing(x: number, y: number): number {
    let best = 0;
    for (const t of towns) {
      if (t.plan.climate !== 'mountain') continue;
      const d = Math.hypot(x - t.cx, y - t.cy);
      // El arco empieza un poco afuera del pueblo, sea del tamaño que sea.
      const inner = Math.max(t.plan.map.width, t.plan.map.height) / 2 + 3;
      if (d < inner || d > inner + 16) continue;
      const capital = towns.find((c) => c.plan.capital) ?? t;
      const toCapital = Math.atan2(capital.cy - t.cy, capital.cx - t.cx);
      const angle = Math.atan2(y - t.cy, x - t.cx);
      const gap = Math.abs(Math.atan2(Math.sin(angle - toCapital), Math.cos(angle - toCapital)));
      if (gap < 0.9) continue;
      best = Math.max(best, 1 - Math.abs(d - inner - 8) / 8);
    }
    return best;
  }

  // ── Terreno según el bioma ──
  const terrain: Terrain[] = new Array<Terrain>(total).fill(Terrain.Water);
  for (let i = 0; i < total; i++) terrain[i] = ground[i] ?? Terrain.Water;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = index(x, y);
      const biome = biomes[i];
      const p = patches.at(x, y);
      const g = greens.at(x, y);
      if (biome === 'swamp' && puddles.at(x, y) > 0.7) terrain[i] = Terrain.ShallowWater;
      else if (biome === 'swamp' && puddles.at(x, y) > 0.6) terrain[i] = Terrain.Mud;
      else if ((biome === 'grassland' || biome === 'plains') && p > 0.9) terrain[i] = Terrain.Dirt;
      else if ((biome === 'grassland' || biome === 'savanna') && p > 0.85)
        terrain[i] = Terrain.SparseGrass;
      else if (biome === 'forest' && forests.at(x, y) > 0.78 && g > 0.4)
        terrain[i] = Terrain.Leaves;
      else if (biome === 'grassland' && g > 0.7) terrain[i] = Terrain.Meadow;
      else if ((biome === 'grassland' || biome === 'forest') && g < 0.22)
        terrain[i] = Terrain.DryGrass;
      else if (biome === 'meadow' && g < 0.3) terrain[i] = Terrain.Grass;
      else if (biome === 'forest' && g > 0.76) terrain[i] = Terrain.Jungle;
      else if (biome === 'jungle' && g < 0.24) terrain[i] = Terrain.Leaves;
      else if (biome === 'jungle' && p > 0.88) terrain[i] = Terrain.Mud;
      else if (biome === 'desert' && p > 0.88) terrain[i] = Terrain.Dirt;
      else if (biome === 'desert' && reds.at(x, y) > 0.6) terrain[i] = Terrain.Clay;
      else if (biome === 'desert' && salts.at(x, y) > 0.78) terrain[i] = Terrain.Salt;
      else if (biome === 'foothill' && p > 0.55) terrain[i] = Terrain.Gravel;
      else if (biome === 'foothill' && p > 0.38) terrain[i] = Terrain.SparseGrass;
      else if (biome === 'savanna' && g > 0.72) terrain[i] = Terrain.Grass;
      else if (biome === 'tundra' && g > 0.74) terrain[i] = Terrain.Snow;
      else if (biome === 'snow' && g < 0.18) terrain[i] = Terrain.Tundra;
      else if (biome === 'wasteland' && elongated?.ashlandPart(x, y) === 'crater')
        terrain[i] = Terrain.Lava;
      else if (biome === 'wasteland' && p > 0.7) terrain[i] = Terrain.Corrupted;
      else if (biome === 'wasteland' && g < 0.2) terrain[i] = Terrain.Gravel;
    }
  }

  blendGrounds();

  /**
   * Transiciones como las del Age of Empires: el borde entre dos suelos se
   * deforma y se entrevera unos tiles (manchas de uno dentro del otro) y,
   * entre suelos muy distintos, aparece uno mezclado: pasto nevado entre el
   * pasto y la nieve, pasto con arena junto a la arena, pasto ralo junto a la
   * tierra.
   */
  function blendGrounds(): void {
    const source = terrain.slice();
    const natural = (i: number): boolean =>
      biomes[i] !== 'ocean' && biomes[i] !== 'mountain' && NATURAL.has(source[i] ?? Terrain.Water);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = index(x, y);
        if (!natural(i) || inTown(x, y, 2)) continue;
        const jx = Math.round((blendX.at(x, y) - 0.5) * 7 + (hash(seed + 41, x, y) - 0.5) * 3.2);
        const jy = Math.round((blendY.at(x, y) - 0.5) * 7 + (hash(seed + 42, x, y) - 0.5) * 3.2);
        const sx = Math.max(0, Math.min(width - 1, x + jx));
        const sy = Math.max(0, Math.min(height - 1, y + jy));
        const j = index(sx, sy);
        if (natural(j)) terrain[i] = source[j] ?? terrain[i] ?? Terrain.Grass;
      }
    }
    const warped = terrain.slice();
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const i = index(x, y);
        const here = warped[i];
        if (here === undefined || !GREENS.has(here) || inTown(x, y, 2)) continue;
        let mid: Terrain | undefined;
        let near = 3;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const other = warped[index(x + dx, y + dy)];
            const between = other === undefined ? undefined : MIXES.get(other);
            const d = Math.max(Math.abs(dx), Math.abs(dy));
            if (between !== undefined && d < near) {
              mid = between;
              near = d;
            }
          }
        if (mid === undefined) continue;
        // Pegado al otro suelo casi siempre; a dos tiles, a veces (borde desparejo).
        if (near === 1 || hash(seed + 43, x, y) < 0.55) terrain[i] = mid;
      }
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
      if ((elevation[i] ?? 0) < SEA || (isWater(terrain[i]) && step > 0 && !river[i])) return;
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
    // Los ríos son de agua poco profunda (se vadean); en el frío están congelados.
    terrain[i] = biomes[i] === 'snow' ? Terrain.Ice : Terrain.ShallowWater;
    river[i] = 1;
  }

  // ── Orillas y lagos ──
  // El mar junto a la costa es poco profundo (se camina, a pie o a caballo) en
  // una franja de ancho desparejo; más afuera, el agua profunda (para barcos).
  // Los lagos chicos son todos de agua poco profunda; los grandes tienen el
  // centro hondo.
  const fromLand = new Uint8Array(total).fill(255);
  {
    const queue: number[] = [];
    for (let i = 0; i < total; i++)
      if (biomes[i] !== 'ocean') {
        fromLand[i] = 0;
        queue.push(i);
      }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head] ?? 0;
      const d = fromLand[i] ?? 0;
      if (d >= 6) continue;
      const x = i % width;
      const y = (i - x) / width;
      for (const [nx, ny] of neighbors8(x, y)) {
        const j = index(nx, ny);
        if ((fromLand[j] ?? 0) > d + 1) {
          fromLand[j] = d + 1;
          queue.push(j);
        }
      }
    }
  }
  const lakes = inlandWaters();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = index(x, y);
      if (terrain[i] !== Terrain.Water || biomes[i] !== 'ocean') continue;
      const d = fromLand[i] ?? 255;
      const lake = lakes[i] ?? 0;
      const reach = lake === 1 ? 99 : lake === 2 ? 3 : 2 + Math.round(shoreWidth.at(x, y) * 3);
      if (d <= reach) terrain[i] = Terrain.ShallowWater;
    }
  }

  /** Agua encerrada en tierra: 1 = lago chico (todo bajo), 2 = lago grande; 0 = mar. */
  function inlandWaters(): Uint8Array {
    const out = new Uint8Array(total);
    const sea = new Uint8Array(total);
    const queue: number[] = [];
    for (let x = 0; x < width; x++) queue.push(index(x, 0), index(x, height - 1));
    for (let y = 0; y < height; y++) queue.push(index(0, y), index(width - 1, y));
    for (const i of queue) sea[i] = 1;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head] ?? 0;
      const x = i % width;
      const y = (i - x) / width;
      for (const [nx, ny] of neighbors4(x, y)) {
        const j = index(nx, ny);
        if (sea[j] || biomes[j] !== 'ocean') continue;
        sea[j] = 1;
        queue.push(j);
      }
    }
    const seen = new Uint8Array(total);
    for (let start = 0; start < total; start++) {
      if (sea[start] || seen[start] || biomes[start] !== 'ocean') continue;
      const body: number[] = [start];
      seen[start] = 1;
      for (let head = 0; head < body.length; head++) {
        const i = body[head] ?? 0;
        const x = i % width;
        const y = (i - x) / width;
        for (const [nx, ny] of neighbors4(x, y)) {
          const j = index(nx, ny);
          if (seen[j] || sea[j] || biomes[j] !== 'ocean') continue;
          seen[j] = 1;
          body.push(j);
        }
      }
      const kind = body.length < 1500 ? 1 : 2;
      for (const i of body) out[i] = kind;
    }
    return out;
  }

  // ── Vegetación y rocas ──
  const statics = new Map<number, StaticPlacement>();
  const place = (x: number, y: number, kind: StaticKind): void => {
    statics.set(index(x, y), { kind, x, y });
  };
  const nearWater = (x: number, y: number): boolean =>
    neighbors8(x, y).some(([nx, ny]) => isWater(terrain[index(nx, ny)]));
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = index(x, y);
      const biome = biomes[i] ?? 'ocean';
      if (isWater(terrain[i])) continue;
      const roll = hash(seed, x, y);
      const pick = hash(seed + 11, x, y);
      if (biome === 'mountain') {
        place(x, y, 'mountain');
        continue;
      }
      // No todo tiene que estar cargado: en los claros el suelo queda liso.
      if (clearings.at(x, y) > (CLEARING[biome] ?? 2)) continue;
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
  if (elongated) {
    // Las Tierras de Ceniza y su volcán tienen nombre (el volcán primero: es más chico).
    const { x, y, r, volcano } = elongated.ashland;
    regions.push(
      {
        name: 'Monte del Fuego',
        x: volcano.x - 16,
        y: volcano.y - 16,
        width: 33,
        height: 33,
        wild: true,
      },
      {
        name: 'Tierras de Ceniza',
        x: Math.round(x - r),
        y: Math.round(y - r * 1.2),
        width: Math.round(r * 2),
        height: Math.round(r * 2.4),
        wild: true,
      },
    );
  }
  const items: PlacedItem[] = [];
  const npcs: { role: NpcRole; position: Position; name?: string }[] = [];
  const townCreatures: { kind: CreatureKind; home: Position }[] = [];
  const descents: Descent[] = [];
  const ascents: Ascent[] = [];
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
    descents.push(
      ...(town.descents ?? []).map((d) => ({
        ...d,
        position: { x: d.position.x + ox, y: d.position.y + oy },
        ...(d.back ? { back: { x: d.back.x + ox, y: d.back.y + oy } } : {}),
      })),
    );
    const shift = (p: Position): Position => ({ x: p.x + ox, y: p.y + oy });
    ascents.push(
      ...(town.ascents ?? []).map((a) => ({
        ...a,
        position: shift(a.position),
        back: shift(a.back),
        origin: shift(a.origin),
      })),
    );
    townCreatures.push(
      ...(town.lairs ?? []).map((l) => ({
        kind: l.kind,
        home: { x: l.position.x + ox, y: l.position.y + oy },
      })),
    );
    items.push(
      ...town.items.map((it) => ({
        ...it,
        position: { x: it.position.x + ox, y: it.position.y + oy },
      })),
    );
  }
  // Los puertos: desde el agua del borde sur de la ciudad, un canal recto
  // hasta el mar abierto, para que los barcos entren y salgan.
  for (const { plan, x: ox, y: oy } of towns) {
    if (!plan.harbor) continue;
    const town = plan.map;
    const bottom = oy + town.height;
    for (let x = ox; x < ox + town.width; x++) {
      if (town.terrain[(town.height - 1) * town.width + (x - ox)] !== Terrain.Water) continue;
      for (let y = bottom; y < height - 1 && y < bottom + 120; y++) {
        const i = index(x, y);
        if (biomes[i] === 'ocean' && terrain[i] === Terrain.Water) break;
        terrain[i] = Terrain.Water;
        biomes[i] = 'ocean';
        statics.delete(i);
      }
    }
  }
  // Los ríos que cruzan una ciudad siguen afuera: cuesta abajo hasta el mar
  // desde donde salen, y cuesta arriba hasta una vertiente desde donde entran.
  for (const { plan, x: ox, y: oy } of towns)
    for (const mouth of plan.map.rivers ?? []) {
      const outward = mouth.x === 0 ? -1 : 1;
      flowFrom({ x: ox + mouth.x + outward, y: oy + mouth.y }, mouth.flow === 'in', outward);
    }

  function flowFrom(start: Position, uphill: boolean, outward: number): void {
    let { x, y } = start;
    const visited = new Set<number>();
    const wet = (wx: number, wy: number): void => {
      if (wx < 1 || wy < 1 || wx >= width - 1 || wy >= height - 1 || inTown(wx, wy)) return;
      const i = index(wx, wy);
      if (biomes[i] === 'mountain' || biomes[i] === 'ocean') return;
      terrain[i] = biomes[i] === 'snow' ? Terrain.Ice : Terrain.ShallowWater;
      river[i] = 1;
      statics.delete(i);
    };
    for (let step = 0; step < size * 2; step++) {
      const i = index(x, y);
      visited.add(i);
      if (!uphill && step > 2 && (biomes[i] === 'ocean' || (isWater(terrain[i]) && !river[i])))
        return;
      // Ancho como adentro de la ciudad al principio, después se angosta.
      for (let d = 0; d < (step < 30 ? 4 : 2); d++) wet(x, y + d);
      // Los primeros pasos se alejan derecho de la ciudad.
      let next: Position | null = step < 6 ? { x: x + outward, y } : null;
      if (!next) {
        let best = uphill ? -Infinity : Infinity;
        for (const [nx, ny] of neighbors4(x, y)) {
          const ni = index(nx, ny);
          if (visited.has(ni) || biomes[ni] === 'mountain' || inTown(nx, ny, 2)) continue;
          const e = (elevation[ni] ?? 0) + hash(seed + 29, nx, ny) * 0.004;
          if (uphill ? e > best : e < best) {
            best = e;
            next = { x: nx, y: ny };
          }
        }
      }
      // Cuesta arriba termina en una vertiente (una laguna chica) al pie de las lomas.
      if (!next || (uphill && (step > 140 || biomes[i] === 'foothill'))) {
        for (let dy = -2; dy <= 3; dy++)
          for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 6) wet(x + dx, y + dy);
        return;
      }
      x = next.x;
      y = next.y;
    }
  }

  // Los pueblos recortan las montañas de alrededor: no quedan picos sueltos.
  for (let pass = 0; pass < 3; pass++)
    for (const [i, s] of statics) {
      if (s.kind !== 'mountain') continue;
      const around = neighbors8(s.x, s.y).filter(
        ([nx, ny]) => statics.get(index(nx, ny))?.kind === 'mountain',
      ).length;
      if (around < 2) statics.delete(i);
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
    // El nombre del pueblo (no el de su cementerio, que también es una región del plano).
    name:
      t.plan.map.regions.find((r) => !r.name.startsWith('Cementerio de '))?.name ??
      t.plan.map.regions[0]?.name ??
      'pueblo',
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
  // Cada tierra (el continente, cada isla) con su número: los caminos no cruzan el mar.
  const landmass = new Int32Array(total).fill(-1);
  {
    let next = 0;
    for (let start = 0; start < total; start++) {
      if (landmass[start] !== -1 || biomes[start] === 'ocean') continue;
      const queue = [start];
      landmass[start] = next;
      for (let head = 0; head < queue.length; head++) {
        const i = queue[head] ?? 0;
        const x = i % width;
        for (const [nx, ny] of neighbors4(x, (i - x) / width)) {
          const j = index(nx, ny);
          if (landmass[j] !== -1 || biomes[j] === 'ocean') continue;
          landmass[j] = next;
          queue.push(j);
        }
      }
      next++;
    }
  }
  for (const [a, b] of links) {
    const from = placed[a];
    const to = placed[b];
    if (!from || !to) continue;
    const centerOf = (t: PlacedTown): number =>
      landmass[index(t.x + Math.floor(t.width / 2), t.y + Math.floor(t.height / 2))] ?? -1;
    if (centerOf(from) !== centerOf(to)) continue;
    const start = gate(from, to);
    const end = gate(to, from);
    const straight = cheapestPath(width, height, start, end, roadCost, elongated ? 2 : ROAD_TURN);
    if (!straight) continue;
    const path = elongated ? curvePath(straight, roadCost, seed + a * 31 + b) : straight;
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
    // Un poco de ruido en el costo: los caminos serpentean en vez de ir en escuadra.
    const meander = elongated ? wander(x, y) : 0;
    if (inTown(x, y)) return Infinity;
    if (roads.has(i)) return 0.3;
    const biome = biomes[i];
    if (biome === 'ocean') return Infinity;
    if (terrain[i] === Terrain.ShallowWater) return river[i] ? 8 : 12;
    if (isWater(terrain[i])) return 30;
    if (biome === 'mountain') return 70;
    if (biome === 'swamp') return 3;
    if (biome === 'forest' || biome === 'foothill' || biome === 'snow' || biome === 'jungle')
      return 1.25 + meander;
    if (biome === 'desert' || biome === 'beach') return 1.15 + meander;
    return 1 + meander;
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
          isWater(terrain[i]) || terrain[i] === Terrain.Wood
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
      if (roads.has(i) || inTown(x, y) || isWater(terrain[i])) continue;
      place(x, y, 'sign');
      signs.push({ x, y, text: `Camino a ${destination}` });
      return;
    }
  }

  const heights = elevationLevels();

  /**
   * Lomas como las del Age of Empires: la altura de cada tile en escalones
   * finos, según la elevación y unas colinas suaves. Entre un tile y el
   * vecino la diferencia es chica (laderas, no paredones); el agua y la costa
   * quedan abajo y los pueblos, planos.
   */
  function elevationLevels(): number[] {
    const hills = new ValueNoise(seed + 28, Math.max(10, size / 22));
    const knolls = new ValueNoise(seed + 30, 16);
    const bumps = new ValueNoise(seed + 29, 7);
    const level = new Int16Array(total);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = index(x, y);
        const biome = biomes[i];
        if (biome === 'ocean' || biome === 'beach' || isWater(terrain[i])) continue;
        const rise =
          ((elevation[i] ?? SEA) - SEA) * 30 +
          smoothstep(0.35, 0.9, hills.at(x, y)) * 40 +
          knolls.at(x, y) * 14 +
          bumps.at(x, y) * 4 +
          (biome === 'mountain' ? 16 : biome === 'foothill' ? 6 : 0) -
          (biome === 'swamp' ? 16 : 0) +
          (elongated?.volcanoLift(x, y) ?? 0);
        level[i] = Math.max(0, Math.min(MAX_LEVEL, Math.round(rise)));
      }
    }
    // Los pueblos, planos: a la altura más baja de su terreno.
    for (const t of towns) {
      let low = MAX_LEVEL;
      for (let y = t.y - 2; y < t.y + t.plan.map.height + 2; y++)
        for (let x = t.x - 2; x < t.x + t.plan.map.width + 2; x++)
          low = Math.min(low, level[index(x, y)] ?? 0);
      for (let y = t.y - 2; y < t.y + t.plan.map.height + 2; y++)
        for (let x = t.x - 2; x < t.x + t.plan.map.width + 2; x++) level[index(x, y)] = low;
    }
    // Laderas, no paredones: entre vecinos a lo sumo `SLOPE` escalones (se bajan los que sobran).
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) limit(x, y, [-1, -1], [0, -1], [1, -1], [-1, 0]);
      for (let y = height - 1; y >= 0; y--)
        for (let x = width - 1; x >= 0; x--) limit(x, y, [1, 1], [0, 1], [-1, 1], [1, 0]);
    }
    return Array.from(level);

    function limit(x: number, y: number, ...steps: (readonly [number, number])[]): void {
      const i = index(x, y);
      let cap = level[i] ?? 0;
      for (const [dx, dy] of steps) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        cap = Math.min(cap, (level[index(nx, ny)] ?? 0) + SLOPE);
      }
      level[i] = cap;
    }
  }

  const map = new TileMap({
    width,
    height,
    terrain,
    statics: [...statics.values()],
    regions,
    signs,
    heights,
  });
  return {
    map,
    spawnPoint,
    items,
    npcs,
    biomes,
    towns: placed,
    roads,
    passes,
    townCreatures,
    descents,
    ascents,
  };

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
    case 'tundra':
      return Terrain.Tundra;
    case 'jungle':
      return Terrain.Jungle;
    case 'savanna':
      return Terrain.DryGrass;
    case 'badlands':
      return Terrain.Clay;
    case 'meadow':
      return Terrain.Meadow;
    case 'wasteland':
      return Terrain.Ash;
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
  if (climate === 'jungle') return Terrain.Jungle;
  if (climate === 'mountain') return Terrain.Dirt;
  return Terrain.Grass;
}

/**
 * Desde qué valor del ruido de claros el suelo queda liso, por bioma: la
 * llanura es casi toda lisa, el campo y el prado tienen claros grandes y
 * los bosques, alguno chico. Los demás biomas no tienen claros.
 */
const CLEARING: Partial<Record<Biome, number>> = {
  plains: 0.38,
  grassland: 0.52,
  meadow: 0.56,
  savanna: 0.6,
  tundra: 0.62,
  forest: 0.7,
};

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
  // Las plantas chicas del suelo varían con `pick`: así cada zona tiene su mezcla.
  const choose = (kinds: readonly StaticKind[]): StaticKind =>
    kinds[Math.floor(pick * kinds.length)] ?? kinds[0] ?? 'bush';
  switch (biome) {
    case 'beach':
      if (roll < 0.004) return 'rock';
      if (roll < 0.008) return 'pebbles';
      return null;
    case 'foothill':
      if (roll < 0.025) return choose(['rock', 'boulder', 'mossy-rock']);
      if (roll < 0.06) return 'pine';
      if (roll < 0.075) return 'pebbles';
      return null;
    case 'snow':
      // Bosquecillos con claros, no una pared de pinos.
      if (forest > 0.62 && roll < 0.2) return 'snow-pine';
      if (roll < 0.015) return 'snow-pine';
      if (roll < 0.018) return 'rock';
      if (roll < 0.022) return 'tundra-shrub';
      return null;
    case 'tundra':
      if (forest > 0.66 && roll < 0.14) return pick < 0.6 ? 'birch' : 'snow-pine';
      if (roll < 0.008) return 'birch';
      if (roll < 0.03) return 'tundra-shrub';
      if (roll < 0.04) return choose(['mossy-rock', 'boulder', 'pebbles']);
      if (roll < 0.06) return 'tall-grass';
      return null;
    case 'desert':
      if (ground === Terrain.Dirt) return roll < 0.006 ? 'rock' : null;
      if (wet && roll < 0.2) return 'palm';
      if (roll < 0.012) return 'cactus';
      if (roll < 0.02) return 'peyote';
      if (roll < 0.024) return choose(['rock', 'boulder']);
      if (roll < 0.03) return 'dry-shrub';
      if (roll < 0.032) return 'dead-tree';
      return null;
    case 'badlands':
      if (roll < 0.02) return 'boulder';
      if (roll < 0.03) return 'peyote';
      if (roll < 0.045) return 'dry-shrub';
      if (roll < 0.05) return 'dead-tree';
      return null;
    case 'savanna':
      if (wet && roll < 0.08) return 'palm';
      if (roll < 0.012) return pick < 0.75 ? 'acacia' : 'baobab';
      if (roll < 0.07) return 'tall-grass';
      if (roll < 0.085) return 'dry-shrub';
      if (roll < 0.09) return choose(['boulder', 'rock']);
      return null;
    case 'jungle':
      // Selva cerrada: árboles altos, palmeras, helechos y plantas de hojas grandes.
      if (wet && roll < 0.12) return 'bamboo';
      if (roll < 0.16) return pick < 0.6 ? 'jungle-tree' : pick < 0.9 ? 'palm' : 'bamboo';
      if (roll < 0.26) return 'jungle-plant';
      if (roll < 0.34) return 'fern';
      if (roll < 0.36) return 'mushrooms';
      if (roll < 0.37) return 'mossy-rock';
      return null;
    case 'swamp':
      if (roll < 0.07) return 'reeds';
      if (roll < 0.09) return pick < 0.7 ? 'willow' : 'cypress';
      if (roll < 0.105) return 'dead-tree';
      if (roll < 0.12) return 'mushrooms';
      if (roll < 0.14) return 'fern';
      return null;
    case 'wasteland':
      // Valle negro: árboles muertos, peñascos y huesos; casi nada vivo.
      if (ground === Terrain.Lava) return null;
      if (roll < 0.01) return 'dead-tree';
      if (roll < 0.024) return choose(['boulder', 'rock']);
      if (roll < 0.03) return 'bones';
      if (roll < 0.036) return 'pebbles';
      return null;
    case 'plains':
      // Llanura abierta: sin árboles (lugar para casas), solo pasto, yuyos y florcitas.
      if (roll < 0.012) return 'tall-grass';
      if (roll < 0.02) return 'weeds';
      if (roll < 0.026) return 'wildflowers';
      if (roll < 0.027) return 'pebbles';
      return null;
    case 'meadow':
      if (roll < 0.004) return loneTree(pick);
      if (roll < 0.03) return 'wildflowers';
      if (roll < 0.045) return 'flowers';
      if (roll < 0.07) return 'tall-grass';
      if (roll < 0.08) return 'weeds';
      return null;
    case 'grassland':
    case 'forest': {
      if (ground === Terrain.Dirt) return roll < 0.004 ? 'rock' : roll < 0.01 ? 'pebbles' : null;
      if (wet)
        return roll < 0.05 ? (pick < 0.55 ? 'willow' : 'ceibo') : roll < 0.09 ? 'reeds' : null;
      if (biome === 'forest') {
        // Bosque abierto: árboles con espacio entre ellos para pasar.
        if (roll < 0.2)
          return conifer > 0.55
            ? 'pine'
            : conifer < 0.24
              ? pick < 0.7
                ? 'maple'
                : 'oak'
              : pick < 0.05
                ? 'dead-tree'
                : pick < 0.14
                  ? 'birch'
                  : 'oak';
        if (roll < 0.23) return 'bush';
        if (roll < 0.26) return 'fern';
        if (roll < 0.275) return 'mushrooms';
        if (roll < 0.285) return 'mossy-rock';
        if (roll < 0.3) return 'weeds';
        return null;
      }
      if (roll < 0.014) return conifer > 0.55 ? 'pine' : loneTree(pick);
      if (roll < 0.024) return 'bush';
      if (roll < 0.04) return 'flowers';
      if (roll < 0.042) return 'rock';
      if (roll < 0.062) return 'tall-grass';
      if (roll < 0.08) return 'weeds';
      if (roll < 0.09) return 'wildflowers';
      if (roll < 0.093) return 'pebbles';
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
  if (pick < 0.9) return 'ceibo';
  if (pick < 0.95) return 'cypress';
  return 'dead-tree';
}

/**
 * Costo extra para trazar caminos que serpentean: curvas chicas y curvas
 * grandes, como si rodearan lomas y arboledas en vez de ir en línea recta.
 */
export function wanderField(seed: number, size: number): (x: number, y: number) => number {
  const small = new ValueNoise(seed + 22, 9);
  const large = new ValueNoise(seed + 24, Math.max(12, size / 30));
  return (x, y) => small.at(x, y) * 1.2 + large.at(x, y) * 2.6;
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

/** Costa oeste del continente (fracción del ancho) según la latitud (0 = norte, 1 = sur). */
const WEST_COAST: readonly (readonly [number, number])[] = [
  [0, 0.4],
  [0.03, 0.3],
  [0.08, 0.19],
  [0.2, 0.13],
  [0.35, 0.15],
  [0.5, 0.13],
  [0.62, 0.16],
  [0.75, 0.2],
  [0.85, 0.26],
  [0.93, 0.33],
  [0.98, 0.37],
  [1, 0.4],
];

/**
 * Costa este: entre las latitudes 0,4 y 0,64 se mete hacia adentro y forma
 * una gran bahía abierta al mar del este (el continente sigue entero).
 */
const EAST_COAST: readonly (readonly [number, number])[] = [
  [0, 0.42],
  [0.03, 0.52],
  [0.08, 0.62],
  [0.2, 0.68],
  [0.3, 0.66],
  [0.36, 0.6],
  [0.42, 0.47],
  [0.47, 0.37],
  [0.52, 0.33],
  [0.57, 0.37],
  [0.62, 0.47],
  [0.68, 0.57],
  [0.76, 0.6],
  [0.84, 0.55],
  [0.9, 0.48],
  [0.96, 0.43],
  [1, 0.41],
];

/** Frío según la latitud: helado arriba, templado (la capital), caluroso en el istmo y el sur, fresco en la punta. */
const COLD: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.07, 0.82],
  [0.12, 0.72],
  [0.42, 0.4],
  [0.55, 0.15],
  [0.6, 0.1],
  [0.7, 0.2],
  [0.8, 0.38],
  [0.92, 0.6],
  [1, 0.78],
];

function interpolate(keys: readonly (readonly [number, number])[], t: number): number {
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i] ?? [1, 0];
    const [t0, v0] = keys[i - 1] ?? [0, 0];
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / Math.max(1e-6, t1 - t0);
  }
  return keys[keys.length - 1]?.[1] ?? 0;
}

/** Dónde va la ciudad de la isla grande (fracción del mapa), frente a la entrada de las Tierras de Ceniza. */
export const ISLAND_CITY: Position = { x: 0.79, y: 0.55 };
/** El refugio de los bandidos: en la Malvina del oeste. */
export const BANDIT_ISLAND: Position = { x: 0.675, y: 0.872 };

/** Un lóbulo de isla: una elipse girada, en tiles. */
interface Lobe {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
  readonly angle: number;
}

/** Una isla: uno o varios lóbulos y cuánto se recorta su costa (bahías, cabos). */
interface IslandShape {
  readonly lobes: readonly Lobe[];
  readonly ragged: number;
}

/** Qué parte de la región de ceniza (el "Mordor" de la isla grande) ocupa un tile. */
export type AshlandPart = 'wall' | 'inside' | 'cone' | 'crater';

/**
 * Continente de norte a sur, mezcla de América y Britannia: entero (sin
 * estrecho), con una gran bahía en la costa este, una cordillera a lo largo
 * de la costa oeste (con pasos) y costas torcidas con ruido. En el mar:
 * - una isla grande al este de la bahía, con una ciudad y las Tierras de
 *   Ceniza: un valle negro amurallado por montañas, con una sola entrada y un
 *   volcán en el medio;
 * - dos islas de costa muy recortada al sudeste, frente a la punta sur (como
 *   las Malvinas);
 * - una isla larga al noreste, otra angosta al oeste y otras chicas de formas
 *   variadas (alargadas, de dos lóbulos), para explorar y, más adelante,
 *   navegar.
 */
class ElongatedShape {
  private readonly warpX: ValueNoise;
  private readonly warpY: ValueNoise;
  private readonly fineX: ValueNoise;
  private readonly gulfs: ValueNoise;
  private readonly gaps: ValueNoise;
  private readonly coast: ValueNoise;
  private readonly coastFine: ValueNoise;
  private readonly islands: IslandShape[] = [];
  /** Centro y radio del anillo de montañas de las Tierras de Ceniza, y el volcán. */
  readonly ashland: { x: number; y: number; r: number; volcano: Position };

  constructor(
    private readonly width: number,
    private readonly height: number,
    seed: number,
  ) {
    const size = Math.min(width, height);
    this.warpX = new ValueNoise(seed + 17, Math.max(8, size / 7));
    this.warpY = new ValueNoise(seed + 18, Math.max(8, size / 7));
    this.fineX = new ValueNoise(seed + 21, Math.max(4, size / 28));
    this.gulfs = new ValueNoise(seed + 19, Math.max(8, size / 9));
    this.gaps = new ValueNoise(seed + 20, Math.max(6, size / 16));
    this.coast = new ValueNoise(seed + 32, Math.max(8, size / 90));
    this.coastFine = new ValueNoise(seed + 33, 5);
    const W = width;
    const H = height;
    const lobe = (x: number, y: number, rx: number, ry: number, angle = 0): Lobe => ({
      x: x * W,
      y: y * H,
      rx: rx * W,
      ry: ry * H,
      angle,
    });
    // La isla grande: alargada, con un brazo al norte y otro al sur.
    this.islands.push({
      lobes: [
        lobe(0.845, 0.57, 0.085, 0.13, 0.15),
        lobe(0.8, 0.47, 0.05, 0.055, -0.4),
        lobe(0.88, 0.68, 0.06, 0.05, 0.6),
      ],
      ragged: 0.14,
    });
    // Dos islas frente a la punta sur, separadas por un canal angosto, de costa muy recortada.
    this.islands.push({
      lobes: [lobe(0.675, 0.875, 0.037, 0.03, 0.5), lobe(0.66, 0.895, 0.022, 0.013, -0.3)],
      ragged: 0.34,
    });
    this.islands.push({
      lobes: [lobe(0.76, 0.865, 0.04, 0.028, -0.3), lobe(0.775, 0.888, 0.028, 0.015, 0.8)],
      ragged: 0.34,
    });
    // Una isla larga al noreste y otra angosta al oeste.
    this.islands.push({ lobes: [lobe(0.86, 0.17, 0.025, 0.09, 0.35)], ragged: 0.12 });
    this.islands.push({ lobes: [lobe(0.05, 0.55, 0.014, 0.055, -0.15)], ragged: 0.15 });
    // Otras chicas, de formas variadas, en el mar abierto.
    const wanted = this.islands.length + Math.round(size / 110);
    for (let tries = 0; this.islands.length < wanted && tries < 2000; tries++) {
      const r = (k: number): number => hash(seed + 31, tries, k);
      const x = (0.03 + r(1) * 0.94) * W;
      const y = (0.03 + r(2) * 0.94) * H;
      const radius = size * (0.008 + r(3) * 0.022);
      const stretch = 1 + r(4) * 2.4;
      const angle = r(5) * Math.PI;
      if (this.edge(x, y) < (radius * stretch) / W + 0.03) continue;
      if (
        this.islands.some((o) =>
          o.lobes.some(
            (l) => Math.hypot(l.x - x, l.y - y) < Math.max(l.rx, l.ry) + radius * stretch + 20,
          ),
        )
      )
        continue;
      const lobes: Lobe[] = [{ x, y, rx: radius, ry: radius * stretch, angle }];
      if (r(6) < 0.5) {
        // Dos lóbulos: una isla con cintura.
        const along = radius * stretch * 0.9;
        lobes.push({
          x: x + Math.sin(angle) * along,
          y: y + Math.cos(angle) * along,
          rx: radius * 0.8,
          ry: radius * (0.8 + r(7)),
          angle: angle + 0.8,
        });
      }
      this.islands.push({ lobes, ragged: 0.12 + r(8) * 0.15 });
    }
    this.ashland = {
      x: 0.868 * W,
      y: 0.6 * H,
      r: 0.054 * W,
      volcano: { x: 0.875 * W, y: 0.598 * H },
    };
  }

  /** Distancia horizontal (fracción del ancho) al borde del continente; positiva afuera. */
  private edge(x: number, y: number): number {
    const u =
      x / this.width + (this.warpX.at(x, y) - 0.5) * 0.18 + (this.fineX.at(x, y) - 0.5) * 0.05;
    const v = Math.max(0, Math.min(1, y / this.height + (this.warpY.at(x, y) - 0.5) * 0.04));
    return Math.max(interpolate(WEST_COAST, v) - u, u - interpolate(EAST_COAST, v));
  }

  /** Cuánto suma (o resta) a la elevación: tierra adentro, mar afuera, golfos e islas. */
  land(x: number, y: number): number {
    const d = this.edge(x, y);
    let value = -smoothstep(-0.03, 0.05, d) * 0.62;
    // Golfos y bahías chicas que se meten desde la costa.
    if (d > -0.1) value -= smoothstep(0.72, 0.88, this.gulfs.at(x, y)) * 0.4;
    for (const island of this.islands) {
      const k = this.inIsland(island, x, y);
      // Tierra firme hasta cerca del borde del lóbulo (no solo en el centro).
      if (k > 0) value = Math.max(value, -0.62 + k * 1.6);
    }
    return value;
  }

  /** Qué tan adentro de la isla está el tile (0 = afuera, 1 = en el centro). */
  private inIsland(island: IslandShape, x: number, y: number): number {
    let best = 0;
    for (const l of island.lobes) {
      const reach = Math.max(l.rx, l.ry) * 1.5;
      if (Math.abs(x - l.x) > reach || Math.abs(y - l.y) > reach) continue;
      const dx = x - l.x;
      const dy = y - l.y;
      const c = Math.cos(l.angle);
      const s = Math.sin(l.angle);
      const u = (dx * c - dy * s) / l.rx;
      const v = (dx * s + dy * c) / l.ry;
      const dist =
        Math.hypot(u, v) * (0.85 + this.warpX.at(x, y) * 0.3) +
        (this.coast.at(x, y) - 0.5) * island.ragged * 2 +
        (this.coastFine.at(x, y) - 0.5) * island.ragged * 0.5;
      best = Math.max(best, 1 - dist);
    }
    return best;
  }

  cold(y: number): number {
    return interpolate(COLD, y / this.height);
  }

  /** La cordillera del oeste (0 a 1), con pasos donde se corta. */
  cordillera(x: number, y: number): number {
    const v = y / this.height;
    const west = interpolate(WEST_COAST, v);
    const east = interpolate(EAST_COAST, v);
    const wide = east - west;
    if (wide < 0.2) return 0;
    const u = x / this.width + (this.warpX.at(x, y) - 0.5) * 0.08;
    const line = west + wide * 0.12;
    const band = 1 - Math.abs(u - line) / (wide * 0.07);
    if (band <= 0 || this.gaps.at(x, y) < 0.34) return 0;
    return band;
  }

  /**
   * Las Tierras de Ceniza: un anillo de montañas (con una sola entrada, del
   * lado de la ciudad), el valle negro adentro y el volcán con su cráter de lava.
   */
  ashlandPart(x: number, y: number): AshlandPart | null {
    const { x: cx, y: cy, r, volcano } = this.ashland;
    const dx = x - cx;
    const dy = y - cy;
    if (Math.abs(dx) > r * 1.4 || Math.abs(dy) > r * 1.6) return null;
    const cone = Math.hypot(x - volcano.x, y - volcano.y);
    if (cone < 5) return 'crater';
    if (cone < 16) return 'cone';
    // Un anillo torcido y de grosor desparejo, no un círculo perfecto.
    const d =
      Math.hypot(dx, dy * 0.82) * (0.8 + this.coast.at(x * 1.7, y * 1.7) * 0.4) +
      (this.warpY.at(x, y) - 0.5) * r * 0.2;
    if (Math.abs(d - r) < 7 + this.coastFine.at(x, y) * 5) {
      // La entrada: un paso hacia el oeste, donde está la ciudad.
      const angle = Math.atan2(dy, dx);
      const gate = Math.abs(Math.atan2(Math.sin(angle - Math.PI), Math.cos(angle - Math.PI)));
      return gate < 0.1 ? 'inside' : 'wall';
    }
    return d < r ? 'inside' : null;
  }

  /** Cuánto sube el volcán (en escalones de altura). */
  volcanoLift(x: number, y: number): number {
    const { volcano } = this.ashland;
    const d = Math.hypot(x - volcano.x, y - volcano.y);
    if (d >= 22) return 0;
    if (d < 5) return 30;
    return Math.round(46 * (1 - (d - 5) / 17));
  }
}

/**
 * El continente de la selva, al oeste cruzando el mar: una tierra ancha de
 * costa muy recortada (penínsulas, caletas) con un espinazo de sierras al
 * medio, cortado por pasos. Hace calor en todas partes: selva cerrada, manglares
 * en lo bajo y húmedo, y claros secos de sabana donde llueve poco.
 */
class JungleShape {
  private readonly warpX: ValueNoise;
  private readonly warpY: ValueNoise;
  private readonly coast: ValueNoise;
  private readonly coastFine: ValueNoise;
  private readonly gaps: ValueNoise;
  private readonly peaks: ValueNoise;
  private readonly lobes: readonly Lobe[];

  constructor(
    private readonly width: number,
    private readonly height: number,
    seed: number,
  ) {
    const size = Math.min(width, height);
    this.warpX = new ValueNoise(seed + 17, Math.max(8, size / 6));
    this.warpY = new ValueNoise(seed + 18, Math.max(8, size / 6));
    this.coast = new ValueNoise(seed + 32, Math.max(6, size / 40));
    this.coastFine = new ValueNoise(seed + 33, 5);
    this.gaps = new ValueNoise(seed + 20, Math.max(6, size / 14));
    this.peaks = new ValueNoise(seed + 34, Math.max(6, size / 12));
    const lobe = (x: number, y: number, rx: number, ry: number, angle = 0): Lobe => ({
      x: x * width,
      y: y * height,
      rx: rx * width,
      ry: ry * height,
      angle,
    });
    // El cuerpo y las penínsulas: una al noroeste, otra larga al sudeste y una
    // gorda al este, frente al continente de Puerto Ceniza.
    this.lobes = [
      lobe(0.5, 0.5, 0.36, 0.38),
      lobe(0.47, 0.24, 0.3, 0.17, 0.3),
      lobe(0.52, 0.76, 0.28, 0.17, -0.25),
      lobe(0.24, 0.2, 0.13, 0.1, 0.7),
      lobe(0.72, 0.84, 0.09, 0.12, -0.6),
      lobe(0.78, 0.48, 0.12, 0.14, 0.2),
    ];
  }

  /** Cuánto suma (o resta) a la elevación: tierra adentro, mar afuera. */
  land(x: number, y: number): number {
    let inside = -Infinity;
    for (const l of this.lobes) {
      const dx = x - l.x;
      const dy = y - l.y;
      const c = Math.cos(l.angle);
      const s = Math.sin(l.angle);
      const u = (dx * c - dy * s) / l.rx;
      const v = (dx * s + dy * c) / l.ry;
      inside = Math.max(inside, 1 - Math.hypot(u, v));
    }
    const ragged =
      (this.warpX.at(x, y) - 0.5) * 0.3 +
      (this.coast.at(x, y) - 0.5) * 0.22 +
      (this.coastFine.at(x, y) - 0.5) * 0.06;
    return -smoothstep(-0.02, 0.12, -(inside + ragged)) * 0.62;
  }

  /** El espinazo de sierras de norte a sur y algunos macizos sueltos (0 a 1). */
  highlands(x: number, y: number): number {
    const u = x / this.width + (this.warpX.at(x, y) - 0.5) * 0.12;
    const v = y / this.height;
    if (v < 0.2 || v > 0.8) return 0;
    const spine = 1 - Math.abs(u - 0.47) / 0.05;
    const massif = smoothstep(0.78, 0.9, this.peaks.at(x, y));
    const band = Math.max(spine, massif);
    if (band <= 0 || this.gaps.at(x, y) < 0.36) return 0;
    return band;
  }

  /** El bioma según cuánto sobresale del mar y la humedad. */
  biome(rise: number, wet: number, x: number, y: number): Biome {
    if (rise < 0.08 && wet > 0.55) return 'swamp';
    if (wet < 0.24 + (this.warpY.at(x, y) - 0.5) * 0.1) return 'savanna';
    return 'jungle';
  }
}
