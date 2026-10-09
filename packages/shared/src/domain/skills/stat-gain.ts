import type { AttributeKey } from '../magic/effects';
import type { SkillKey } from './skill-catalog';

/**
 * Atributos que se entrenan con cada habilidad, como en UO: el primero sube
 * más seguido que el segundo. Pelear da fuerza o destreza; la magia,
 * inteligencia; los oficios, según el trabajo.
 */
export const SKILL_STATS: Readonly<
  Record<SkillKey, readonly [AttributeKey] | readonly [AttributeKey, AttributeKey]>
> = {
  wrestling: ['strength', 'dexterity'],
  swordsmanship: ['strength', 'dexterity'],
  fencing: ['dexterity', 'strength'],
  'mace-fighting': ['strength'],
  archery: ['dexterity'],
  tactics: ['strength'],
  anatomy: ['intelligence', 'strength'],
  parrying: ['dexterity', 'strength'],
  healing: ['intelligence', 'dexterity'],
  magery: ['intelligence'],
  meditation: ['intelligence'],
  'magic-resist': ['intelligence', 'strength'],
  inscription: ['intelligence'],
  mining: ['strength'],
  lumberjacking: ['strength', 'dexterity'],
  fishing: ['strength', 'dexterity'],
  blacksmithy: ['strength'],
  tailoring: ['dexterity'],
  carpentry: ['strength', 'dexterity'],
  bowcraft: ['dexterity'],
  alchemy: ['intelligence', 'dexterity'],
  cooking: ['intelligence'],
};

/** Tope de cada atributo y de la suma de los tres. */
export const STAT_CAP = 100;
export const STAT_TOTAL_CAP = 225;
/** Usos de habilidades que tienen que pasar entre una subida de atributo y la siguiente. */
export const STAT_GAIN_MIN_USES = 15;

/** Probabilidad de que el atributo suba al usar la habilidad: menos cuanto más alto está. */
export function statGainChance(value: number, primary: boolean): number {
  if (value >= STAT_CAP) return 0;
  const chance = 0.06 * (1 - value / (STAT_CAP * 1.25));
  return primary ? chance : chance / 2;
}

export const ATTRIBUTE_NAMES: Readonly<Record<AttributeKey, string>> = {
  strength: 'Fuerza',
  dexterity: 'Destreza',
  intelligence: 'Inteligencia',
};
