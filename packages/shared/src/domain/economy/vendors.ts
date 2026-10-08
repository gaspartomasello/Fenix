import type { ItemKind } from '../items/item-catalog';

/** Personajes del pueblo que comercian o guardan cosas. */
export const NPC_ROLES = ['blacksmith', 'mage', 'innkeeper', 'banker'] as const;
export type NpcRole = (typeof NPC_ROLES)[number];

export interface VendorOffer {
  readonly kind: ItemKind;
  readonly price: number;
}

export interface VendorDefinition {
  readonly role: NpcRole;
  /** Nombre que se ve sobre la cabeza. */
  readonly name: string;
  readonly greeting: string;
  /** Lo que vende (precio por unidad). */
  readonly sells: readonly VendorOffer[];
  /** Lo que compra (precio por unidad). */
  readonly buys: readonly VendorOffer[];
}

export const VENDORS: Readonly<Record<NpcRole, VendorDefinition>> = {
  blacksmith: {
    role: 'blacksmith',
    name: 'Tomás el herrero',
    greeting: '¡Buen acero para buenos aventureros!',
    sells: [
      { kind: 'pickaxe', price: 30 },
      { kind: 'smith-hammer', price: 25 },
      { kind: 'dagger', price: 40 },
      { kind: 'short-sword', price: 90 },
      { kind: 'axe', price: 70 },
      { kind: 'wooden-shield', price: 60 },
      { kind: 'leather-cap', price: 20 },
      { kind: 'iron-helmet', price: 120 },
      { kind: 'leather-armor', price: 80 },
      { kind: 'chainmail', price: 250 },
    ],
    buys: [
      { kind: 'iron-ore', price: 2 },
      { kind: 'iron-ingot', price: 5 },
      { kind: 'dagger', price: 15 },
      { kind: 'short-sword', price: 35 },
      { kind: 'axe', price: 25 },
      { kind: 'pickaxe', price: 10 },
      { kind: 'iron-helmet', price: 45 },
      { kind: 'chainmail', price: 100 },
      { kind: 'wooden-shield', price: 20 },
    ],
  },
  mage: {
    role: 'mage',
    name: 'Ilse la maga',
    greeting: 'Los reactivos más frescos de la isla.',
    sells: [
      { kind: 'spellbook', price: 50 },
      { kind: 'black-pearl', price: 5 },
      { kind: 'garlic', price: 3 },
      { kind: 'ginseng', price: 3 },
      { kind: 'mandrake-root', price: 4 },
      { kind: 'spiders-silk', price: 4 },
      { kind: 'sulfurous-ash', price: 3 },
      { kind: 'healing-potion', price: 20 },
    ],
    buys: [
      { kind: 'black-pearl', price: 2 },
      { kind: 'garlic', price: 1 },
      { kind: 'ginseng', price: 1 },
      { kind: 'mandrake-root', price: 2 },
      { kind: 'spiders-silk', price: 2 },
      { kind: 'sulfurous-ash', price: 1 },
      { kind: 'healing-potion', price: 8 },
    ],
  },
  innkeeper: {
    role: 'innkeeper',
    name: 'Benito el tabernero',
    greeting: 'Pasá, que hay manzanas y abrigo.',
    sells: [
      { kind: 'apple', price: 2 },
      { kind: 'trousers', price: 15 },
      { kind: 'boots', price: 20 },
      { kind: 'cloak', price: 40 },
    ],
    buys: [
      { kind: 'logs', price: 2 },
      { kind: 'apple', price: 1 },
      { kind: 'cloak', price: 15 },
      { kind: 'boots', price: 8 },
      { kind: 'leather-armor', price: 30 },
      { kind: 'leather-cap', price: 8 },
    ],
  },
  banker: {
    role: 'banker',
    name: 'Ramona la banquera',
    greeting: 'Tu caja del banco está a salvo conmigo.',
    sells: [],
    buys: [],
  },
};

/** Distancia a la que se puede comerciar o usar el banco. */
export const VENDOR_RANGE = 3;

export function isNpcRole(value: unknown): value is NpcRole {
  return typeof value === 'string' && (NPC_ROLES as readonly string[]).includes(value);
}
