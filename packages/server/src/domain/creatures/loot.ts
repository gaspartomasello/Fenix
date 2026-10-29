import {
  GOLD_BONUS,
  type CreatureDefinition,
  type LootEntry,
} from '@fenix/shared/creatures/creature-catalog';
import type { ItemKind } from '@fenix/shared/items/item-catalog';

/** Algo que queda en el cuerpo; una bolsa puede traer cosas adentro. */
export interface Drop {
  readonly kind: ItemKind;
  readonly amount: number;
  readonly contents?: readonly Drop[];
}

/**
 * Tira los dados del botín de una criatura. Los humanos dejan además todo lo
 * que llevan puesto y en las manos, y los que hacen magia, su bolsa de
 * reactivos. El oro sale un 30 % más generoso que lo que dice el catálogo.
 */
export function rollLoot(definition: CreatureDefinition, random: () => number): Drop[] {
  const drops: Drop[] = Object.values(definition.outfit ?? {}).map((kind) => ({ kind, amount: 1 }));
  drops.push(...roll(definition.loot, random));
  const inBag = roll(definition.bag ?? [], random);
  if (inBag.length > 0) drops.push({ kind: 'bag', amount: 1, contents: inBag });
  return drops;
}

function roll(entries: readonly LootEntry[], random: () => number): Drop[] {
  const drops: Drop[] = [];
  for (const entry of entries) {
    if (random() >= entry.chance) continue;
    const [min, max] = entry.amount ?? [1, 1];
    const amount = min + Math.floor(random() * (max - min + 1));
    drops.push({
      kind: entry.kind,
      amount: entry.kind === 'gold' ? Math.round(amount * GOLD_BONUS) : amount,
    });
  }
  return drops;
}
