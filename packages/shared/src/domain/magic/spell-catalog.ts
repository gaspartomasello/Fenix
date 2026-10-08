import type { BaseItemKind } from '../items/item-catalog';
import type { AttributeKey } from './effects';

export const SPELL_KEYS = [
  // Primer círculo
  'clumsy',
  'create-food',
  'feeblemind',
  'heal',
  'magic-arrow',
  'light',
  'weaken',
  // Segundo círculo
  'agility',
  'cunning',
  'cure',
  'harm',
  'protection',
  'strength',
  // Tercer círculo
  'bless',
  'fireball',
  'poison',
  'teleport',
  // Cuarto círculo
  'curse',
  'greater-heal',
  'lightning',
  'mana-drain',
  // Quinto círculo
  'mind-blast',
  'paralyze',
  // Sexto círculo
  'energy-bolt',
  'explosion',
  // Séptimo círculo
  'flamestrike',
  'mana-vampire',
] as const;
export type SpellKey = (typeof SPELL_KEYS)[number];

export const SPELL_CIRCLES = [1, 2, 3, 4, 5, 6, 7] as const;
export type SpellCircle = (typeof SPELL_CIRCLES)[number];

export const CIRCLE_NAMES: Readonly<Record<SpellCircle, string>> = {
  1: 'Primer círculo',
  2: 'Segundo círculo',
  3: 'Tercer círculo',
  4: 'Cuarto círculo',
  5: 'Quinto círculo',
  6: 'Sexto círculo',
  7: 'Séptimo círculo',
};

/** Maná y Magia mínima (en décimas) de cada círculo, como en UO. */
const CIRCLE_MANA: Readonly<Record<SpellCircle, number>> = {
  1: 4,
  2: 6,
  3: 9,
  4: 11,
  5: 14,
  6: 20,
  7: 40,
};
const CIRCLE_MIN_SKILL: Readonly<Record<SpellCircle, number>> = {
  1: 0,
  2: 100,
  3: 250,
  4: 400,
  5: 550,
  6: 650,
  7: 750,
};

/**
 * A quién se lanza: a uno mismo, a otro para ayudarlo (o a uno mismo), a
 * otro para dañarlo, o a un lugar del suelo.
 */
export type SpellTarget = 'self' | 'beneficial' | 'harmful' | 'location';

/** Qué hace el hechizo al salir. */
export type SpellEffect =
  | { readonly kind: 'damage'; readonly power: readonly [number, number] }
  | { readonly kind: 'heal'; readonly power: readonly [number, number] }
  /** Sube (signo +1) o baja (−1) atributos por un tiempo. */
  | {
      readonly kind: 'attribute';
      readonly attributes: readonly AttributeKey[];
      readonly sign: 1 | -1;
    }
  | { readonly kind: 'cure' }
  | { readonly kind: 'poison' }
  | { readonly kind: 'paralyze' }
  | { readonly kind: 'teleport' }
  | { readonly kind: 'create-food' }
  /** Quita maná; con `steal`, el lanzador se queda con lo que quita. */
  | {
      readonly kind: 'mana-drain';
      readonly power: readonly [number, number];
      readonly steal: boolean;
    }
  | { readonly kind: 'protection' }
  | { readonly kind: 'night-sight' };

export interface Reagent {
  readonly kind: BaseItemKind;
  readonly amount: number;
}

export interface SpellDefinition {
  readonly key: SpellKey;
  readonly name: string;
  readonly circle: SpellCircle;
  /** Palabras que dice el personaje al lanzarlo (inventadas para Fenix). */
  readonly words: string;
  readonly mana: number;
  readonly reagents: readonly Reagent[];
  /** Magia mínima (en décimas) para poder intentarlo. */
  readonly minSkill: number;
  readonly target: SpellTarget;
  readonly castMs: number;
  readonly effect: SpellEffect;
  readonly description: string;
}

type ReagentKey = 'BP' | 'BM' | 'GA' | 'GI' | 'MR' | 'NS' | 'SS' | 'SA';
const REAGENT: Readonly<Record<ReagentKey, BaseItemKind>> = {
  BP: 'black-pearl',
  BM: 'blood-moss',
  GA: 'garlic',
  GI: 'ginseng',
  MR: 'mandrake-root',
  NS: 'nightshade',
  SS: 'spiders-silk',
  SA: 'sulfurous-ash',
};

function spell(
  key: SpellKey,
  circle: SpellCircle,
  name: string,
  words: string,
  reagents: readonly ReagentKey[],
  target: SpellTarget,
  effect: SpellEffect,
  description: string,
): SpellDefinition {
  return {
    key,
    name,
    circle,
    words,
    mana: CIRCLE_MANA[circle],
    reagents: reagents.map((r) => ({ kind: REAGENT[r], amount: 1 })),
    minSkill: CIRCLE_MIN_SKILL[circle],
    target,
    castMs: 500 + 250 * circle,
    effect,
    description,
  };
}

