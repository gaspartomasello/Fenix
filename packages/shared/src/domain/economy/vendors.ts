import type { ItemKind } from '../items/item-catalog';
import { SPELLS, SPELL_KEYS } from '../magic/spell-catalog';

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

const offers = (list: Readonly<Partial<Record<ItemKind, number>>>): VendorOffer[] =>
  Object.entries(list).map(([kind, price]) => ({ kind: kind as ItemKind, price }));

export const VENDORS: Readonly<Record<NpcRole, VendorDefinition>> = {
  blacksmith: {
    role: 'blacksmith',
    name: 'Tomás el herrero',
    greeting: '¡Buen acero para buenos aventureros!',
    sells: offers({
      pickaxe: 30,
      'smith-hammer': 25,
      'iron-ingot': 8,
      dagger: 40,
      kryss: 70,
      'short-sword': 90,
      broadsword: 120,
      katana: 140,
      axe: 70,
      mace: 80,
      'war-hammer': 180,
      spear: 110,
      bow: 100,
      arrow: 1,
      'wooden-shield': 60,
      'iron-helmet': 120,
      chainmail: 250,
      'plate-helm': 180,
      'plate-legs': 260,
      'plate-chest': 400,
    }),
    buys: offers({
      'iron-ore': 2,
      'iron-ingot': 5,
      dagger: 15,
      kryss: 30,
      'short-sword': 35,
      broadsword: 50,
      katana: 60,
      axe: 25,
      mace: 30,
      'war-hammer': 75,
      spear: 45,
      bow: 40,
      pickaxe: 10,
      'iron-helmet': 45,
      chainmail: 100,
      'plate-helm': 70,
      'plate-legs': 100,
      'plate-chest': 160,
      'wooden-shield': 20,
    }),
  },
  mage: {
    role: 'mage',
    name: 'Ilse la maga',
    greeting: 'Los reactivos más frescos de la isla.',
    sells: offers({
      spellbook: 50,
      'black-pearl': 5,
      'blood-moss': 5,
      garlic: 3,
      ginseng: 3,
      'mandrake-root': 4,
      nightshade: 4,
      'spiders-silk': 4,
      'sulfurous-ash': 3,
      'blank-scroll': 5,
      'scribe-pen': 15,
      'mortar-pestle': 20,
      'empty-bottle': 3,
      'healing-potion': 20,
      'cure-potion': 25,
      'refresh-potion': 15,
      'scroll-magic-arrow': 15,
      'scroll-heal': 15,
      'scroll-cure': 25,
      'scroll-harm': 25,
      robe: 40,
      'wizard-hat': 30,
    }),
    buys: offers({
      'black-pearl': 2,
      'blood-moss': 2,
      garlic: 1,
      ginseng: 1,
      'mandrake-root': 2,
      nightshade: 2,
      'spiders-silk': 2,
      'sulfurous-ash': 1,
      'empty-bottle': 1,
      'healing-potion': 8,
      'cure-potion': 10,
      'refresh-potion': 6,
      'strength-potion': 12,
      'agility-potion': 12,
      ...Object.fromEntries(SPELL_KEYS.map((key) => [`scroll-${key}`, 4 + SPELLS[key].circle * 6])),
    }),
  },
  innkeeper: {
    role: 'innkeeper',
    name: 'Benito el tabernero',
    greeting: 'Pasá, que hay comida, abrigo y de todo un poco.',
    sells: offers({
      apple: 2,
      'cooked-ribs': 5,
      'fish-steak': 4,
      bandage: 2,
      cloth: 3,
      hides: 3,
      'sewing-kit': 15,
      skillet: 12,
      saw: 15,
      'fletching-kit': 15,
      'fishing-pole': 15,
      trousers: 15,
      boots: 20,
      cloak: 40,
      'leather-cap': 20,
      'leather-armor': 80,
      'leather-leggings': 50,
    }),
    buys: offers({
      logs: 2,
      boards: 3,
      hides: 1,
      cloth: 1,
      'raw-fish': 2,
      'raw-ribs': 2,
      'fish-steak': 2,
      'cooked-ribs': 2,
      apple: 1,
      arrow: 1,
      cloak: 15,
      robe: 15,
      trousers: 5,
      boots: 8,
      'wizard-hat': 10,
      'leather-armor': 30,
      'studded-leather': 45,
      'leather-leggings': 20,
      'leather-cap': 8,
    }),
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
