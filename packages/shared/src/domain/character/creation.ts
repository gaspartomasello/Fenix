import type { Attributes } from '../combat/vitals';
import type { EquipmentSlot } from '../items/equipment';
import type { ItemKind } from '../items/item-catalog';
import {
  SKILL_NAMES,
  STARTING_SKILLS,
  isSkillKey,
  type SkillKey,
  type SkillValues,
} from '../skills/skill-catalog';
import { isAppearance, type Appearance } from './appearance';
import { validateCharacterName } from './name';

/**
 * Crear un personaje, como en UO: se reparten los puntos de los atributos y
 * se eligen cuatro habilidades (dos en 60 y dos en 50). Según esas habilidades
 * trae su equipo: armas, el libro de hechizos y los reactivos, herramientas…
 * Ese equipo inicial es "del personaje": no se pierde ni se lo pueden sacar.
 */

/** Cuántos personajes entran en una cuenta. */
export const ACCOUNT_CHARACTERS = 5;

/** Puntos de atributos para repartir y lo mínimo y máximo de cada uno al crear. */
export const CREATION_ATTRIBUTE_TOTAL = 120;
export const CREATION_ATTRIBUTE_MIN = 10;
export const CREATION_ATTRIBUTE_MAX = 80;

/** Las cuatro habilidades elegidas empiezan en 60, 60, 50 y 50 (en décimas). */
export const CREATION_SKILL_VALUES = [600, 600, 500, 500] as const;

/** Las habilidades elegidas al crear: las dos primeras en 60, las otras dos en 50. */
export type CreationSkills = readonly [SkillKey, SkillKey, SkillKey, SkillKey];

/** Oro que cada personaje nuevo tiene guardado en el banco. */
export const STARTING_BANK_GOLD = 2000;

export interface CharacterCreation {
  readonly name: string;
  readonly appearance: Appearance;
  readonly attributes: Attributes;
  /** Las dos primeras quedan en 60; las otras dos, en 50. */
  readonly skills: CreationSkills;
}

export type CreationValidation =
  { ok: true; creation: CharacterCreation } | { ok: false; reason: string };

export function validateCreation(value: unknown): CreationValidation {
  if (typeof value !== 'object' || value === null) return { ok: false, reason: 'Faltan datos.' };
  const data = value as Record<string, unknown>;
  const name = validateCharacterName(typeof data.name === 'string' ? data.name : '');
  if (!name.ok) return name;
  if (!isAppearance(data.appearance)) return { ok: false, reason: 'La apariencia no es válida.' };
  const attributes = data.attributes as Record<string, unknown> | null;
  const values = ['strength', 'dexterity', 'intelligence'].map((key) => attributes?.[key]);
  if (
    !values.every(
      (v) =>
        typeof v === 'number' &&
        Number.isInteger(v) &&
        v >= CREATION_ATTRIBUTE_MIN &&
        v <= CREATION_ATTRIBUTE_MAX,
    )
  )
    return {
      ok: false,
      reason: `Cada atributo va de ${CREATION_ATTRIBUTE_MIN} a ${CREATION_ATTRIBUTE_MAX}.`,
    };
  const [strength, dexterity, intelligence] = values as [number, number, number];
  if (strength + dexterity + intelligence !== CREATION_ATTRIBUTE_TOTAL)
    return {
      ok: false,
      reason: `Hay que repartir exactamente ${CREATION_ATTRIBUTE_TOTAL} puntos de atributos.`,
    };
  const skills = data.skills;
  if (
    !Array.isArray(skills) ||
    skills.length !== CREATION_SKILL_VALUES.length ||
    !skills.every(isSkillKey) ||
    new Set(skills).size !== CREATION_SKILL_VALUES.length
  )
    return { ok: false, reason: 'Elegí cuatro habilidades distintas.' };
  return {
    ok: true,
    creation: {
      name: name.name,
      appearance: data.appearance,
      attributes: { strength, dexterity, intelligence },
      skills: [skills[0], skills[1], skills[2], skills[3]] as CreationSkills,
    },
  };
}

/** Las habilidades del personaje nuevo: las de siempre, con las cuatro elegidas más altas. */
export function creationSkills(chosen: readonly SkillKey[]): SkillValues {
  const values: Record<SkillKey, number> = { ...STARTING_SKILLS };
  chosen.forEach((skill, index) => {
    values[skill] = Math.max(values[skill], CREATION_SKILL_VALUES[index] ?? 0);
  });
  return values;
}

export interface KitEntry {
  readonly kind: ItemKind;
  readonly amount: number;
}

/** Lo que trae todo personaje nuevo: vendas, comida, pociones y algo de oro. */
export const BASE_KIT: readonly KitEntry[] = [
  { kind: 'bandage', amount: 100 },
  { kind: 'bread', amount: 5 },
  { kind: 'apple', amount: 5 },
  { kind: 'healing-potion', amount: 3 },
  { kind: 'torch', amount: 1 },
];

/** Los ocho reactivos de los hechizos. */
export const REAGENTS: readonly ItemKind[] = [
  'black-pearl',
  'blood-moss',
  'garlic',
  'ginseng',
  'mandrake-root',
  'nightshade',
  'spiders-silk',
  'sulfurous-ash',
];

