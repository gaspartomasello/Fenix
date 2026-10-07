/** Coordenada de un tile en el mapa (no en pantalla). */
export interface Position {
  readonly x: number;
  readonly y: number;
}

export function positionsEqual(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Distancia de Chebyshev: la que se usa en UO para rangos (diagonales cuentan 1). */
export function tileDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
