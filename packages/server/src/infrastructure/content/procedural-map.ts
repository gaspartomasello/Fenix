import { Terrain, TileMap, type Position } from '@fenix/shared';

export interface GeneratedWorld {
  readonly map: TileMap;
  readonly spawnPoint: Position;
}

export interface ProceduralMapOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
}

/**
 * Genera una isla con lagos, playas y un pueblo empedrado en el centro
 * unido por caminos de tierra. Es la fuente de mapa de la etapa 1; más
 * adelante se reemplaza por mapas diseñados cargados desde archivos.
 */
export function generateIslandMap({ width, height, seed }: ProceduralMapOptions): GeneratedWorld {
  const lakes = new ValueNoise(seed, 12);
  const patches = new ValueNoise(seed + 1, 7);
  const center = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  const townRadius = 6;
  const terrain: Terrain[] = new Array<Terrain>(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      terrain[y * width + x] = pickTerrain(x, y);
    }
  }
  return { map: new TileMap({ width, height, terrain }), spawnPoint: center };

  function pickTerrain(x: number, y: number): Terrain {
    // Costa: el valor baja cerca de los bordes para formar una isla.
    const edgeDistance = Math.min(x, y, width - 1 - x, height - 1 - y);
    if (edgeDistance < 2) return Terrain.Water;
    const coast = Math.min(1, edgeDistance / 10);
    const elevation = lakes.at(x, y) * 0.6 + coast * 0.6 - 0.15;

    const dx = Math.abs(x - center.x);
    const dy = Math.abs(y - center.y);
    const inTown = Math.max(dx, dy) <= townRadius;
    const onRoad = (dx <= 1 || dy <= 1) && !inTown;

    if (inTown) return Terrain.Stone;
    if (elevation < 0.35) return onRoad && coast >= 1 ? Terrain.Dirt : Terrain.Water;
    if (elevation < 0.4) return Terrain.Sand;
    if (onRoad) return Terrain.Dirt;
    if (patches.at(x, y) > 0.72) return Terrain.Dirt;
    return Terrain.Grass;
  }
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
    const top = lerp(this.corner(x0, y0), this.corner(x0 + 1, y0), tx);
    const bottom = lerp(this.corner(x0, y0 + 1), this.corner(x0 + 1, y0 + 1), tx);
    return lerp(top, bottom, ty);
  }

  /** Valor pseudoaleatorio estable para cada vértice de la grilla. */
  private corner(x: number, y: number): number {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(this.seed, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => t * t * (3 - 2 * t);
