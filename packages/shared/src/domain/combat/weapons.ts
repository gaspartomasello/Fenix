import type { ItemKind } from '../items/item-catalog';
import type { EquipmentLook } from '../../protocol/messages';

/** Habilidades de pelea: cada arma usa (y sube) una. */
export type CombatSkill = 'wrestling' | 'swordsmanship' | 'fencing' | 'mace-fighting' | 'archery';

export interface Weapon {
  readonly name: string;
  readonly minDamage: number;
  readonly maxDamage: number;
  /** Tiempo entre golpes. */
  readonly swingMs: number;
  /** Habilidad que se usa (y sube) al pelear con esta arma. */
  readonly skill: CombatSkill;
  /** Alcance en tiles (1 = cuerpo a cuerpo). */
  readonly range?: number;
  /** Munición que gasta cada disparo. */
  readonly ammo?: ItemKind;
}

export const FISTS: Weapon = {
  name: 'puños',
  minDamage: 1,
  maxDamage: 4,
  swingMs: 1750,
  skill: 'wrestling',
};

const WEAPONS: Partial<Record<ItemKind, Weapon>> = {
  dagger: { name: 'daga', minDamage: 3, maxDamage: 7, swingMs: 1500, skill: 'fencing' },
  kryss: { name: 'estoque', minDamage: 4, maxDamage: 10, swingMs: 1750, skill: 'fencing' },
  spear: { name: 'lanza', minDamage: 8, maxDamage: 17, swingMs: 2750, skill: 'fencing' },
  'short-sword': {
    name: 'espada corta',
    minDamage: 5,
    maxDamage: 11,
    swingMs: 2250,
    skill: 'swordsmanship',
  },
  broadsword: {
    name: 'espada ancha',
    minDamage: 6,
    maxDamage: 14,
    swingMs: 2500,
    skill: 'swordsmanship',
  },
  katana: { name: 'katana', minDamage: 5, maxDamage: 12, swingMs: 2000, skill: 'swordsmanship' },
  axe: { name: 'hacha', minDamage: 7, maxDamage: 14, swingMs: 2750, skill: 'swordsmanship' },
  mace: { name: 'maza', minDamage: 6, maxDamage: 12, swingMs: 2500, skill: 'mace-fighting' },
  'war-hammer': {
    name: 'martillo de guerra',
    minDamage: 10,
    maxDamage: 20,
    swingMs: 3500,
    skill: 'mace-fighting',
  },
  pickaxe: { name: 'pico', minDamage: 3, maxDamage: 9, swingMs: 2500, skill: 'mace-fighting' },
  bow: {
    name: 'arco',
    minDamage: 8,
    maxDamage: 16,
    swingMs: 3000,
    skill: 'archery',
    range: 10,
    ammo: 'arrow',
  },
};

/** Protección de cada pieza de armadura. */
const ARMOR_RATING: Partial<Record<ItemKind, number>> = {
  'leather-cap': 2,
  'iron-helmet': 5,
  'plate-helm': 7,
  'wizard-hat': 1,
  'leather-armor': 6,
  'studded-leather': 8,
  chainmail: 12,
  'plate-chest': 16,
  robe: 1,
  'leather-leggings': 3,
  'plate-legs': 7,
  'wooden-shield': 6,
  boots: 1,
  cloak: 1,
};

/** Armadura de metal: no deja meditar (como en UO). */
const METAL_ARMOR: ReadonlySet<ItemKind> = new Set<ItemKind>([
  'iron-helmet',
  'plate-helm',
  'chainmail',
  'plate-chest',
  'plate-legs',
]);

export function weaponOf(look: EquipmentLook): Weapon {
  const kind = look.rightHand;
  return (kind && WEAPONS[kind]) ?? FISTS;
}

export function weaponByKind(kind: ItemKind): Weapon | undefined {
  return WEAPONS[kind];
}

export function armorOf(look: EquipmentLook): number {
  return Object.values(look).reduce((sum, kind) => sum + (ARMOR_RATING[kind] ?? 0), 0);
}

export function armorRating(kind: ItemKind): number {
  return ARMOR_RATING[kind] ?? 0;
}

/** ¿Lleva puesta alguna pieza de metal? */
export function wearsMetalArmor(look: EquipmentLook): boolean {
  return Object.values(look).some((kind) => METAL_ARMOR.has(kind));
}
