import type { ItemKind } from '../items/item-catalog';
import type { StaticKind } from '../world/statics';

/** Recursos que da cada objeto fijo al recolectar, y con qué herramienta y habilidad. */
export const RESOURCE_SOURCES: Partial<
  Record<
    StaticKind,
    {
      readonly resource: ItemKind;
      readonly tool: ItemKind;
      readonly skill: 'mining' | 'lumberjacking';
    }
  >
> = {
  oak: { resource: 'logs', tool: 'axe', skill: 'lumberjacking' },
  pine: { resource: 'logs', tool: 'axe', skill: 'lumberjacking' },
  rock: { resource: 'iron-ore', tool: 'pickaxe', skill: 'mining' },
};

/** Cuánto da un lugar antes de agotarse, y cuánto tarda en recuperarse. */
export const RESOURCES_PER_SPOT = 12;
export const RESOURCE_REGROW_MS = 5 * 60 * 1000;
/** Tiempo entre un intento de recolección o fabricación y el siguiente. */
export const ACTION_COOLDOWN_MS = 1500;
/** Distancia a la forja y el yunque para fundir y fabricar. */
export const CRAFT_RANGE = 2;

/** Probabilidad de sacar algo: 50 % sin práctica, 95 % con la habilidad al máximo. */
export function gatherChance(skill: number): number {
  return Math.min(0.95, 0.5 + skill / 2222);
}

export interface Recipe {
  readonly key: string;
  readonly result: ItemKind;
  readonly ingots: number;
  /** Herrería mínima, en décimas. */
  readonly minSkill: number;
}

export const RECIPES: readonly Recipe[] = [
  { key: 'pickaxe', result: 'pickaxe', ingots: 4, minSkill: 0 },
  { key: 'dagger', result: 'dagger', ingots: 3, minSkill: 0 },
  { key: 'short-sword', result: 'short-sword', ingots: 8, minSkill: 200 },
  { key: 'axe', result: 'axe', ingots: 10, minSkill: 250 },
  { key: 'iron-helmet', result: 'iron-helmet', ingots: 12, minSkill: 400 },
  { key: 'chainmail', result: 'chainmail', ingots: 18, minSkill: 550 },
];

export function recipeByKey(key: string): Recipe | undefined {
  return RECIPES.find((r) => r.key === key);
}

/** Probabilidad de que salga bien: 50 % en el mínimo, 100 % con 20 puntos más. */
export function craftChance(recipe: Recipe, skill: number): number {
  return Math.max(0.05, Math.min(1, 0.5 + (skill - recipe.minSkill) / 400));
}
