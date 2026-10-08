import {
  ALL_DIRECTIONS,
  canStep,
  directionBetween,
  inMeleeRange,
  step,
  tileDistance,
  type Direction,
  type Position,
} from '@fenix/shared';
import { Player } from '../player';
import type { World } from '../world';
import { LEASH_RANGE, WANDER_RANGE, type Creature } from './creature';

/**
 * Decide el objetivo de una criatura: sigue al actual mientras esté vivo y
 * no se haya alejado demasiado de su lugar; si no, busca al jugador vivo
 * más cercano dentro de su rango de agresión.
 */
export function updateTarget(creature: Creature, world: World): Player | null {
  const current = creature.combat.targetId ? world.getMobile(creature.combat.targetId) : undefined;
  if (
    current instanceof Player &&
    !current.combat.isDead &&
    tileDistance(current.position, creature.home) <= LEASH_RANGE
  ) {
    return current;
  }
  creature.combat.targetId = null;

  let best: Player | null = null;
  for (const mobile of world.mobilesNear(creature.position)) {
    if (!(mobile instanceof Player) || mobile.combat.isDead) continue;
    const distance = tileDistance(mobile.position, creature.position);
    if (distance > creature.definition.aggroRange) continue;
    if (!best || distance < tileDistance(best.position, creature.position)) best = mobile;
  }
  if (best) creature.combat.targetId = best.id;
  return best;
}

/** Hacia dónde dar el próximo paso (o null para quedarse quieta). */
export function chooseStep(
  creature: Creature,
  target: Player | null,
  world: World,
  random: () => number,
): Direction | null {
  if (target) {
    if (inMeleeRange(creature.position, target.position)) return null;
    return stepTowards(creature, target.position, world);
  }
  if (tileDistance(creature.position, creature.home) > WANDER_RANGE) {
    return stepTowards(creature, creature.home, world);
  }
  // Deambular de a ratos.
  if (random() < 0.35) return null;
  const direction = ALL_DIRECTIONS[Math.floor(random() * ALL_DIRECTIONS.length)] ?? null;
  if (direction === null || !canMoveTo(creature, direction, world)) return null;
  const next = step(creature.position, direction);
  return tileDistance(next, creature.home) <= WANDER_RANGE ? direction : null;
}

/** Paso directo hacia el destino; si está bloqueado, prueba los dos laterales. */
function stepTowards(creature: Creature, goal: Position, world: World): Direction | null {
  const ideal = directionBetween(creature.position, goal);
  if (ideal === null) return null;
  for (const turn of [0, 1, -1, 2, -2]) {
    const direction = ((((ideal + turn) % 8) + 8) % 8) as Direction;
    if (canMoveTo(creature, direction, world)) return direction;
  }
  return null;
}

/** Las criaturas no pisan a nadie ni entran a zonas con nombre: los pueblos son seguros, como en UO. */
export function canMoveTo(creature: Creature, direction: Direction, world: World): boolean {
  const next = step(creature.position, direction);
  return (
    canStep(world.map, creature.position, direction) &&
    !world.map.regionAt(next) &&
    !world.isOccupied(next, creature.id)
  );
}
