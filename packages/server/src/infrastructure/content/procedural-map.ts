import {
  Terrain,
  TileMap,
  type Position,
  type RegionData,
  type StaticKind,
  type StaticPlacement,
} from '@fenix/shared';
import type { MapRegion } from './tiled-map-loader';

export interface GeneratedWorld {
  readonly map: TileMap;
  readonly spawnPoint: Position;
}

export interface WorldGenerationOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  /** Pueblo diseñado a mano que se estampa en el centro de la isla. */
  readonly town?: MapRegion | undefined;
}

/**
 * Genera una isla con lagos, playas, caminos y vegetación, y estampa en el
 * centro un pueblo diseñado en Tiled. Sin pueblo, deja una plaza empedrada.
 */
export function generateIslandMap(options: WorldGenerationOptions): GeneratedWorld {
  const { width, height, seed, town } = options;
  const lakes = new ValueNoise(seed, 12);
  const patches = new ValueNoise(seed + 1, 7);
  const forests = new ValueNoise(seed + 2, 14);
  const conifers = new ValueNoise(seed + 3, 20);
  const center = { x: Math.floor(width / 2), y: Math.floor(height / 2) };

  const terrain: Terrain[] = new Array<Terrain>(width * height);
  const roads = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const { tile, road } = pickTerrain(x, y);
      terrain[y * width + x] = tile;
      roads[y * width + x] = road ? 1 : 0;
    }
  }

  let statics = scatterVegetation();
  const regions: RegionData[] = [];
  let spawnPoint: Position = center;

  if (town) {
    const offset = {
      x: center.x - Math.floor(town.width / 2),
      y: center.y - Math.floor(town.height / 2),
    };
    const inTown = (p: Position): boolean =>
      p.x >= offset.x &&
      p.y >= offset.y &&
      p.x < offset.x + town.width &&
      p.y < offset.y + town.height;
    statics = statics.filter((s) => !inTown(s));
    town.terrain.forEach((tile, index) => {
      if (tile === null) return;
      const x = offset.x + (index % town.width);
      const y = offset.y + Math.floor(index / town.width);
      if (x >= 0 && y >= 0 && x < width && y < height) terrain[y * width + x] = tile;
    });
    statics.push(...town.statics.map((s) => ({ ...s, x: s.x + offset.x, y: s.y + offset.y })));
    regions.push(...town.regions.map((r) => ({ ...r, x: r.x + offset.x, y: r.y + offset.y })));
    if (town.spawn) spawnPoint = { x: town.spawn.x + offset.x, y: town.spawn.y + offset.y };
  } else {
    for (let y = center.y - 6; y <= center.y + 6; y++) {
      for (let x = center.x - 6; x <= center.x + 6; x++) terrain[y * width + x] = Terrain.Stone;
    }
    statics = statics.filter(
      (s) => Math.max(Math.abs(s.x - center.x), Math.abs(s.y - center.y)) > 7,
    );
  }

  return { map: new TileMap({ width, height, terrain, statics, regions }), spawnPoint };

  function pickTerrain(x: number, y: number): { tile: Terrain; road: boolean } {
    const edgeDistance = Math.min(x, y, width - 1 - x, height - 1 - y);
    if (edgeDistance < 2) return { tile: Terrain.Water, road: false };
    // Costa: el valor baja cerca de los bordes para formar una isla.
    const coast = Math.min(1, edgeDistance / 10);
    const elevation = lakes.at(x, y) * 0.6 + coast * 0.6 - 0.15;
    const road = Math.abs(x - center.x) <= 1 || Math.abs(y - center.y) <= 1;

    if (elevation < 0.35) return { tile: road && coast >= 1 ? Terrain.Dirt : Terrain.Water, road };
    if (elevation < 0.4) return { tile: Terrain.Sand, road: false };
    if (road) return { tile: Terrain.Dirt, road };
    if (patches.at(x, y) > 0.72) return { tile: Terrain.Dirt, road };
    return { tile: Terrain.Grass, road };
  }

  function scatterVegetation(): StaticPlacement[] {
    const placed: StaticPlacement[] = [];
    const nearWater = (x: number, y: number): boolean =>
      [-1, 0, 1].some((dy) =>
        [-1, 0, 1].some((dx) => terrain[(y + dy) * width + x + dx] === Terrain.Water),
      );

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const index = y * width + x;
        const tile = terrain[index];
        if (roads[index] || tile === Terrain.Water || nearWater(x, y)) continue;
        const roll = hash(seed, x, y);
        const kind = pickVegetation(tile, roll, forests.at(x, y), conifers.at(x, y));
        if (kind) placed.push({ kind, x, y });
      }
    }
    return placed;
  }
}

/** Qué crece en un tile: bosques densos donde el ruido es alto, algo suelto en el resto. */
function pickVegetation(
  tile: Terrain | undefined,
  roll: number,
  forest: number,
  conifer: number,
): StaticKind | null {
  if (tile === Terrain.Sand) return roll < 0.025 ? 'rock' : null;
  if (tile === Terrain.Dirt) return roll < 0.02 ? 'rock' : null;
  if (tile !== Terrain.Grass) return null;
  const tree: StaticKind = conifer > 0.55 ? 'pine' : 'oak';
  if (forest > 0.62) {
    if (roll < 0.34) return tree;
    if (roll < 0.42) return 'bush';
    return null;
  }
  if (roll < 0.025) return tree;
  if (roll < 0.04) return 'bush';
  if (roll < 0.055) return 'flowers';
  if (roll < 0.06) return 'rock';
  return null;
}

function hash(seed: number, x: number, y: number): number {
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
