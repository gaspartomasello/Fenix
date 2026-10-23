import {
  MELEE_RANGE,
  armorOf,
  resolveAttack,
  hasLineOfSight,
  tileDistance,
  weaponOf,
  type DefenderStats,
  type ItemKind,
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
  /** Daño que la Armadura reactiva del objetivo le devolvió al atacante. */
  readonly reflected?: number;
  /** El daño devuelto mató al atacante. */
  readonly reflectKilled?: boolean;
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

/** La munición (flechas o virotes) que le falta para el arma que tiene en la mano. */
export function missingAmmo(player: Player, world: World): ItemKind | null {
  const ammo = weaponFor(player, world).ammo;
  return ammo !== undefined && world.items.countInBackpack(player.id, ammo) === 0 ? ammo : null;
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
  // Ni flechas ni golpes atraviesan paredes, rejas o puertas cerradas.
  if (!hasLineOfSight(world.map, attacker.position, target.position)) return null;
  if (now < attacker.combat.nextSwingAt) return null;

  // Los arcos gastan una flecha por disparo; sin flechas no se dispara.
  let itemChanges: ItemChanges | null = null;
  if (weapon.ammo && attacker instanceof Player) {
    itemChanges = emptyChanges();
    if (!world.items.consumeFromBackpack(attacker.id, weapon.ammo, 1, itemChanges)) return null;
  }
  attacker.combat.nextSwingAt = now + weapon.swingMs;
  const tactics = attacker instanceof Player ? attacker.skills.get('tactics') : 500;
  const anatomy = attacker instanceof Player ? attacker.skills.get('anatomy') : 0;
  const defense = defenseFor(target, world);
  const outcome = resolveAttack(
    {
      strength: attacker.combat.attributes.strength,
      weapon,
      skill: fightingSkill(attacker, world),
      tactics,
      anatomy,
    },
    defense,
    random,
  );
  // A un invulnerable los golpes no le entran (se ven como parados).
  const immune = target.combat.invulnerable;
  const landed = outcome.hit && !outcome.blocked && !immune;
  // Armadura reactiva (solo cuerpo a cuerpo): se queda con la mitad del golpe
  // y se la devuelve a quien pega, hasta gastarse.
  let damage = outcome.damage;
  let reflected = 0;
  let reflectKilled = false;
  const reactive = target.combat.effect('reactive-armor');
  if (landed && reactive && range <= MELEE_RANGE && damage > 0) {
    reflected = Math.min(reactive.amount, Math.ceil(damage / 2));
    damage -= reflected;
    target.combat.drainEffect('reactive-armor', reflected);
    reflectKilled = attacker.combat.takeDamage(reflected);
  }
  const killed = landed ? target.combat.takeDamage(damage) : false;

  const gains: SkillGain[] = [];
  if (attacker instanceof Player) {
    // Anatomía se aprende pegando de verdad (golpes que entran).
    const practiced: SkillKey[] = [
      weapon.skill,
      'tactics',
      ...(landed ? ['anatomy' as const] : []),
    ];
    for (const skill of practiced) {
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
    blocked: outcome.blocked || immune,
    damage: immune ? 0 : damage,
    killed,
    gains,
    ranged: range > MELEE_RANGE,
    itemChanges,
    ...(reflected > 0 ? { reflected, reflectKilled } : {}),
  };
}
