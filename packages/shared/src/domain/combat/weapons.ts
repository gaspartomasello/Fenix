import type { ItemKind } from '../items/item-catalog';
import type { EquipmentLook } from '../../protocol/messages';

export interface Weapon {
  readonly name: string;
  readonly minDamage: number;
  readonly maxDamage: number;
  /** Tiempo entre golpes. */
  readonly swingMs: number;
}

export const FISTS: Weapon = { name: 'puños', minDamage: 1, maxDamage: 4, swingMs: 1750 };

const WEAPONS: Partial<Record<ItemKind, Weapon>> = {
  dagger: { name: 'daga', minDamage: 3, maxDamage: 7, swingMs: 1500 },
  'short-sword': { name: 'espada corta', minDamage: 5, maxDamage: 11, swingMs: 2250 },
  axe: { name: 'hacha', minDamage: 7, maxDamage: 14, swingMs: 2750 },
};

/** Protección de cada pieza de armadura. */
const ARMOR_RATING: Partial<Record<ItemKind, number>> = {
  'leather-cap': 2,
  'iron-helmet': 5,
  'leather-armor': 6,
  chainmail: 12,
  'wooden-shield': 6,
  boots: 1,
  cloak: 1,
};

export function weaponOf(look: EquipmentLook): Weapon {
  const kind = look.rightHand;
  return (kind && WEAPONS[kind]) ?? FISTS;
}

export function armorOf(look: EquipmentLook): number {
  return Object.values(look).reduce((sum, kind) => sum + (ARMOR_RATING[kind] ?? 0), 0);
}