const ALL_ATTRIBUTES: readonly AttributeKey[] = ['strength', 'dexterity', 'intelligence'];

const LIST: readonly SpellDefinition[] = [
  spell(
    'clumsy',
    1,
    'Torpeza',
    'Manus Gravis',
    ['BM', 'NS'],
    'harmful',
    { kind: 'attribute', attributes: ['dexterity'], sign: -1 },
    'Baja la destreza del objetivo por un rato.',
  ),
  spell(
    'create-food',
    1,
    'Crear comida',
    'Panis Fiat',
    ['GA', 'GI', 'MR'],
    'self',
    { kind: 'create-food' },
    'Hace aparecer algo de comer en la mochila.',
  ),
  spell(
    'feeblemind',
    1,
    'Mente débil',
    'Mens Tenuis',
    ['GI', 'NS'],
    'harmful',
    { kind: 'attribute', attributes: ['intelligence'], sign: -1 },
    'Baja la inteligencia del objetivo por un rato.',
  ),
  spell(
    'heal',
    1,
    'Curar',
    'Sana Vulnus',
    ['GA', 'GI', 'SS'],
    'beneficial',
    { kind: 'heal', power: [5, 10] },
    'Cierra algunas heridas.',
  ),
  spell(
    'magic-arrow',
    1,
    'Flecha mágica',
    'Sagitta Arcana',
    ['SA'],
    'harmful',
    { kind: 'damage', power: [4, 8] },
    'Una flecha de fuego que nunca falla.',
  ),
  spell(
    'light',
    1,
    'Visión nocturna',
    'Lux Oculis',
    ['SA', 'SS'],
    'beneficial',
    { kind: 'night-sight' },
    'Permite ver en la oscuridad como si fuera de día.',
  ),
  spell(
    'weaken',
    1,
    'Debilitar',
    'Vis Minor',
    ['GA', 'NS'],
    'harmful',
    { kind: 'attribute', attributes: ['strength'], sign: -1 },
    'Baja la fuerza del objetivo por un rato.',
  ),

  spell(
    'agility',
    2,
    'Agilidad',
    'Pedes Leves',
    ['BM', 'MR'],
    'beneficial',
    { kind: 'attribute', attributes: ['dexterity'], sign: 1 },
    'Sube la destreza por un rato.',
  ),
  spell(
    'cunning',
    2,
    'Astucia',
    'Mens Acuta',
    ['MR', 'NS'],
    'beneficial',
    { kind: 'attribute', attributes: ['intelligence'], sign: 1 },
    'Sube la inteligencia por un rato.',
  ),
  spell(
    'cure',
    2,
    'Purificar',
    'Venenum Exi',
    ['GA', 'GI'],
    'beneficial',
    { kind: 'cure' },
    'Saca el veneno del cuerpo.',
  ),
  spell(
    'harm',
    2,
    'Herir',
    'Dolor Subitus',
    ['NS', 'SS'],
    'harmful',
    { kind: 'damage', power: [6, 11] },
    'Abre una herida en el objetivo.',
  ),
  spell(
    'protection',
    2,
    'Protección',
    'Scutum Animae',
    ['GA', 'GI', 'SA'],
    'self',
    { kind: 'protection' },
    'Endurece la piel: más defensa y los golpes no cortan tus hechizos.',
  ),
  spell(
    'strength',
    2,
    'Fuerza',
    'Vis Maior',
    ['MR', 'NS'],
    'beneficial',
    { kind: 'attribute', attributes: ['strength'], sign: 1 },
    'Sube la fuerza por un rato.',
  ),

  spell(
    'bless',
    3,
    'Bendición',
    'Benedictio Tota',
    ['GA', 'MR'],
    'beneficial',
    { kind: 'attribute', attributes: ALL_ATTRIBUTES, sign: 1 },
    'Sube fuerza, destreza e inteligencia por un rato.',
  ),
  spell(
    'fireball',
    3,
    'Bola de fuego',
    'Ignis Globus',
    ['BP'],
    'harmful',
    { kind: 'damage', power: [9, 16] },
    'Una bola de fuego contra el objetivo.',
  ),
  spell(
    'poison',
    3,
    'Envenenar',
    'Venenum Intra',
    ['NS'],
    'harmful',
    { kind: 'poison' },
    'Envenena al objetivo: pierde vida de a poco hasta curarse.',
  ),
  spell(
    'teleport',
    3,
    'Teletransporte',
    'Salto Locus',
    ['BM', 'MR'],
    'location',
    { kind: 'teleport' },
    'Te lleva al instante a un lugar cercano que puedas ver.',
  ),

  spell(
    'curse',
    4,
    'Maldición',
    'Maledictio Tota',
    ['GA', 'NS', 'SA'],
    'harmful',
    { kind: 'attribute', attributes: ALL_ATTRIBUTES, sign: -1 },
    'Baja fuerza, destreza e inteligencia del objetivo.',
  ),
  spell(
    'greater-heal',
    4,
    'Gran curación',
    'Sana Maior',
    ['GA', 'GI', 'MR', 'SS'],
    'beneficial',
    { kind: 'heal', power: [20, 30] },
    'Cierra muchas heridas de golpe.',
  ),
  spell(
    'lightning',
    4,
    'Relámpago',
    'Fulmen Cadat',
    ['MR', 'SA'],
    'harmful',
    { kind: 'damage', power: [12, 20] },
    'Un rayo cae del cielo sobre el objetivo.',
  ),
  spell(
    'mana-drain',
    4,
    'Drenar maná',
    'Mana Fluat',
    ['BP', 'MR', 'SS'],
    'harmful',
    { kind: 'mana-drain', power: [10, 20], steal: false },
    'Le quita maná al objetivo.',
  ),

  spell(
    'mind-blast',
    5,
    'Golpe mental',
    'Mens Frangitur',
    ['BP', 'MR', 'NS', 'SA'],
    'harmful',
    { kind: 'damage', power: [16, 24] },
    'Un golpe directo a la mente del objetivo.',
  ),
  spell(
    'paralyze',
    5,
    'Parálisis',
    'Corpus Sistat',
    ['GA', 'MR', 'SS'],
    'harmful',
    { kind: 'paralyze' },
    'El objetivo queda inmóvil hasta que pase el efecto o lo golpeen.',
  ),

  spell(
    'energy-bolt',
    6,
    'Rayo de energía',
    'Fulgur Purum',
    ['BP', 'NS'],
    'harmful',
    { kind: 'damage', power: [22, 32] },
    'Un rayo de energía pura.',
  ),
  spell(
    'explosion',
    6,
    'Explosión',
    'Ignis Rumpit',
    ['BM', 'MR'],
    'harmful',
    { kind: 'damage', power: [24, 34] },
    'El aire estalla alrededor del objetivo.',
  ),

  spell(
    'flamestrike',
    7,
    'Columna de fuego',
    'Columna Flammae',
    ['SS', 'SA'],
    'harmful',
    { kind: 'damage', power: [32, 44] },
    'Una columna de fuego envuelve al objetivo.',
  ),
  spell(
    'mana-vampire',
    7,
    'Vampiro de maná',
    'Mana Bibo',
    ['BM', 'BP', 'MR', 'SS'],
    'harmful',
    { kind: 'mana-drain', power: [20, 40], steal: true },
    'Le roba maná al objetivo y te lo quedás.',
  ),
];

