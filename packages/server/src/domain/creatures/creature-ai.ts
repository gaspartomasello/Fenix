import {
  ALL_DIRECTIONS,
  canStep,
  directionBetween,
  inMeleeRange,
  step,
  tileDistance,
  type Direction,
  type EntityId,
  type Position,
} from '@fenix/shared';
import type { Mobile } from '../mobile';
import { Npc } from '../npcs/npc';
import { Player } from '../player';
import type { World } from '../world';
import { LEASH_RANGE, WANDER_RANGE, type Creature } from './creature';

/**
 * Decide el objetivo de una criatura: sigue al actual mientras esté vivo y
 * no se haya alejado demasiado de su lugar; si no, busca al jugador vivo
 * más cercano dentro de su rango de agresión.
 */
export function updateTarget(creature: Creature, world: World): Mobile | null {
  if (creature.ownerId) return updateSummonTarget(creature, creature.ownerId, world);
  const current = creature.combat.targetId ? world.getMobile(creature.combat.targetId) : undefined;
  // Persigue a quien la atacó (persona o invocación) mientras no se aleje mucho de su lugar.
  if (
    current &&
    !(current instanceof Npc) &&
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

/**
 * Objetivo de una invocación: el de su dueño; si no tiene, quien esté
 * peleando contra el dueño o contra ella misma.
 */
function updateSummonTarget(creature: Creature, ownerId: EntityId, world: World): Mobile | null {
  const alive = (m: Mobile | undefined): m is Mobile =>
    m !== undefined && !m.combat.isDead && m.id !== creature.id && m.id !== ownerId;
  const owner = world.get(ownerId);
  const ordered = owner?.combat.targetId ? world.getMobile(owner.combat.targetId) : undefined;
  if (alive(ordered) && !(ordered instanceof Npc)) {
    creature.combat.targetId = ordered.id;
    return ordered;
  }
  const current = creature.combat.targetId ? world.getMobile(creature.combat.targetId) : undefined;
  if (alive(current) && tileDistance(current.position, creature.position) <= SUMMON_CHASE_RANGE)
    return current;
  const attacker = world
    .mobilesNear(creature.position)
    .find(
      (m) =>
        alive(m) &&
        (m.combat.targetId === ownerId || m.combat.targetId === creature.id) &&
        tileDistance(m.position, creature.position) <= SUMMON_CHASE_RANGE,
    );
  creature.combat.targetId = attacker?.id ?? null;
  return attacker ?? null;
}

/** Hasta dónde persigue una invocación a un enemigo que no eligió su dueño. */
const SUMMON_CHASE_RANGE = 10;
/** Distancia a la que una invocación sin pelea sigue a su dueño. */
const FOLLOW_DISTANCE = 2;

/** Hacia dónde dar el próximo paso (o null para quedarse quieta). */
export function chooseStep(
  creature: Creature,
  target: Mobile | null,
  world: World,
  random: () => number,
): Direction | null {
  if (target) {
    // Herida, huye; si sabe magia, pelea a distancia; si no, se acerca.
    if (creature.fleeing) return stepAway(creature, target.position, world);
    const distance = tileDistance(creature.position, target.position);
    const range = creature.definition.abilities?.spells?.range;
    if (range !== undefined) {
      if (distance < range - 1) return stepAway(creature, target.position, world);
      if (distance <= range) return null;
      return stepTowards(creature, target.position, world);
    }
    if (inMeleeRange(creature.position, target.position)) return null;
    return stepTowards(creature, target.position, world);
  }
  if (creature.ownerId) {
    // Sin pelea, la invocación sigue a su dueño.
    const owner = world.get(creature.ownerId);
    if (!owner || tileDistance(owner.position, creature.position) <= FOLLOW_DISTANCE) return null;
    return stepTowards(creature, owner.position, world);
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

/** Paso alejándose de un punto (para huir o tomar distancia). */
function stepAway(creature: Creature, from: Position, world: World): Direction | null {
  const toward = directionBetween(creature.position, from);
  if (toward === null) return null;
  for (const turn of [4, 3, 5, 2, 6]) {
    const direction = ((toward + turn) % 8) as Direction;
    if (canMoveTo(creature, direction, world)) return direction;
  }
  return null;
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

/**
 * Las criaturas no pisan a nadie ni entran a las zonas protegidas: los pueblos
 * son seguros, como en UO. Las invocaciones sí entran, siguiendo a su dueño.
 */
export function canMoveTo(creature: Creature, direction: Direction, world: World): boolean {
  const next = step(creature.position, direction);
  return (
    canStep(world.map, creature.position, direction) &&
    (creature.ownerId !== null || !world.map.safeZoneAt(next)) &&
    !world.isOccupied(next, creature.id)
  );
}
