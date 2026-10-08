import type { BaseItemKind, ItemKind } from '../items/item-catalog';
import { SPELLS, SPELL_KEYS } from '../magic/spell-catalog';
import type { SkillKey } from '../skills/skill-catalog';
import { Terrain } from '../world/terrain';
import type { StaticKind } from '../world/statics';

export type GatherSkill = 'mining' | 'lumberjacking' | 'fishing';

export interface ResourceSource {
  readonly resource: ItemKind;
  readonly tool: ItemKind;
  readonly skill: GatherSkill;
}

/** Recursos que da cada objeto fijo al recolectar, y con qué herramienta y habilidad. */
export const RESOURCE_SOURCES: Partial<Record<StaticKind, ResourceSource>> = {
  oak: { resource: 'logs', tool: 'axe', skill: 'lumberjacking' },
  pine: { resource: 'logs', tool: 'axe', skill: 'lumberjacking' },
  rock: { resource: 'iron-ore', tool: 'pickaxe', skill: 'mining' },
};

/** Pescar: con caña, en el agua. */
export const FISHING: ResourceSource & { readonly terrain: Terrain } = {
  resource: 'raw-fish',
  tool: 'fishing-pole',
  skill: 'fishing',
  terrain: Terrain.Water,
};
/** Hasta dónde llega la caña. */
export const FISHING_RANGE = 4;

/** Cuánto da un lugar antes de agotarse, y cuánto tarda en recuperarse. */
export const RESOURCES_PER_SPOT = 12;
export const RESOURCE_REGROW_MS = 5 * 60 * 1000;
/** Tiempo entre un intento de recolección o fabricación y el siguiente. */
export const ACTION_COOLDOWN_MS = 1500;
/** Distancia a la forja, el yunque o el fuego para fabricar. */
export const CRAFT_RANGE = 2;

/** Probabilidad de sacar algo: 50 % sin práctica, 95 % con la habilidad al máximo. */
export function gatherChance(skill: number): number {
  return Math.min(0.95, 0.5 + skill / 2222);
}

/** Oficios: habilidades con las que se fabrica. */
export const CRAFT_SKILLS = [
  'blacksmithy',
  'tailoring',
  'carpentry',
  'bowcraft',
  'alchemy',
  'inscription',
  'cooking',
] as const satisfies readonly SkillKey[];
export type CraftSkill = (typeof CRAFT_SKILLS)[number];

/** Herramienta de cada oficio (doble clic sobre ella abre su ventana). */
export const CRAFT_TOOLS: Readonly<Record<CraftSkill, BaseItemKind>> = {
  blacksmithy: 'smith-hammer',
  tailoring: 'sewing-kit',
  carpentry: 'saw',
  bowcraft: 'fletching-kit',
  alchemy: 'mortar-pestle',
  inscription: 'scribe-pen',
  cooking: 'skillet',
};

/**
 * Dónde hay que estar para fabricar: en la herrería (yunque y forja) o
 * junto a un fuego (el de la forja) para cocinar.
 */
export type CraftStation = 'smithy' | 'heat';
export const STATION_NAMES: Readonly<Record<CraftStation, string>> = {
  smithy: 'al lado de un yunque y una forja',
  heat: 'al lado de un fuego, como el de una forja',
};
export const STATION_STATICS: Readonly<Record<CraftStation, readonly (readonly StaticKind[])[]>> = {
  smithy: [['anvil'], ['forge']],
  heat: [['forge']],
};

export interface Material {
  readonly kind: ItemKind;
  readonly amount: number;
}

export interface Recipe {
  readonly key: string;
  readonly skill: CraftSkill;
  /** Grupo dentro de la ventana del oficio. */
  readonly category: string;
  readonly result: ItemKind;
  /** Cuántas unidades salen. */
  readonly amount: number;
  readonly materials: readonly Material[];
  /** Habilidad mínima, en décimas. */
  readonly minSkill: number;
  readonly station?: CraftStation;
  /** Maná que gasta (pergaminos). */
  readonly mana?: number;
}

type Spec = [
  result: ItemKind,
  minSkill: number,
  materials: Readonly<Partial<Record<ItemKind, number>>>,
  amount?: number,
];

function group(
  skill: CraftSkill,
  category: string,
  specs: readonly Spec[],
  station?: CraftStation,
): Recipe[] {
  return specs.map(([result, minSkill, materials, amount = 1]) => ({
    key: result,
    skill,
    category,
    result,
    amount,
    materials: Object.entries(materials).map(([kind, n]) => ({
      kind: kind as ItemKind,
      amount: n,
    })),
    minSkill,
    ...(station ? { station } : {}),
  }));
}

