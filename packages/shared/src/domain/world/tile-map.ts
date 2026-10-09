import type { Position } from '../geometry/position';
import { STATICS, type StaticPlacement } from './statics';
import { TERRAINS, type Terrain } from './terrain';

/** Zona con nombre (un pueblo, un bosque…). */
export interface RegionData {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Forma serializable del mapa, tal como viaja por la red. */
export interface TileMapData {
  readonly width: number;
  readonly height: number;
  /** Terreno de cada tile, fila por fila (índice = y * width + x). */
  readonly terrain: readonly Terrain[];
  readonly statics: readonly StaticPlacement[];
  readonly regions: readonly RegionData[];
}

/** Datos para construir un mapa; objetos y zonas son opcionales. */
export type TileMapInit = Omit<TileMapData, 'statics' | 'regions'> &
  Partial<Pick<TileMapData, 'statics' | 'regions'>>;

/** Mapa inmutable: terreno, objetos fijos y zonas, con consultas de solo lectura. */
export class TileMap {
  readonly width: number;
  readonly height: number;
  readonly statics: readonly StaticPlacement[];
  readonly regions: readonly RegionData[];
  private readonly terrain: readonly Terrain[];
  private readonly blocked: Uint8Array;

  constructor(data: TileMapInit) {
    if (data.terrain.length !== data.width * data.height) {
      throw new Error(
        `Mapa inválido: se esperaban ${data.width * data.height} tiles y hay ${data.terrain.length}`,
      );
    }
    this.width = data.width;
    this.height = data.height;
    this.terrain = data.terrain;
    this.statics = data.statics ?? [];
    this.regions = data.regions ?? [];
    this.blocked = new Uint8Array(data.width * data.height);
    for (const placed of this.statics) {
      if (STATICS[placed.kind].blocking && this.contains(placed)) {
        this.blocked[placed.y * this.width + placed.x] = 1;
      }
    }
  }

  contains(position: Position): boolean {
    return (
      Number.isInteger(position.x) &&
      Number.isInteger(position.y) &&
      position.x >= 0 &&
      position.y >= 0 &&
      position.x < this.width &&
      position.y < this.height
    );
  }

  terrainAt(position: Position): Terrain | undefined {
    if (!this.contains(position)) return undefined;
    return this.terrain[position.y * this.width + position.x];
  }

  /** Transitable: terreno caminable y sin objetos que bloqueen. */
  isWalkable(position: Position): boolean {
    const terrain = this.terrainAt(position);
    return (
      terrain !== undefined &&
      TERRAINS[terrain].walkable &&
      this.blocked[position.y * this.width + position.x] === 0
    );
  }

  regionAt(position: Position): RegionData | undefined {
    return this.regions.find(
      (r) =>
        position.x >= r.x &&
        position.y >= r.y &&
        position.x < r.x + r.width &&
        position.y < r.y + r.height,
    );
  }

  toData(): TileMapData {
    return {
      width: this.width,
      height: this.height,
      terrain: this.terrain,
      statics: this.statics,
      regions: this.regions,
    };
  }
}
