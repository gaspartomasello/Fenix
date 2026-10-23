import type { Position } from '../geometry/position';
import type { Direction } from '../geometry/direction';
import {
  DOORS,
  SEATS,
  STATICS,
  blocksSight,
  type StaticKind,
  type StaticPlacement,
} from './statics';
import { TERRAINS, Terrain } from './terrain';

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
  /**
   * Piso alto de un edificio (1 = primer piso): queda en otro lugar del mapa y
   * se llega por la escalera. Desde un piso no se apunta a otro.
   */
  readonly floor?: number;
  /**
   * Dónde se ve un piso alto: cuánto se corre para quedar justo encima de su
   * edificio (la posición a la vista es la del piso más este corrimiento).
   * Así desde arriba se ve la calle y desde la calle se ven los pisos.
   */
  readonly anchor?: { readonly x: number; readonly y: number };
}

/** Una posición tal como se ve: sobre el mapa del continente y a qué altura (0 = el suelo). */
export interface DisplayPosition {
  readonly x: number;
  readonly y: number;
  readonly level: number;
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
  /** Pisos altos anclados sobre sus edificios, y una cuadrícula para encontrarlos rápido. */
  private readonly anchored: RegionData[] = [];
  private readonly anchorGrid = new Map<number, RegionData[]>();
  private anchoredLeft = Infinity;
  /** Tiles que tapan la vista por un objeto fijo (paredes, rejas, puertas). */
  private readonly opaque: Uint8Array;
  /** Asientos por tile (sillas, bancos, tronos). */
  private readonly seats = new Map<number, Direction | 'any'>();
  /** Puertas por tile, y cuáles están abiertas (lo único del mapa que cambia). */
  private readonly doors = new Map<number, StaticKind>();
  private readonly openDoors = new Set<number>();
  /** Muros mágicos que cierran el paso un rato (piedra, energía). */
  private readonly barriers = new Set<number>();
  /** Cubiertas de barcos: tiles de agua que se pisan mientras el barco esté ahí. */
  private readonly decks = new Set<number>();

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
    for (const region of this.regions) {
      if (!region.anchor || !region.floor) continue;
      this.anchored.push(region);
      this.anchoredLeft = Math.min(this.anchoredLeft, region.x - 1);
      for (
        let cy = Math.floor((region.y - 1) / ANCHOR_CELL);
        cy <= Math.floor((region.y + region.height) / ANCHOR_CELL);
        cy++
      )
        for (
          let cx = Math.floor((region.x - 1) / ANCHOR_CELL);
          cx <= Math.floor((region.x + region.width) / ANCHOR_CELL);
          cx++
        ) {
          const key = gridKey(cx, cy);
          const list = this.anchorGrid.get(key);
          if (list) list.push(region);
          else this.anchorGrid.set(key, [region]);
        }
    }
    this.blocked = new Uint8Array(data.width * data.height);
    this.opaque = new Uint8Array(data.width * data.height);
    for (const placed of this.statics) {
      if (blocksSight(placed.kind)) {
        const side = STATICS[placed.kind].footprint;
        for (let dy = 0; dy < side; dy++)
          for (let dx = 0; dx < side; dx++) {
            const tile = { x: placed.x + dx, y: placed.y + dy };
            if (this.contains(tile)) this.opaque[tile.y * this.width + tile.x] = 1;
          }
      }
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

  /** Levanta o saca un muro mágico en el tile. */
  setBarrier(position: Position, on: boolean): void {
    if (!this.contains(position)) return;
    const i = position.y * this.width + position.x;
    if (on) this.barriers.add(i);
    else this.barriers.delete(i);
  }

  /** Pone o saca la cubierta de un barco sobre el tile. */
  setDeck(position: Position, on: boolean): void {
    if (!this.contains(position)) return;
    const i = position.y * this.width + position.x;
    if (on) this.decks.add(i);
    else this.decks.delete(i);
  }

  /** ¿Hay un objeto fijo que tapa el tile (un muelle, una roca en el agua)? */
  hasBlockingStatic(position: Position): boolean {
    return this.contains(position) && this.blocked[position.y * this.width + position.x] !== 0;
  }

  isDeck(position: Position): boolean {
    return this.contains(position) && this.decks.has(position.y * this.width + position.x);
  }

  /** Transitable: terreno caminable y sin objetos que bloqueen (una puerta abierta no bloquea). */
  isWalkable(position: Position): boolean {
    const terrain = this.terrainAt(position);
    if (terrain === undefined) return false;
    const i = position.y * this.width + position.x;
    if (this.barriers.has(i)) return false;
    if (this.decks.has(i)) return true;
    if (!TERRAINS[terrain].walkable) return false;
    return this.blocked[i] === 0 || this.openDoors.has(i);
  }

  /**
   * Dónde se ve una posición: la de un piso alto, encima de su edificio y a
   * su altura; cualquier otra, donde está y en el suelo.
   */
  displayOf<P extends { readonly x: number; readonly y: number }>(position: P): DisplayPosition {
    const region = this.anchoredAt(position.x, position.y);
    if (!region?.anchor) return { x: position.x, y: position.y, level: 0 };
    return {
      x: position.x + region.anchor.x,
      y: position.y + region.anchor.y,
      level: region.floor ?? 0,
    };
  }

  /** La posición de verdad de lo que se ve en (x, y) a la altura `level` (null si ahí no hay piso). */
  rawOf(display: { readonly x: number; readonly y: number }, level: number): Position | null {
    if (level === 0) return { x: display.x, y: display.y };
    for (const region of this.anchored) {
      if (region.floor !== level || !region.anchor) continue;
      const x = display.x - region.anchor.x;
      const y = display.y - region.anchor.y;
      if (
        x >= region.x &&
        y >= region.y &&
        x < region.x + region.width &&
        y < region.y + region.height
      )
        return { x, y };
    }
    return null;
  }

  /** Los pisos altos con ancla (para dibujarlos encima de sus edificios). */
  anchoredFloors(): readonly RegionData[] {
    return this.anchored;
  }

  /** El piso alto anclado que contiene (x, y), buscado por cuadrícula (se llama mucho al dibujar). */
  anchoredAt(x: number, y: number): RegionData | undefined {
    if (this.anchored.length === 0 || x < this.anchoredLeft) return undefined;
    const list = this.anchorGrid.get(
      gridKey(Math.floor(x / ANCHOR_CELL), Math.floor(y / ANCHOR_CELL)),
    );
    return list?.find(
      (r) =>
        x >= r.x - 0.5 && y >= r.y - 0.5 && x < r.x + r.width - 0.5 && y < r.y + r.height - 0.5,
    );
  }

  /** ¿Este tile tapa la vista? (una pared, una puerta cerrada, la roca de una montaña) */
  blocksSight(position: Position): boolean {
    const terrain = this.terrainAt(position);
    if (terrain === undefined) return true;
    if (terrain === Terrain.Rock || terrain === Terrain.Mountain) return true;
    const i = position.y * this.width + position.x;
    return this.opaque[i] !== 0 && !this.openDoors.has(i);
  }

  /**
   * El nivel del tile: el piso alto donde está (su zona) o la planta baja
   * (cadena vacía). Dos lugares de distinto nivel no se ven entre sí.
   */
  levelAt(position: Position): string {
    const region = this.regionAt(position);
    return region?.floor ? `${region.name}#${region.floor}` : '';
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

/** Lado de cada celda de la cuadrícula de pisos altos. */
const ANCHOR_CELL = 16;

function gridKey(cx: number, cy: number): number {
  return (cy + 4096) * 8192 + (cx + 4096);
}
