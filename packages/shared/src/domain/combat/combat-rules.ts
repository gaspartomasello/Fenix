import { tileDistance, type Position } from '../geometry/position';
import type { MoveMode } from '../rules/movement';
import type { Weapon } from './weapons';

/** Distancia de golpe cuerpo a cuerpo: tiles vecinos, diagonales incluidas. */
export const MELEE_RANGE = 1;

export interface AttackerStats {
  readonly strength: number;
  readonly dexterity: number;
  readonly weapon: Weapon;
}

export interface DefenderStats {
  readonly dexterity: number;
  readonly armor: number;
}

export interface AttackOutcome {
  readonly hit: boolean;
  readonly damage: number;
}

export function inMeleeRange(a: Position, b: Position): boolean {
  return tileDistance(a, b) <= MELEE_RANGE;
}

/** Probabilidad de acertar: 60 % base, ajustada por la diferencia de destreza (30 %–90 %). */
export function hitChance(attackerDexterity: number, defenderDexterity: number): number {
  return Math.max(0.3, Math.min(0.9, 0.6 + (attackerDexterity - defenderDexterity) / 200));
}

/**
 * Resuelve un golpe: acierto según destreza; daño del arma más un bonus por
 * fuerza; la armadura absorbe hasta un 60 %. Un golpe acertado hace al menos 1.
 */
export function resolveAttack(
  attacker: AttackerStats,
  defender: DefenderStats,
  random: () => number,
): AttackOutcome {
  if (random() >= hitChance(attacker.dexterity, defender.dexterity))
    return { hit: false, damage: 0 };
  const { minDamage, maxDamage } = attacker.weapon;
  const raw =
    minDamage +
    Math.floor(random() * (maxDamage - minDamage + 1)) +
    Math.floor(attacker.strength / 20);
  const absorbed = Math.round(raw * Math.min(0.6, defender.armor / 50));
  return { hit: true, damage: Math.max(1, raw - absorbed) };
}

/** Correr gasta energía: un punto cada 4 tiles. Sin energía, solo se puede caminar. */
export const RUN_STEPS_PER_STAMINA = 4;

export function effectiveMoveMode(mode: MoveMode, stamina: number): MoveMode {
  return mode === 'run' && stamina <= 0 ? 'walk' : mode;
}
