import type { Direction, MoveMode } from '@fenix/shared';
import { screenVectorToDirection } from '../rendering/iso';

/** Lo que el jugador quiere hacer este frame con el movimiento. */
export interface MovementIntent {
  readonly direction: Direction;
  readonly mode: MoveMode;
}

/** Flechas o WASD → vector de pantalla (arriba en pantalla = NorthWest en UO). */
export function keysToIntent(keys: ReadonlySet<string>, running: boolean): MovementIntent | null {
  const up = keys.has('ArrowUp') || keys.has('KeyW');
  const down = keys.has('ArrowDown') || keys.has('KeyS');
  const left = keys.has('ArrowLeft') || keys.has('KeyA');
  const right = keys.has('ArrowRight') || keys.has('KeyD');
  const direction = screenVectorToDirection(
    Number(right) - Number(left),
    Number(down) - Number(up),
  );
  return direction === null ? null : { direction, mode: running ? 'run' : 'walk' };
}

/** Distancia del cursor al personaje a partir de la cual se corre, como en UO. */
export const RUN_DISTANCE_PX = 140;
const DEAD_ZONE_PX = 12;

/** Botón derecho apretado: caminar hacia el cursor; lejos del personaje, correr. */
export function pointerToIntent(dx: number, dy: number): MovementIntent | null {
  const distance = Math.hypot(dx, dy);
  if (distance < DEAD_ZONE_PX) return null;
  const direction = screenVectorToDirection(dx, dy);
  if (direction === null) return null;
  return { direction, mode: distance > RUN_DISTANCE_PX ? 'run' : 'walk' };
}
