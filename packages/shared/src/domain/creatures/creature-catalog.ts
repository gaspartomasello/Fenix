import type { ItemKind } from '../items/item-catalog';
import type { Weapon } from '../combat/weapons';

export const CREATURE_KINDS = [
  'rat',
  'wolf',
  'skeleton',
  // Invocaciones del octavo círculo
  'energy-vortex',
  'air-elemental',
  'earth-elemental',
  'fire-elemental',
  'water-elemental',
  'daemon',
] as const;
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
  /** Cuerpo con forma de persona: usa los gestos de los personajes (golpes, caminar). */
  readonly humanoid: boolean;
  /** Solo aparece invocada con un hechizo (no hay salvajes). */
  readonly summoned: boolean;
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
    humanoid: false,
    summoned: false,
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
    humanoid: false,
    summoned: false,
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
    humanoid: true,
    summoned: false,
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
  'energy-vortex': summon('energy-vortex', 'vórtice de energía', {
    maxHits: 60,
    strength: 100,
    dexterity: 100,
    armor: 10,
    skill: 800,
    weapon: { name: 'descarga', minDamage: 10, maxDamage: 18, swingMs: 2000, skill: 'wrestling' },
    moveMs: 250,
    humanoid: false,
  }),
  'air-elemental': summon('air-elemental', 'elemental de aire', {
    maxHits: 70,
    strength: 60,
    dexterity: 90,
    armor: 12,
    skill: 750,
    weapon: { name: 'ráfaga', minDamage: 8, maxDamage: 14, swingMs: 1800, skill: 'wrestling' },
    moveMs: 300,
    humanoid: true,
  }),
  'earth-elemental': summon('earth-elemental', 'elemental de tierra', {
    maxHits: 120,
    strength: 120,
    dexterity: 40,
    armor: 26,
    skill: 650,
    weapon: {
      name: 'puño de piedra',
      minDamage: 10,
      maxDamage: 18,
      swingMs: 2600,
      skill: 'wrestling',
    },
    moveMs: 460,
    humanoid: true,
  }),
  'fire-elemental': summon('fire-elemental', 'elemental de fuego', {
    maxHits: 80,
    strength: 80,
    dexterity: 70,
    armor: 10,
    skill: 700,
    weapon: { name: 'llamarada', minDamage: 10, maxDamage: 17, swingMs: 2200, skill: 'wrestling' },
    moveMs: 320,
    humanoid: true,
  }),
  'water-elemental': summon('water-elemental', 'elemental de agua', {
    maxHits: 95,
    strength: 90,
    dexterity: 60,
    armor: 16,
    skill: 650,
    weapon: {
      name: 'golpe de agua',
      minDamage: 8,
      maxDamage: 15,
      swingMs: 2200,
      skill: 'wrestling',
    },
    moveMs: 380,
    humanoid: true,
  }),
  daemon: summon('daemon', 'demonio', {
    maxHits: 150,
    strength: 140,
    dexterity: 70,
    armor: 30,
    skill: 850,
    weapon: { name: 'garras', minDamage: 14, maxDamage: 24, swingMs: 2400, skill: 'wrestling' },
    moveMs: 360,
    humanoid: true,
  }),
};

/** Criatura que solo existe invocada: pelea para su dueño y no deja botín. */
function summon(
  kind: CreatureKind,
  name: string,
  stats: Omit<CreatureDefinition, 'kind' | 'name' | 'article' | 'aggroRange' | 'loot' | 'summoned'>,
): CreatureDefinition {
  return { kind, name, article: 'un', aggroRange: 10, loot: [], summoned: true, ...stats };
}

export function isCreatureKind(value: unknown): value is CreatureKind {
  return typeof value === 'string' && (CREATURE_KINDS as readonly string[]).includes(value);
}

/** Forma del cuerpo de un mobile: humano o una criatura. */
export type Body = 'human' | CreatureKind;

/** Tiempo para avanzar un tile según el cuerpo y el modo de movimiento. */
export function bodyMoveMs(body: Body, humanMs: number): number {
  return body === 'human' ? humanMs : CREATURES[body].moveMs;
}
