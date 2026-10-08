import {
  armorOf,
  inMeleeRange,
  resolveAttack,
  weaponOf,
  type DefenderStats,
  type Weapon,
} from '@fenix/shared';
import { Creature } from '../creatures/creature';
import type { Mobile } from '../mobile';
import type { World } from '../world';

export interface SwingResult {
  readonly attacker: Mobile;
  readonly target: Mobile;
  readonly hit: boolean;
  readonly damage: number;
  /** Este golpe lo mató. */
  readonly killed: boolean;
}

function weaponFor(mobile: Mobile, world: World): Weapon {
  return mobile instanceof Creature
    ? mobile.definition.weapon
    : weaponOf(world.items.lookOf(mobile.id));
}

function defenseFor(mobile: Mobile, world: World): DefenderStats {
  const armor =
    mobile instanceof Creature ? mobile.definition.armor : armorOf(world.items.lookOf(mobile.id));
  return { dexterity: mobile.combat.attributes.dexterity, armor };
}

/**
 * Intenta un golpe si ambos están vivos, al alcance y al atacante le toca.
 * Devuelve null si todavía no puede golpear.
 */
export function trySwing(
  attacker: Mobile,
  target: Mobile,
  world: World,
  now: number,
  random: () => number,
): SwingResult | null {
  if (attacker.combat.isDead || target.combat.isDead) return null;
  if (!inMeleeRange(attacker.position, target.position)) return null;
  if (now < attacker.combat.nextSwingAt) return null;

  const weapon = weaponFor(attacker, world);
  attacker.combat.nextSwingAt = now + weapon.swingMs;
  const { strength, dexterity } = attacker.combat.attributes;
  const outcome = resolveAttack({ strength, dexterity, weapon }, defenseFor(target, world), random);
  const killed = outcome.hit ? target.combat.takeDamage(outcome.damage) : false;
  return { attacker, target, hit: outcome.hit, damage: outcome.damage, killed };
}