export const SPELLS: Readonly<Record<SpellKey, SpellDefinition>> = Object.fromEntries(
  LIST.map((s) => [s.key, s]),
) as Record<SpellKey, SpellDefinition>;

export function spellsOfCircle(circle: SpellCircle): SpellDefinition[] {
  return LIST.filter((s) => s.circle === circle);
}

/** Distancia máxima para lanzar un hechizo a otro o a un lugar. */
export const SPELL_RANGE = 10;

export function isSpellKey(value: unknown): value is SpellKey {
  return typeof value === 'string' && (SPELL_KEYS as readonly string[]).includes(value);
}

/** Probabilidad de que salga bien: 50 % en el mínimo, 100 % con 20 puntos más de Magia. */
export function spellSuccessChance(spell: SpellDefinition, magery: number): number {
  return Math.max(0.05, Math.min(1, 0.5 + (magery - spell.minSkill) / 400));
}

/** Potencia final (daño, curación o maná): la base más un punto cada 10 de Magia. */
export function rollSpellPower(
  spell: SpellDefinition,
  magery: number,
  random: () => number,
): number {
  const effect = spell.effect;
  if (effect.kind !== 'damage' && effect.kind !== 'heal' && effect.kind !== 'mana-drain') return 0;
  const [min, max] = effect.power;
  return min + Math.floor(random() * (max - min + 1)) + Math.floor(magery / 100);
}

/**
 * Probabilidad de que la Resistencia mágica del objetivo aguante el hechizo
 * (reduce a la mitad el daño o la duración): sube con la habilidad y baja
 * con el círculo. Como mucho, 70 %.
 */
export function resistChance(magicResist: number, circle: SpellCircle): number {
  return Math.max(0, Math.min(0.7, (magicResist - circle * 50) / 1000));
}
