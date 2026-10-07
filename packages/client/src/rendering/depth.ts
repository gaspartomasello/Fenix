import type { FractionalPosition } from '../core/entity';
import { depthOf } from './iso';

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

export function characterDepth(position: FractionalPosition): number {
  return depthOf(position) * 10 + 6;
}
