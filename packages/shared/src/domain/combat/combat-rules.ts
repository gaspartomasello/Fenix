import { tileDistance, type Position } from '../geometry/position';
import type { MoveMode } from '../rules/movement';
import type { Weapon } from './weapons';

/** Distancia de golpe cuerpo a cuerpo: tiles vecinos, diagonales incluidas. */
export const MELEE_RANGE = 1;

export interface AttackerStats {
  readonly strength: number;
  readonly weapon: Weapon;
  /** Habilidad con el arma y Tácticas, en décimas. */
  readonly skill: number;
  readonly tactics: number;
}

export interface DefenderStats {
  readonly armor: number;
  /** Habilidad de pelea del defensor, en décimas. */
  readonly skill: number;
  /** Parada en décimas si tiene escudo; 0 si no. */
  readonly parrying: number;
}

export interface AttackOutcome {
  readonly hit: boolean;
  /** El escudo detuvo el golpe. */
  readonly blocked: boolean;
  readonly damage: number;
}

export function inMeleeRange(a: Position, b: Position): boolean {
  return tileDistance(a, b) <= MELEE_RANGE;
}

/**
 * Probabilidad de acertar según las habilidades de ambos (fórmula de UO):
 * (ataque + 20) / ((defensa + 20) × 2), entre 10 % y 95 %. A igual habilidad, 50 %.
 */
export function hitChance(attackerSkill: number, defenderSkill: number): number {
  const chance = (attackerSkill / 10 + 20) / ((defenderSkill / 10 + 20) * 2);
  return Math.max(0.1, Math.min(0.95, chance));
}

/** Probabilidad de bloquear con escudo: hasta 25 % con Parada al máximo. */
export function blockChance(parrying: number): number {
  return parrying / 4000;
}

/**
 * Resuelve un golpe: acierto según habilidades; el escudo puede bloquearlo;
 * daño del arma más bonus por fuerza, multiplicado por Tácticas (60 %–100 %);
 * la armadura absorbe hasta un 60 %. Un golpe que pasa hace al menos 1.
 */
export function resolveAttack(
  attacker: AttackerStats,
  defender: DefenderStats,
  random: () => number,
): AttackOutcome {
  if (random() >= hitChance(attacker.skill, defender.skill)) {
    return { hit: false, blocked: false, damage: 0 };
  }
  if (defender.parrying > 0 && random() < blockChance(defender.parrying)) {
    return { hit: true, blocked: true, damage: 0 };
  }
  const { minDamage, maxDamage } = attacker.weapon;
  const base =
    minDamage +
    Math.floor(random() * (maxDamage - minDamage + 1)) +
    Math.floor(attacker.strength / 20);
  const raw = Math.round(base * (0.6 + attacker.tactics / 2500));
  const absorbed = Math.round(raw * Math.min(0.6, defender.armor / 50));
  return { hit: true, blocked: false, damage: Math.max(1, raw - absorbed) };
}

/** Correr gasta energía: un punto cada 4 tiles. Sin energía, solo se puede caminar. */
export const RUN_STEPS_PER_STAMINA = 4;

export function effectiveMoveMode(mode: MoveMode, stamina: number): MoveMode {
  return mode === 'run' && stamina <= 0 ? 'walk' : mode;
}
