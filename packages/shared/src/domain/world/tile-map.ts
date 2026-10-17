import type { Position } from '../geometry/position';
import type { Direction } from '../geometry/direction';
import { DOORS, SEATS, STATICS, type StaticKind, type StaticPlacement } from './statics';
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
  /**
   * Altura de cada tile en escalones (0 = nivel del mar), como las lomas del
   * Age of Empires: solo se ve (todo se camina igual). Sin alturas, el mapa es
   * plano.
   */
  readonly heights?: readonly number[];
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
  private readonly heights: readonly number[] | undefined;
  private readonly blocked: Uint8Array;
  /** Asientos por tile (sillas, bancos, tronos). */
  private readonly seats = new Map<number, Direction | 'any'>();
  /** Puertas por tile, y cuáles están abiertas (lo único del mapa que cambia). */
  private readonly doors = new Map<number, StaticKind>();
  private readonly openDoors = new Set<number>();

  constructor(data: TileMapInit) {
    if (data.terrain.length !== data.width * data.height) {
      throw new Error(
        `Mapa inválido: se esperaban ${data.width * data.height} tiles y hay ${data.terrain.length}`,
      );
    }
    this.width = data.width;
    this.height = data.height;
    this.terrain = data.terrain;
    this.heights = data.heights?.length === data.width * data.height ? data.heights : undefined;
    this.statics = data.statics ?? [];
    this.regions = data.regions ?? [];
    this.teleporters = data.teleporters ?? [];
    this.signs = data.signs ?? [];
    this.blocked = new Uint8Array(data.width * data.height);
    for (const placed of this.statics) {
      const seat = SEATS[placed.kind];
      if (seat !== undefined) this.seats.set(placed.y * this.width + placed.x, seat);
      if (DOORS[placed.kind]) this.doors.set(placed.y * this.width + placed.x, placed.kind);
      const { blocking, footprint } = STATICS[placed.kind];
      if (!blocking) continue;
      for (let dy = 0; dy < footprint; dy++)
        for (let dx = 0; dx < footprint; dx++) {
          const tile = { x: placed.x + dx, y: placed.y + dy };
          if (this.contains(tile)) this.blocked[tile.y * this.width + tile.x] = 1;
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

  /** Altura del tile en escalones; fuera del mapa, la del borde más cercano. */
  heightAt(position: Position): number {
    if (!this.heights) return 0;
    const x = Math.max(0, Math.min(this.width - 1, Math.round(position.x)));
    const y = Math.max(0, Math.min(this.height - 1, Math.round(position.y)));
    return this.heights[y * this.width + x] ?? 0;
  }

  /** El asiento del tile (hacia dónde mira quien se sienta), si hay uno. */
  seatAt(position: Position): Direction | 'any' | undefined {
    if (!this.contains(position)) return undefined;
    return this.seats.get(position.y * this.width + position.x);
  }

  /** La puerta del tile (su tipo, cerrada), si hay una. */
  doorAt(position: Position): StaticKind | undefined {
    if (!this.contains(position)) return undefined;
    return this.doors.get(position.y * this.width + position.x);
  }

  isDoorOpen(position: Position): boolean {
    return this.contains(position) && this.openDoors.has(position.y * this.width + position.x);
  }

  /** Abre o cierra la puerta del tile (si hay una). Devuelve si cambió algo. */
  setDoorOpen(position: Position, open: boolean): boolean {
    if (!this.doorAt(position)) return false;
    const i = position.y * this.width + position.x;
    if (this.openDoors.has(i) === open) return false;
    if (open) this.openDoors.add(i);
    else this.openDoors.delete(i);
    return true;
  }

  /** Las puertas abiertas (para contarle a quien llega cómo está el mundo). */
  openDoorPositions(): Position[] {
    return [...this.openDoors].map((i) => ({ x: i % this.width, y: Math.floor(i / this.width) }));
  }

  /** Transitable: terreno caminable y sin objetos que bloqueen (una puerta abierta no bloquea). */
  isWalkable(position: Position): boolean {
    const terrain = this.terrainAt(position);
    if (terrain === undefined || !TERRAINS[terrain].walkable) return false;
    const i = position.y * this.width + position.x;
    return this.blocked[i] === 0 || this.openDoors.has(i);
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
      ...(this.heights ? { heights: this.heights } : {}),
    };
  }
}
