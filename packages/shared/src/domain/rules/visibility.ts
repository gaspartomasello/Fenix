import { tileDistance, type Position } from '../geometry/position';

/** Distancia (en tiles) a la que un jugador ve a otros y los oye hablar, como en UO. */
export const VIEW_RANGE = 18;

export function inViewRange(a: Position, b: Position): boolean {
  return tileDistance(a, b) <= VIEW_RANGE;
}
