import { Direction } from '../geometry/direction';
import type { Position } from '../geometry/position';

/**
 * Rastrear, como en UO: se elige qué buscar (animales, monstruos, personas o
 * vecinos) y se ven los rastros a la redonda, con su dirección y distancia;
 * se puede seguir uno con una flecha. Todo en décimas (0–1000).
 */

export const TRACKING_CATEGORIES = ['animals', 'monsters', 'people', 'npcs'] as const;
export type TrackingCategory = (typeof TRACKING_CATEGORIES)[number];

export const TRACKING_CATEGORY_NAMES: Readonly<Record<TrackingCategory, string>> = {
  animals: 'Animales',
  monsters: 'Monstruos',
  people: 'Personas',
  npcs: 'Vecinos',
};

export function isTrackingCategory(value: unknown): value is TrackingCategory {
  return typeof value === 'string' && (TRACKING_CATEGORIES as readonly string[]).includes(value);
}

/** Hasta dónde llegan los rastros (en tiles): de 12 sin práctica a 37 con todo. */
export function trackingRange(tracking: number): number {
  return 12 + Math.floor(tracking / 40);
}

/** Cuántos rastros se muestran como mucho (los más cercanos). */
export const TRACKING_LIST_MAX = 12;

/** Cuánto dura seguir un rastro con la flecha. */
export const TRACKING_FOLLOW_MS = 90_000;

/**
 * Probabilidad de notar un rastro: más fácil cerca y con práctica (del 40 %
 * al 95 %); lejos, en el borde del alcance, cuesta más.
 */
export function trackChance(tracking: number, distance: number, range: number): number {
  const near = 1 - Math.min(1, distance / Math.max(1, range));
  return Math.max(0.1, Math.min(0.95, 0.4 + tracking / 2500 + near * 0.35));
}

const COMPASS: Readonly<Record<Direction, string>> = {
  [Direction.North]: 'al norte',
  [Direction.NorthEast]: 'al noreste',
  [Direction.East]: 'al este',
  [Direction.SouthEast]: 'al sureste',
  [Direction.South]: 'al sur',
  [Direction.SouthWest]: 'al suroeste',
  [Direction.West]: 'al oeste',
  [Direction.NorthWest]: 'al noroeste',
};

/** Hacia dónde queda `to` mirando desde `from` (en el mapa: el norte es -y). */
export function compassDirection(from: Position, to: Position): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = Math.atan2(dx, -dy);
  const octant = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
  return [
    Direction.North,
    Direction.NorthEast,
    Direction.East,
    Direction.SouthEast,
    Direction.South,
    Direction.SouthWest,
    Direction.West,
    Direction.NorthWest,
  ][octant] as Direction;
}

/** "al noreste, a unos 14 pasos". */
export function describeTrack(direction: Direction, distance: number): string {
  return distance <= 1 ? 'acá al lado' : `${COMPASS[direction]}, a unos ${distance} pasos`;
}