/** Lo que trae según cada habilidad elegida, como en UO. */
export const SKILL_KITS: Readonly<Record<SkillKey, readonly KitEntry[]>> = {
  wrestling: [{ kind: 'leather-armor', amount: 1 }],
  swordsmanship: [{ kind: 'katana', amount: 1 }],
  fencing: [{ kind: 'kryss', amount: 1 }],
  'mace-fighting': [{ kind: 'mace', amount: 1 }],
  archery: [
    { kind: 'bow', amount: 1 },
    { kind: 'arrow', amount: 200 },
  ],
  tactics: [{ kind: 'leather-armor', amount: 1 }],
  anatomy: [{ kind: 'bandage', amount: 50 }],
  parrying: [{ kind: 'wooden-shield', amount: 1 }],
  healing: [{ kind: 'bandage', amount: 50 }],
  hiding: [{ kind: 'cloak', amount: 1 }],
  stealth: [{ kind: 'cloak', amount: 1 }],
  'detect-hidden': [{ kind: 'lantern', amount: 1 }],
  tracking: [{ kind: 'boots', amount: 1 }],
  lockpicking: [{ kind: 'lockpick', amount: 10 }],
  snooping: [{ kind: 'pouch', amount: 1 }],
  stealing: [{ kind: 'dagger', amount: 1 }],
  magery: [{ kind: 'spellbook', amount: 1 }, ...REAGENTS.map((kind) => ({ kind, amount: 150 }))],
  'evaluating-intelligence': [{ kind: 'spellbook', amount: 1 }],
  meditation: [{ kind: 'refresh-potion', amount: 3 }],
  'magic-resist': [{ kind: 'cure-potion', amount: 3 }],
  inscription: [
    { kind: 'scribe-pen', amount: 1 },
    { kind: 'blank-scroll', amount: 20 },
  ],
  mining: [
    { kind: 'pickaxe', amount: 1 },
    { kind: 'shovel', amount: 1 },
  ],
  lumberjacking: [{ kind: 'axe', amount: 1 }],
  fishing: [{ kind: 'fishing-pole', amount: 1 }],
  blacksmithy: [
    { kind: 'smith-hammer', amount: 1 },
    { kind: 'iron-ingot', amount: 20 },
  ],
  tailoring: [
    { kind: 'sewing-kit', amount: 1 },
    { kind: 'cloth', amount: 20 },
  ],
  carpentry: [
    { kind: 'saw', amount: 1 },
    { kind: 'boards', amount: 20 },
  ],
  bowcraft: [
    { kind: 'fletching-kit', amount: 1 },
    { kind: 'logs', amount: 20 },
  ],
  alchemy: [
    { kind: 'mortar-pestle', amount: 1 },
    { kind: 'empty-bottle', amount: 10 },
  ],
  cooking: [
    { kind: 'skillet', amount: 1 },
    { kind: 'raw-fish', amount: 10 },
  ],
};

/**
 * El equipo inicial de un personaje nuevo: lo de todos más lo de cada
 * habilidad elegida, sin repetir objetos únicos (un solo libro, una sola
 * armadura) y sumando lo que se apila (las vendas de Primeros auxilios y de
 * Anatomía).
 */
export function startingKit(chosen: readonly SkillKey[]): KitEntry[] {
  const totals = new Map<ItemKind, number>();
  const unique = new Set<ItemKind>();
  for (const entry of [...BASE_KIT, ...chosen.flatMap((skill) => SKILL_KITS[skill])]) {
    if (entry.amount === 1 && !STACKABLE_IN_KIT.has(entry.kind)) {
      if (unique.has(entry.kind)) continue;
      unique.add(entry.kind);
    }
    totals.set(entry.kind, (totals.get(entry.kind) ?? 0) + entry.amount);
  }
  return [...totals].map(([kind, amount]) => ({ kind, amount }));
}

/**
 * La ropa con la que empieza: camisa del color elegido, pantalón (las
 * mujeres, pollera) y zapatos. Son objetos de verdad: si se los saca, se ve la ropa
 * interior, como en UO.
 */
export function startingClothes(
  appearance: Appearance,
): readonly { kind: ItemKind; slot: EquipmentSlot; hue?: number }[] {
  return [
    { kind: 'shirt', slot: 'torso', hue: appearance.clothHue },
    { kind: appearance.gender === 'female' ? 'skirt' : 'trousers', slot: 'legs' },
    { kind: 'shoes', slot: 'feet' },
  ];
}

/** Lo que se suma aunque venga de a uno (no hay de estos en el kit, pero queda claro). */
const STACKABLE_IN_KIT = new Set<ItemKind>(['torch']);

/** "Magia 60 · Meditación 50 · Primeros auxilios 50". */
export function describeChosenSkills(chosen: readonly SkillKey[]): string {
  return chosen
    .map((skill, i) => `${SKILL_NAMES[skill]} ${(CREATION_SKILL_VALUES[i] ?? 0) / 10}`)
    .join(' · ');
}
