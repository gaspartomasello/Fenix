import type { Position } from './position';

/**
 * Las 8 direcciones con la misma numeración que Ultima Online.
 * En pantalla isométrica el Norte apunta hacia arriba a la derecha.
 */
export const Direction = {
  North: 0,
  NorthEast: 1,
  East: 2,
  SouthEast: 3,
  South: 4,
  SouthWest: 5,
  West: 6,
  NorthWest: 7,
} as const;

export type Direction = (typeof Direction)[keyof typeof Direction];

export const ALL_DIRECTIONS: readonly Direction[] = [0, 1, 2, 3, 4, 5, 6, 7];

const OFFSETS: Readonly<Record<Direction, Position>> = {
  [Direction.North]: { x: 0, y: -1 },
  [Direction.NorthEast]: { x: 1, y: -1 },
  [Direction.East]: { x: 1, y: 0 },
  [Direction.SouthEast]: { x: 1, y: 1 },
  [Direction.South]: { x: 0, y: 1 },
  [Direction.SouthWest]: { x: -1, y: 1 },
  [Direction.West]: { x: -1, y: 0 },
  [Direction.NorthWest]: { x: -1, y: -1 },
};

export function isDirection(value: unknown): value is Direction {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 7;
}

export function directionOffset(direction: Direction): Position {
  return OFFSETS[direction];
}

export function step(from: Position, direction: Direction): Position {
  const offset = OFFSETS[direction];
  return { x: from.x + offset.x, y: from.y + offset.y };
}

/** Dirección del paso que lleva de `from` a `to` (deben ser adyacentes o iguales). */
export function directionBetween(from: Position, to: Position): Direction | null {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  const found = ALL_DIRECTIONS.find((d) => OFFSETS[d].x === dx && OFFSETS[d].y === dy);
  return found ?? null;
}
