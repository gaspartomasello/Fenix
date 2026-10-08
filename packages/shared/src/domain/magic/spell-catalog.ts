import type { ItemKind } from '../items/item-catalog';

export const SPELL_KEYS = ['heal', 'magic-arrow', 'light', 'fireball', 'greater-heal'] as const;
export type SpellKey = (typeof SPELL_KEYS)[number];

/** A quién se lanza: a uno mismo o a una criatura elegida. */
export type SpellTarget = 'self' | 'creature';

export interface SpellDefinition {
  readonly key: SpellKey;
  readonly name: string;
  /** Palabras que dice el personaje al lanzarlo (inventadas para Fenix). */
  readonly words: string;
  readonly mana: number;
  readonly reagents: readonly { readonly kind: ItemKind; readonly amount: number }[];
  /** Magia mínima (en décimas) para poder intentarlo. */
  readonly minSkill: number;
  readonly target: SpellTarget;
  readonly castMs: number;
  /** Curación o daño base (antes del bonus por Magia). */
  readonly power?: readonly [number, number];
}

export const SPELLS: Readonly<Record<SpellKey, SpellDefinition>> = {
  heal: {
    key: 'heal',
    name: 'Curar',
    words: 'Sana Vulnus',
    mana: 4,
    reagents: [
      { kind: 'garlic', amount: 1 },
      { kind: 'ginseng', amount: 1 },
    ],
    minSkill: 0,
    target: 'self',
    castMs: 900,
    power: [7, 13],
  },
  'magic-arrow': {
    key: 'magic-arrow',
    name: 'Flecha mágica',
    words: 'Sagitta Arcana',
    mana: 4,
    reagents: [{ kind: 'sulfurous-ash', amount: 1 }],
    minSkill: 0,
    target: 'creature',
    castMs: 900,
    power: [4, 9],
  },
  light: {
    key: 'light',
    name: 'Luz',
    words: 'Lux Fiat',
    mana: 4,
    reagents: [{ kind: 'sulfurous-ash', amount: 1 }],
    minSkill: 0,
    target: 'self',
    castMs: 700,
  },
  fireball: {
    key: 'fireball',
    name: 'Bola de fuego',
    words: 'Ignis Globus',
    mana: 9,
    reagents: [
      { kind: 'black-pearl', amount: 1 },
      { kind: 'sulfurous-ash', amount: 1 },
    ],
    minSkill: 300,
    target: 'creature',
    castMs: 1500,
    power: [9, 17],
  },
  'greater-heal': {
    key: 'greater-heal',
    name: 'Gran curación',
    words: 'Sana Maior',
    mana: 11,
    reagents: [
      { kind: 'garlic', amount: 1 },
      { kind: 'ginseng', amount: 1 },
      { kind: 'mandrake-root', amount: 1 },
      { kind: 'spiders-silk', amount: 1 },
    ],
    minSkill: 400,
    target: 'self',
    castMs: 1800,
    power: [24, 34],
  },
};

/** Distancia máxima para lanzar un hechizo a otro. */
export const SPELL_RANGE = 10;

export function isSpellKey(value: unknown): value is SpellKey {
  return typeof value === 'string' && (SPELL_KEYS as readonly string[]).includes(value);
}

/** Probabilidad de que salga bien: 50 % en el mínimo, 100 % con 20 puntos más de Magia. */
export function spellSuccessChance(spell: SpellDefinition, magery: number): number {
  return Math.max(0.05, Math.min(1, 0.5 + (magery - spell.minSkill) / 400));
}

/** Potencia final: la base más un punto cada 10 de Magia. */
export function rollSpellPower(
  spell: SpellDefinition,
  magery: number,
  random: () => number,
): number {
  if (!spell.power) return 0;
  const [min, max] = spell.power;
  return min + Math.floor(random() * (max - min + 1)) + Math.floor(magery / 100);
}
