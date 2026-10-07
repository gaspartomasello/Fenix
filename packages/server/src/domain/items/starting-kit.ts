import type { ItemKind } from '@fenix/shared';

/** Lo que trae cada personaje nuevo en la mochila. */
export const STARTING_KIT: readonly { kind: ItemKind; amount: number }[] = [
  { kind: 'gold', amount: 50 },
  { kind: 'dagger', amount: 1 },
  { kind: 'apple', amount: 3 },
  { kind: 'healing-potion', amount: 1 },
];
