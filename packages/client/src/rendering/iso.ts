import type { Direction } from '@fenix/shared';
import type { FractionalPosition } from '../core/entity';

/** Medio ancho/alto del rombo de un tile en pantalla (tiles de 44×44 como UO). */
export const TILE_HALF = 22;

/** Escala de pixel del arte generado (todo se dibuja a 1/2 y se agranda). */
export const ART_SCALE = 2;

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** Centro del tile en coordenadas de mundo-pantalla (antes de la cámara). */
export function tileToScreen({ x, y }: FractionalPosition): ScreenPoint {
  return { x: (x - y) * TILE_HALF, y: (x + y) * TILE_HALF };
}

export function screenToTile({ x, y }: ScreenPoint): FractionalPosition {
  return { x: (x / TILE_HALF + y / TILE_HALF) / 2, y: (y / TILE_HALF - x / TILE_HALF) / 2 };
}

/**
 * Dirección de UO correspondiente a un vector en pantalla. Los sectores se
 * cuentan desde "derecha" en sentido horario: derecha = NorthEast, abajo =
 * SouthEast, arriba = NorthWest, etc.
 */
export function screenVectorToDirection(dx: number, dy: number): Direction | null {
  if (dx === 0 && dy === 0) return null;
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return ((((sector + 1) % 8) + 8) % 8) as Direction;
}

/** Profundidad de dibujo: lo que está más "abajo" en pantalla va adelante. */
export function depthOf({ x, y }: FractionalPosition): number {
  return x + y;
}
