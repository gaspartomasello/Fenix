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
  /**
   * Mazmorra: sin luz natural (de día también está oscuro) y sin la
   * protección de los pueblos: las criaturas entran y se puede pelear.
   */
  readonly dungeon?: boolean;
  /**
   * Lugar con nombre en las tierras salvajes (un campamento, unas ruinas):
   * se ve el nombre, pero no protege como un pueblo.
   */
  readonly wild?: boolean;
}

/** Cartel con texto (los destinos de un cruce de caminos). */
export interface SignData {
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

/** Tile que lleva a otro lugar al pisarlo (entrada y salida de una mazmorra). */
export interface Teleporter {
  readonly x: number;
  readonly y: number;
  readonly to: Position;
}

/** Forma serializable del mapa, tal como viaja por la red. */
export interface TileMapData {
  readonly width: number;
  readonly height: number;
  /** Terreno de cada tile, fila por fila (índice = y * width + x). */
  readonly terrain: readonly Terrain[];
  readonly statics: readonly StaticPlacement[];
  readonly regions: readonly RegionData[];
  readonly teleporters: readonly Teleporter[];
  readonly signs?: readonly SignData[];
}

/** Datos para construir un mapa; objetos y zonas son opcionales. */
export type TileMapInit = Omit<TileMapData, 'statics' | 'regions' | 'teleporters'> &
  Partial<Pick<TileMapData, 'statics' | 'regions' | 'teleporters'>>;

/** Mapa inmutable: terreno, objetos fijos y zonas, con consultas de solo lectura. */
export class TileMap {
  readonly width: number;
  readonly height: number;
  readonly statics: readonly StaticPlacement[];
  readonly regions: readonly RegionData[];
  readonly teleporters: readonly Teleporter[];
  readonly signs: readonly SignData[];
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
    this.teleporters = data.teleporters ?? [];
    this.signs = data.signs ?? [];
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

  /** Zona protegida (un pueblo): las criaturas no entran y no se pelea entre jugadores. */
  safeZoneAt(position: Position): RegionData | undefined {
    const region = this.regionAt(position);
    return region && !region.dungeon && !region.wild ? region : undefined;
  }

  /** Texto del cartel del tile, si hay uno. */
  signAt(position: Position): string | undefined {
    return this.signs.find((s) => s.x === position.x && s.y === position.y)?.text;
  }

  /** Adónde lleva el tile, si es un teletransporte. */
  teleportAt(position: Position): Position | undefined {
    return this.teleporters.find((t) => t.x === position.x && t.y === position.y)?.to;
  }

  toData(): TileMapData {
    return {
      width: this.width,
      height: this.height,
      terrain: this.terrain,
      statics: this.statics,
      regions: this.regions,
      teleporters: this.teleporters,
      signs: this.signs,
    };
  }
}
