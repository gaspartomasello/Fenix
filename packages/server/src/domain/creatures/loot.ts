import type { CreatureDefinition, ItemKind } from '@fenix/shared';

/** Tira los dados del botín de una criatura. */
export function rollLoot(
  definition: CreatureDefinition,
  random: () => number,
): { kind: ItemKind; amount: number }[] {
  const drops: { kind: ItemKind; amount: number }[] = [];
  for (const entry of definition.loot) {
    if (random() >= entry.chance) continue;
    const [min, max] = entry.amount ?? [1, 1];
    drops.push({ kind: entry.kind, amount: min + Math.floor(random() * (max - min + 1)) });
  }
  return drops;
}
