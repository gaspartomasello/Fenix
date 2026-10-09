import {
  MELEE_RANGE,
  armorOf,
  resolveAttack,
  tileDistance,
  weaponOf,
  type DefenderStats,
  type SkillKey,
  type Weapon,
} from '@fenix/shared';
import { Creature } from '../creatures/creature';
import { emptyChanges, type ItemChanges } from '../items/items';
import type { Mobile } from '../mobile';
import { Player } from '../player';
import type { World } from '../world';

export interface SkillGain {
  readonly player: Player;
  readonly skill: SkillKey;
}

export interface SwingResult {
  readonly attacker: Mobile;
  readonly target: Mobile;
  readonly hit: boolean;
  readonly blocked: boolean;
  readonly damage: number;
  /** Este golpe lo mató. */
  readonly killed: boolean;
  /** Habilidades que subieron con este golpe. */
  readonly gains: readonly SkillGain[];
  /** Disparo a distancia. */
  readonly ranged: boolean;
  /** Munición gastada (flechas). */
  readonly itemChanges: ItemChanges | null;
}

export function weaponFor(mobile: Mobile, world: World): Weapon {
  return mobile instanceof Creature
    ? mobile.definition.weapon
    : weaponOf(world.items.lookOf(mobile.id));
}

/** Habilidad de pelea de un mobile: la del arma que usa (jugador) o la fija de la criatura. */
function fightingSkill(mobile: Mobile, world: World): number {
  if (mobile instanceof Player) return mobile.skills.get(weaponFor(mobile, world).skill);
  return mobile instanceof Creature ? mobile.definition.skill : 0;
}

function defenseFor(mobile: Mobile, world: World): DefenderStats {
  if (mobile instanceof Player) {
    const look = world.items.lookOf(mobile.id);
    return {
      armor: armorOf(look) + (mobile.combat.effect('protection')?.amount ?? 0),
      skill: fightingSkill(mobile, world),
      parrying: look.leftHand ? mobile.skills.get('parrying') : 0,
    };
  }
  const armor =
    (mobile instanceof Creature ? mobile.definition.armor : 0) +
    (mobile.combat.effect('protection')?.amount ?? 0);
  return { armor, skill: fightingSkill(mobile, world), parrying: 0 };
}

/** ¿Le faltan flechas para el arma que tiene en la mano? */
export function outOfAmmo(player: Player, world: World): boolean {
  const ammo = weaponFor(player, world).ammo;
  return ammo !== undefined && world.items.countInBackpack(player.id, ammo) === 0;
}

/**
 * Intenta un golpe si ambos están vivos, al alcance y al atacante le toca.
 * Devuelve null si todavía no puede golpear. Los jugadores practican al pelear:
 * el atacante su arma y Tácticas; el defensor con escudo, Parada.
 */
export function trySwing(
  attacker: Mobile,
  target: Mobile,
  world: World,
  now: number,
  random: () => number,
): SwingResult | null {
  if (attacker.combat.isDead || target.combat.isDead) return null;
  if (attacker.combat.isParalyzed) return null;
  const weapon = weaponFor(attacker, world);
  const range = weapon.range ?? MELEE_RANGE;
  if (tileDistance(attacker.position, target.position) > range) return null;
  if (now < attacker.combat.nextSwingAt) return null;

  // Los arcos gastan una flecha por disparo; sin flechas no se dispara.
  let itemChanges: ItemChanges | null = null;
  if (weapon.ammo && attacker instanceof Player) {
    itemChanges = emptyChanges();
    if (!world.items.consumeFromBackpack(attacker.id, weapon.ammo, 1, itemChanges)) return null;
  }
  attacker.combat.nextSwingAt = now + weapon.swingMs;
  const tactics = attacker instanceof Player ? attacker.skills.get('tactics') : 500;
  const defense = defenseFor(target, world);
  const outcome = resolveAttack(
    {
      strength: attacker.combat.attributes.strength,
      weapon,
      skill: fightingSkill(attacker, world),
      tactics,
    },
    defense,
    random,
  );
  const killed = outcome.hit && !outcome.blocked ? target.combat.takeDamage(outcome.damage) : false;

  const gains: SkillGain[] = [];
  if (attacker instanceof Player) {
    for (const skill of [weapon.skill, 'tactics'] as const) {
      if (attacker.skills.tryGain(skill, random)) gains.push({ player: attacker, skill });
    }
  }
  if (
    target instanceof Player &&
    defense.parrying > 0 &&
    target.skills.tryGain('parrying', random)
  ) {
    gains.push({ player: target, skill: 'parrying' });
  }
  return {
    attacker,
    target,
    hit: outcome.hit,
    blocked: outcome.blocked,
    damage: outcome.damage,
    killed,
    gains,
    ranged: range > MELEE_RANGE,
    itemChanges,
  };
}
