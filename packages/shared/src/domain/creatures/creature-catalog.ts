import type { ItemKind } from '../items/item-catalog';
import type { Weapon } from '../combat/weapons';

export const CREATURE_KINDS = ['rat', 'wolf', 'skeleton'] as const;
export type CreatureKind = (typeof CREATURE_KINDS)[number];

export interface LootEntry {
  readonly kind: ItemKind;
  /** Probabilidad de que aparezca (0–1). */
  readonly chance: number;
  readonly amount?: readonly [number, number];
}

export interface CreatureDefinition {
  readonly kind: CreatureKind;
  readonly name: string;
  readonly article: 'un' | 'una';
  readonly maxHits: number;
  readonly strength: number;
  readonly dexterity: number;
  readonly armor: number;
  /** Habilidad de pelea, en décimas. */
  readonly skill: number;
  readonly weapon: Weapon;
  /** Tiempo para avanzar un tile. */
  readonly moveMs: number;
  /** A qué distancia ve a un jugador y lo ataca. */
  readonly aggroRange: number;
  readonly loot: readonly LootEntry[];
}

export const CREATURES: Readonly<Record<CreatureKind, CreatureDefinition>> = {
  rat: {
    kind: 'rat',
    name: 'rata gigante',
    article: 'una',
    maxHits: 14,
    strength: 10,
    dexterity: 30,
    armor: 0,
    skill: 250,
    weapon: { name: 'mordida', minDamage: 1, maxDamage: 3, swingMs: 1800, skill: 'wrestling' },
    moveMs: 450,
    aggroRange: 4,
    loot: [
      { kind: 'gold', chance: 0.9, amount: [2, 8] },
      { kind: 'apple', chance: 0.2, amount: [1, 2] },
      { kind: 'garlic', chance: 0.25, amount: [1, 3] },
      { kind: 'raw-ribs', chance: 0.4, amount: [1, 1] },
      { kind: 'hides', chance: 0.3, amount: [1, 1] },
    ],
  },
  wolf: {
    kind: 'wolf',
    name: 'lobo gris',
    article: 'un',
    maxHits: 32,
    strength: 30,
    dexterity: 45,
    armor: 4,
    skill: 450,
    weapon: { name: 'mordida', minDamage: 3, maxDamage: 8, swingMs: 2000, skill: 'wrestling' },
    moveMs: 340,
    aggroRange: 7,
    loot: [
      { kind: 'gold', chance: 1, amount: [6, 18] },
      { kind: 'leather-cap', chance: 0.1 },
      { kind: 'leather-armor', chance: 0.08 },
      { kind: 'ginseng', chance: 0.3, amount: [1, 3] },
      { kind: 'spiders-silk', chance: 0.2, amount: [1, 2] },
      { kind: 'hides', chance: 0.9, amount: [2, 4] },
      { kind: 'raw-ribs', chance: 0.7, amount: [1, 2] },
    ],
  },
  skeleton: {
    kind: 'skeleton',
    name: 'esqueleto',
    article: 'un',
    maxHits: 45,
    strength: 40,
    dexterity: 35,
    armor: 10,
    skill: 550,
    weapon: {
      name: 'espada oxidada',
      minDamage: 4,
      maxDamage: 10,
      swingMs: 2400,
      skill: 'swordsmanship',
    },
    moveMs: 480,
    aggroRange: 8,
    loot: [
      { kind: 'gold', chance: 1, amount: [15, 40] },
      { kind: 'healing-potion', chance: 0.3 },
      { kind: 'short-sword', chance: 0.1 },
      { kind: 'iron-helmet', chance: 0.08 },
      { kind: 'chainmail', chance: 0.05 },
      { kind: 'wooden-shield', chance: 0.1 },
      { kind: 'black-pearl', chance: 0.4, amount: [1, 4] },
      { kind: 'sulfurous-ash', chance: 0.4, amount: [2, 5] },
      { kind: 'nightshade', chance: 0.4, amount: [1, 3] },
      { kind: 'blood-moss', chance: 0.3, amount: [1, 3] },
      { kind: 'blank-scroll', chance: 0.3, amount: [1, 3] },
      { kind: 'mace', chance: 0.08 },
      { kind: 'broadsword', chance: 0.05 },
      { kind: 'scroll-fireball', chance: 0.06 },
      { kind: 'scroll-poison', chance: 0.06 },
    ],
  },
};

export function isCreatureKind(value: unknown): value is CreatureKind {
  return typeof value === 'string' && (CREATURE_KINDS as readonly string[]).includes(value);
}

/** Forma del cuerpo de un mobile: humano o una criatura. */
export type Body = 'human' | CreatureKind;

/** Tiempo para avanzar un tile según el cuerpo y el modo de movimiento. */
export function bodyMoveMs(body: Body, humanMs: number): number {
  return body === 'human' ? humanMs : CREATURES[body].moveMs;
}
