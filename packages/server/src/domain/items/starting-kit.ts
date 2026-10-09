import type { ItemKind } from '@fenix/shared';

/** Lo que trae cada personaje nuevo en la mochila. */
export const STARTING_KIT: readonly { kind: ItemKind; amount: number }[] = [
  { kind: 'gold', amount: 50 },
  { kind: 'dagger', amount: 1 },
  { kind: 'apple', amount: 3 },
  { kind: 'healing-potion', amount: 1 },
  { kind: 'spellbook', amount: 1 },
  { kind: 'garlic', amount: 10 },
  { kind: 'ginseng', amount: 10 },
  { kind: 'sulfurous-ash', amount: 15 },
  { kind: 'black-pearl', amount: 5 },
  { kind: 'mandrake-root', amount: 5 },
  { kind: 'spiders-silk', amount: 10 },
  { kind: 'blood-moss', amount: 5 },
  { kind: 'nightshade', amount: 5 },
  { kind: 'bandage', amount: 10 },
];
