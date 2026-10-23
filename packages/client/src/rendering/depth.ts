import type { FractionalPosition } from '../core/entity';
import { depthOf as flatDepth } from './iso';

/** Profundidad de una posición; con un mapa, los pisos altos van delante de su planta baja. */
let depthOf: (position: FractionalPosition) => number = flatDepth;

export function setDepthProjection(projection: (position: FractionalPosition) => number): void {
  depthOf = projection;
}

/** Profundidad (en tiles) de una posición, teniendo en cuenta los pisos altos. */
export function projectedDepth(position: FractionalPosition): number {
  return depthOf(position);
}

/**
 * Orden de dibujo en la capa de entidades. Lo que está más al sur en
 * pantalla va adelante; a igual profundidad, el personaje va sobre el objeto.
 */
export function staticDepth(position: FractionalPosition): number {
  return depthOf(position) * 10 + 4;
}

/** Los objetos del suelo van debajo de personajes y objetos fijos del mismo tile. */
export function groundItemDepth(position: FractionalPosition): number {
  return depthOf(position) * 10 + 2;
}

/** Un cuerpo tirado va sobre los objetos del suelo y debajo de todo lo que está parado. */
export function corpseDepth(position: FractionalPosition): number {
  return depthOf(position) * 10 + 3;
}

export function characterDepth(position: FractionalPosition): number {
  return depthOf(position) * 10 + 6;
}
