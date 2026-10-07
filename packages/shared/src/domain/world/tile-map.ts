import type { Position } from '../geometry/position';
import { TERRAINS, type Terrain } from './terrain';

/** Forma serializable del mapa, tal como viaja por la red. */
export interface TileMapData {
  readonly width: number;
  readonly height: number;
  /** Terreno de cada tile, fila por fila (índice = y * width + x). */
  readonly terrain: readonly Terrain[];
}

/** Mapa de terreno inmutable con consultas de solo lectura. */
export class TileMap {
  readonly width: number;
  readonly height: number;
  private readonly terrain: readonly Terrain[];

  constructor(data: TileMapData) {
    if (data.terrain.length !== data.width * data.height) {
      throw new Error(
        `Mapa inválido: se esperaban ${data.width * data.height} tiles y hay ${data.terrain.length}`,
      );
    }
    this.width = data.width;
    this.height = data.height;
    this.terrain = data.terrain;
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

  isWalkable(position: Position): boolean {
    const terrain = this.terrainAt(position);
    return terrain !== undefined && TERRAINS[terrain].walkable;
  }

  toData(): TileMapData {
    return { width: this.width, height: this.height, terrain: this.terrain };
  }
}
