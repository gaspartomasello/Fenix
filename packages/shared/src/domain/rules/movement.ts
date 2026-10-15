import { directionOffset, type Direction } from '../geometry/direction';
import type { Position } from '../geometry/position';
import type { TileMap } from '../world/tile-map';

/** Tiempos de movimiento a pie, iguales a los de UO (ms por tile). */
export const MOVE_DURATION_MS = {
  walk: 400,
  run: 200,
} as const;

export type MoveMode = keyof typeof MOVE_DURATION_MS;

export function isMoveMode(value: unknown): value is MoveMode {
  return value === 'walk' || value === 'run';
}

/** Montado, como en UO: al paso se va como corriendo a pie y al galope, al doble. */
export const MOUNTED_MOVE_DURATION_MS = {
  walk: 200,
  run: 100,
} as const;

export function moveDuration(mode: MoveMode, mounted = false): number {
  return (mounted ? MOUNTED_MOVE_DURATION_MS : MOVE_DURATION_MS)[mode];
}

/**
 * Regla compartida de paso: el destino debe ser transitable y, en diagonal,
 * no se puede "cortar esquinas" entre dos tiles bloqueados.
 */
export function canStep(map: TileMap, from: Position, direction: Direction): boolean {
  const offset = directionOffset(direction);
  const target = { x: from.x + offset.x, y: from.y + offset.y };
  if (!map.isWalkable(target)) return false;

  const isDiagonal = offset.x !== 0 && offset.y !== 0;
  if (!isDiagonal) return true;

  const sideA = { x: from.x + offset.x, y: from.y };
  const sideB = { x: from.x, y: from.y + offset.y };
  return map.isWalkable(sideA) || map.isWalkable(sideB);
}
