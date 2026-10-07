import type { FractionalPosition } from '../core/entity';
import { depthOf } from './iso';

/**
 * Orden de dibujo en la capa de entidades. Lo que está más al sur en
 * pantalla va adelante; a igual profundidad, el personaje va sobre el objeto.
 */
export function staticDepth(position: FractionalPosition): number {
  return depthOf(position) * 10 + 4;
}

export function characterDepth(position: FractionalPosition): number {
  return depthOf(position) * 10 + 6;
}