const ingots = (n: number): Partial<Record<ItemKind, number>> => ({ 'iron-ingot': n });
const boards = (n: number): Partial<Record<ItemKind, number>> => ({ boards: n });
const cloth = (n: number): Partial<Record<ItemKind, number>> => ({ cloth: n });
const hides = (n: number): Partial<Record<ItemKind, number>> => ({ hides: n });

export const RECIPES: readonly Recipe[] = [
  ...group(
    'blacksmithy',
    'Herramientas',
    [
      ['pickaxe', 0, ingots(4)],
      ['smith-hammer', 0, ingots(4)],
      ['saw', 0, ingots(3)],
      ['sewing-kit', 0, ingots(2)],
      ['skillet', 0, ingots(3)],
      ['mortar-pestle', 100, ingots(3)],
      ['fletching-kit', 100, ingots(3)],
      ['scribe-pen', 100, ingots(1)],
    ],
    'smithy',
  ),
  ...group(
    'blacksmithy',
    'Armas',
    [
      ['dagger', 0, ingots(3)],
      ['mace', 150, ingots(6)],
      ['short-sword', 200, ingots(8)],
      ['axe', 250, ingots(10)],
      ['kryss', 300, ingots(8)],
      ['broadsword', 350, ingots(10)],
      ['katana', 450, ingots(8)],
      ['spear', 500, ingots(12)],
      ['war-hammer', 600, ingots(16)],
    ],
    'smithy',
  ),
  ...group(
    'blacksmithy',
    'Armaduras',
    [
      ['iron-helmet', 400, ingots(12)],
      ['chainmail', 550, ingots(18)],
      ['plate-helm', 650, ingots(15)],
      ['plate-legs', 700, ingots(20)],
      ['plate-chest', 800, ingots(25)],
    ],
    'smithy',
  ),
  ...group('tailoring', 'Ropa', [
    ['trousers', 0, cloth(2)],
    ['robe', 200, cloth(8)],
    ['cloak', 250, cloth(10)],
    ['wizard-hat', 300, cloth(6)],
  ]),
  ...group('tailoring', 'Cuero', [
    ['leather-cap', 100, hides(2)],
    ['boots', 150, hides(4)],
    ['leather-leggings', 300, hides(8)],
    ['leather-armor', 350, hides(10)],
    ['studded-leather', 550, { hides: 12, 'iron-ingot': 2 }],
  ]),
  ...group('tailoring', 'Varios', [['bandage', 0, cloth(1), 10]]),
  ...group('carpentry', 'Materiales', [['boards', 0, { logs: 10 }, 10]]),
  ...group('carpentry', 'Objetos', [
    ['fishing-pole', 0, boards(5)],
    ['wooden-shield', 150, boards(10)],
  ]),
  ...group('bowcraft', 'Munición', [['arrow', 0, boards(2), 10]]),
  ...group('bowcraft', 'Armas', [['bow', 300, boards(7)]]),
  ...group('alchemy', 'Pociones', [
    ['refresh-potion', 0, { 'black-pearl': 1, 'empty-bottle': 1 }],
    ['healing-potion', 150, { ginseng: 1, 'empty-bottle': 1 }],
    ['cure-potion', 250, { garlic: 1, 'empty-bottle': 1 }],
    ['agility-potion', 250, { 'blood-moss': 1, 'empty-bottle': 1 }],
    ['strength-potion', 350, { 'mandrake-root': 1, 'empty-bottle': 1 }],
  ]),
  ...group(
    'cooking',
    'Comidas',
    [
      ['fish-steak', 0, { 'raw-fish': 1 }],
      ['cooked-ribs', 100, { 'raw-ribs': 1 }],
    ],
    'heat',
  ),
  // Inscripción: un pergamino por hechizo, con sus reactivos y su maná.
  ...SPELL_KEYS.map((key): Recipe => {
    const spell = SPELLS[key];
    return {
      key: `scroll-${key}`,
      skill: 'inscription',
      category: `Pergaminos · círculo ${spell.circle}`,
      result: `scroll-${key}`,
      amount: 1,
      materials: [{ kind: 'blank-scroll', amount: 1 }, ...spell.reagents],
      minSkill: spell.minSkill,
      mana: spell.mana,
    };
  }),
];

export function recipeByKey(key: string): Recipe | undefined {
  return RECIPES.find((r) => r.key === key);
}

export function recipesOf(skill: CraftSkill): Recipe[] {
  return RECIPES.filter((r) => r.skill === skill);
}

export function isCraftSkill(value: unknown): value is CraftSkill {
  return typeof value === 'string' && (CRAFT_SKILLS as readonly string[]).includes(value);
}

/** Probabilidad de que salga bien: 50 % en el mínimo, 100 % con 20 puntos más. */
export function craftChance(recipe: Recipe, skill: number): number {
  return Math.max(0.05, Math.min(1, 0.5 + (skill - recipe.minSkill) / 400));
}
