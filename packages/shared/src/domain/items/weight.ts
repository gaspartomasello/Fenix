import { armorRating, weaponByKind } from '../combat/weapons';
import { ITEMS, type ItemKind } from './item-catalog';

/**
 * Peso y carga, como en UO: cada objeto pesa unas piedras y lo que se puede
 * llevar depende de la Fuerza (40 piedras más 3,5 por punto). Con más peso que
 * eso no se puede correr y cada paso cansa; muy por encima, no se puede ni
 * caminar. Las mismas reglas las usan el servidor y el cliente.
 */

/** Peso de algunos objetos sueltos (en piedras por unidad). */
const WEIGHTS: Partial<Record<ItemKind, number>> = {
  gold: 0.01,
  arrow: 0.1,
  bolt: 0.1,
  bandage: 0.1,
  'blank-scroll': 0.1,
  'iron-ore': 1,
  'iron-ingot': 0.5,
  logs: 2,
  boards: 0.5,
  'stone-block': 2,
  hides: 1,
  cloth: 0.5,
  spellbook: 3,
  book: 1,
  letter: 0.1,
  rune: 0.1,
  cannonball: 4,
  dagger: 1,
  kryss: 2,
  lockpick: 0.1,
  'house-chest': 50,
};

export function itemWeight(kind: ItemKind): number {
  const known = WEIGHTS[kind];
  if (known !== undefined) return known;
  const definition = ITEMS[kind];
  if (definition.spell) return 0.1;
  // La escritura de una casa es un papel.
  if (definition.use === 'house') return 1;
  const weapon = weaponByKind(kind);
  if (weapon) return definition.twoHanded ? 10 : 6;
  const armor = armorRating(kind);
  // Armaduras y escudos: más pesados cuanto más protegen (el peto de placas, unas 10 piedras).
  if (armor > 0) return Math.max(1, Math.round(armor * 0.6));
  if (definition.slot) return 1;
  if (definition.potion) return 1;
  if (definition.food) return 0.5;
  if (definition.capacity) return 2;
  if (definition.stackable) return 0.1;
  return 2;
}

/** Cuánto puede llevar alguien con esta Fuerza, en piedras. */
export function maxWeight(strength: number): number {
  return 40 + Math.floor(strength * 3.5);
}

/** Con más de esto por encima del máximo ya no se puede caminar. */
export const OVERLOAD_LIMIT = 40;

export interface Encumbrance {
  readonly canMove: boolean;
  readonly canRun: boolean;
  /** Energía que gasta cada paso por llevar de más (0 si no está cargado de más). */
  readonly stepStamina: number;
}

/** Qué permite el peso que se lleva: correr, caminar cansándose o quedarse quieto. */
export function encumbrance(weight: number, max: number): Encumbrance {
  const over = weight - max;
  if (over <= 0) return { canMove: true, canRun: true, stepStamina: 0 };
  return {
    canMove: over <= OVERLOAD_LIMIT,
    canRun: false,
    stepStamina: 1 + Math.floor(over / 10),
  };
}

/** "123 / 215 piedras". */
export function describeWeight(weight: number, max: number | null): string {
  const carried = Math.round(weight);
  return max === null ? `${carried} piedras (sin límite)` : `${carried} / ${max} piedras`;
}
