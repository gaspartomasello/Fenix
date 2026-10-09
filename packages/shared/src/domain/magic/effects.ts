/**
 * Efectos de estado (como los "buffs" de UO): atributos subidos o bajados
 * por hechizos o pociones, protección, veneno, parálisis y visión nocturna.
 */
export const EFFECT_KINDS = [
  'strength',
  'dexterity',
  'intelligence',
  'protection',
  'poison',
  'paralyzed',
  'night-sight',
] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];

export type AttributeKey = 'strength' | 'dexterity' | 'intelligence';

export const EFFECT_NAMES: Readonly<Record<EffectKind, string>> = {
  strength: 'Fuerza',
  dexterity: 'Destreza',
  intelligence: 'Inteligencia',
  protection: 'Protección',
  poison: 'Envenenado',
  paralyzed: 'Paralizado',
  'night-sight': 'Visión nocturna',
};

/** Un efecto activo, tal como lo ve su dueño. */
export interface EffectSnapshot {
  readonly kind: EffectKind;
  /** Cuánto cambia el atributo (+/−), o el nivel del veneno; 0 si no aplica. */
  readonly amount: number;
  /** Cuánto le queda, en milisegundos. */
  readonly remainingMs: number;
}

export function isEffectKind(value: unknown): value is EffectKind {
  return typeof value === 'string' && (EFFECT_KINDS as readonly string[]).includes(value);
}

/** Cuánto sube o baja un atributo un hechizo: 3 puntos más uno cada 10 de Magia. */
export function attributeModifier(magery: number): number {
  return 3 + Math.floor(magery / 100);
}

/** Duración de los hechizos que duran: de 30 s a 2 min y medio con la Magia al máximo. */
export function spellDurationMs(magery: number): number {
  return 30_000 + magery * 120;
}

/** Parálisis: de 2 a 7 segundos según la Magia. */
export function paralyzeDurationMs(magery: number): number {
  return 2_000 + magery * 5;
}

/** Defensa extra del hechizo Protección. */
export const PROTECTION_ARMOR = 8;

/** Veneno: nivel 1 a 3 según la Magia; quita vida cada 2 s, un rato. */
export const POISON_TICK_MS = 2_000;
export const MAX_POISON_LEVEL = 3;

export function poisonLevel(magery: number): number {
  return Math.min(MAX_POISON_LEVEL, 1 + Math.floor(magery / 350));
}

export function poisonDurationMs(level: number): number {
  return (8 + level * 2) * POISON_TICK_MS;
}

/** Daño de cada pulso de veneno. */
export function poisonDamage(level: number, random: () => number): number {
  return level * 2 - 1 + Math.floor(random() * (level + 1));
}

/** Probabilidad de sacar un veneno de cierto nivel con una cura (`power` 0–1). */
export function cureChance(power: number, level: number): number {
  return Math.max(0.1, Math.min(1, power + 0.4 - level * 0.2));
}
