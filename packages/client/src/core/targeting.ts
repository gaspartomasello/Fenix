import { tileDistance, type Position } from '@fenix/shared/geometry/position';
import type { EntityId } from '@fenix/shared/protocol/messages';

/** Lo que hace falta saber de alguien para elegirlo como objetivo. */
export interface TargetCandidate {
  readonly id: EntityId;
  readonly position: Position;
  readonly body: string;
  readonly dead: boolean;
  readonly npc: unknown;
  /** Criatura con dueño (invocación o montura): no se elige sola. */
  readonly ownerId: EntityId | null;
  /** Persona transformada: tampoco se elige sola. */
  readonly polymorphed?: boolean;
}

/** Hasta dónde busca el botón de atacar. */
export const AUTO_TARGET_RANGE = 12;

/**
 * El botón de atacar (pensado para el celular, sin apuntar con el dedo):
 * elige la criatura salvaje viva más cercana y sigue con ella mientras viva.
 * Con `step` 1 pasa a la siguiente más cercana y con -1 a la anterior (así se
 * recorren todas, en la PC con E y Q). Nunca
 * elige personas, gente del pueblo ni criaturas con dueño (atacarlas tiene
 * consecuencias: eso se hace a propósito, tocándolas).
 */
export function nextAutoTarget(
  candidates: Iterable<TargetCandidate>,
  from: Position,
  current: EntityId | null,
  step: -1 | 0 | 1 = 0,
): EntityId | null {
  const near = [...candidates]
    .filter(
      (c) =>
        c.body !== 'human' &&
        !c.dead &&
        !c.npc &&
        c.ownerId === null &&
        !c.polymorphed &&
        tileDistance(c.position, from) <= AUTO_TARGET_RANGE,
    )
    .sort(
      (a, b) =>
        tileDistance(a.position, from) - tileDistance(b.position, from) || a.id.localeCompare(b.id),
    );
  if (near.length === 0) return null;
  const index = near.findIndex((c) => c.id === current);
  if (step === 0 && index >= 0) return current;
  // Sin objetivo, la anterior empieza por la más lejana.
  const start = index >= 0 ? index : step < 0 ? 0 : -1;
  const target = (start + (step < 0 ? -1 : 1) + near.length) % near.length;
  return near[target]?.id ?? null;
}
