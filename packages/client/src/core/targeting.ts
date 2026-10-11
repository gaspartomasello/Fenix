import { tileDistance, type EntityId, type Position } from '@fenix/shared';

/** Lo que hace falta saber de alguien para elegirlo como objetivo. */
export interface TargetCandidate {
  readonly id: EntityId;
  readonly position: Position;
  readonly body: string;
  readonly dead: boolean;
  readonly npc: unknown;
  /** Criatura con dueño (invocación o montura): no se elige sola. */
  readonly ownerId: EntityId | null;
}

/** Hasta dónde busca el botón de atacar. */
export const AUTO_TARGET_RANGE = 12;

/**
 * El botón de atacar (pensado para el celular, sin apuntar con el dedo):
 * elige la criatura salvaje viva más cercana y sigue con ella mientras viva.
 * Con `next`, pasa a la siguiente más cercana (así se recorren todas). Nunca
 * elige personas, gente del pueblo ni criaturas con dueño (atacarlas tiene
 * consecuencias: eso se hace a propósito, tocándolas).
 */
export function nextAutoTarget(
  candidates: Iterable<TargetCandidate>,
  from: Position,
  current: EntityId | null,
  next = false,
): EntityId | null {
  const near = [...candidates]
    .filter(
      (c) =>
        c.body !== 'human' &&
        !c.dead &&
        !c.npc &&
        c.ownerId === null &&
        tileDistance(c.position, from) <= AUTO_TARGET_RANGE,
    )
    .sort(
      (a, b) =>
        tileDistance(a.position, from) - tileDistance(b.position, from) || a.id.localeCompare(b.id),
    );
  if (near.length === 0) return null;
  const index = near.findIndex((c) => c.id === current);
  if (!next && index >= 0) return current;
  return (near[(index + 1) % near.length] ?? near[0])?.id ?? null;
}
