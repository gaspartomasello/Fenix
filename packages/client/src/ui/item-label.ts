import { armorRating, weaponByKind } from '@fenix/shared/combat/weapons';
import { ITEMS, describeItem, type ItemKind } from '@fenix/shared/items/item-catalog';
import type { ItemSnapshot } from '@fenix/shared/protocol/messages';

/** Nombre de un objeto para la interfaz: "3 manzanas"; una runa dice qué lugar guarda y un libro, su título. */
export function itemLabel(item: ItemSnapshot): string {
  const label = baseLabel(item);
  return item.newbie ? `${label} (equipo inicial)` : label;
}

function baseLabel(item: ItemSnapshot): string {
  const base = describeItem(item.kind, item.amount);
  if (item.kind === 'book')
    return item.bookTitle ? `libro: «${item.bookTitle}»` : 'libro en blanco';
  if (item.kind !== 'rune') return base;
  return item.mark
    ? `${base}: ${item.mark.label} (${item.mark.x}, ${item.mark.y})`
    : `${base} en blanco`;
}

/** Lo que conviene saber de un objeto en una tienda: daño, defensa, cuánto alimenta… */
export function itemDetails(kind: ItemKind): string {
  const definition = ITEMS[kind];
  const parts: string[] = [];
  const weapon = weaponByKind(kind);
  if (weapon) parts.push(`daño ${weapon.minDamage}–${weapon.maxDamage}`);
  if (definition.twoHanded) parts.push('a dos manos');
  const armor = armorRating(kind);
  if (armor > 0) parts.push(`defensa ${armor}`);
  if (definition.food) parts.push(`+${definition.food} de vida`);
  if (definition.light) parts.push('alumbra en la oscuridad');
  if (definition.capacity) parts.push(`guarda ${definition.capacity} objetos`);
  if (definition.use === 'music') parts.push('se toca con doble clic');
  return parts.join(' · ');
}

export type ShopCategory = 'weapons' | 'armor' | 'food' | 'other';

/** En qué estante de la tienda va un objeto. */
export function shopCategory(kind: ItemKind): ShopCategory {
  const definition = ITEMS[kind];
  if (weaponByKind(kind) && kind !== 'pickaxe') return 'weapons';
  if (definition.use === 'equip' && definition.slot && !definition.light) return 'armor';
  if (definition.food) return 'food';
  return 'other';
}
