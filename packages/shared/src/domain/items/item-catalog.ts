import type { EquipmentSlot } from './equipment';

/** Tipos de objeto del juego. La clave es la que se usa en mapas y en la red. */
export const ITEM_KINDS = [
  'gold',
  'apple',
  'healing-potion',
  'dagger',
  'short-sword',
  'axe',
  'wooden-shield',
  'leather-cap',
  'iron-helmet',
  'leather-armor',
  'chainmail',
  'cloak',
  'trousers',
  'boots',
] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];

export type ItemUse = 'eat' | 'drink' | 'equip' | 'none';

export interface ItemDefinition {
  readonly kind: ItemKind;
  /** Nombre en singular y plural, para mensajes como "3 manzanas". */
  readonly name: string;
  readonly plural: string;
  /** Artículo indefinido: "un" o "una". */
  readonly article: 'un' | 'una';
  readonly stackable: boolean;
  /** Lugar del cuerpo donde se equipa, si se puede equipar. */
  readonly slot?: EquipmentSlot;
  readonly use: ItemUse;
  /** Color con el que se ve puesto (ropa y armaduras). */
  readonly color?: number;
}

const item = (definition: ItemDefinition): ItemDefinition => definition;

export const ITEMS: Readonly<Record<ItemKind, ItemDefinition>> = {
  gold: item({
    kind: 'gold',
    name: 'moneda de oro',
    plural: 'monedas de oro',
    article: 'una',
    stackable: true,
    use: 'none',
  }),
  apple: item({
    kind: 'apple',
    name: 'manzana',
    plural: 'manzanas',
    article: 'una',
    stackable: true,
    use: 'eat',
  }),
  'healing-potion': item({
    kind: 'healing-potion',
    name: 'poción de curación',
    plural: 'pociones de curación',
    article: 'una',
    stackable: true,
    use: 'drink',
  }),
  dagger: item({
    kind: 'dagger',
    name: 'daga',
    plural: 'dagas',
    article: 'una',
    stackable: false,
    slot: 'rightHand',
    use: 'equip',
  }),
  'short-sword': item({
    kind: 'short-sword',
    name: 'espada corta',
    plural: 'espadas cortas',
    article: 'una',
    stackable: false,
    slot: 'rightHand',
    use: 'equip',
  }),
  axe: item({
    kind: 'axe',
    name: 'hacha',
    plural: 'hachas',
    article: 'un',
    stackable: false,
    slot: 'rightHand',
    use: 'equip',
  }),
  'wooden-shield': item({
    kind: 'wooden-shield',
    name: 'escudo de madera',
    plural: 'escudos de madera',
    article: 'un',
    stackable: false,
    slot: 'leftHand',
    use: 'equip',
    color: 0x8a5a2e,
  }),
  'leather-cap': item({
    kind: 'leather-cap',
    name: 'gorro de cuero',
    plural: 'gorros de cuero',
    article: 'un',
    stackable: false,
    slot: 'head',
    use: 'equip',
    color: 0x7a4e2a,
  }),
  'iron-helmet': item({
    kind: 'iron-helmet',
    name: 'yelmo de hierro',
    plural: 'yelmos de hierro',
    article: 'un',
    stackable: false,
    slot: 'head',
    use: 'equip',
    color: 0x9aa0a8,
  }),
  'leather-armor': item({
    kind: 'leather-armor',
    name: 'pechera de cuero',
    plural: 'pecheras de cuero',
    article: 'una',
    stackable: false,
    slot: 'torso',
    use: 'equip',
    color: 0x7a4e2a,
  }),
  chainmail: item({
    kind: 'chainmail',
    name: 'cota de malla',
    plural: 'cotas de malla',
    article: 'una',
    stackable: false,
    slot: 'torso',
    use: 'equip',
    color: 0x8e949c,
  }),
  cloak: item({
    kind: 'cloak',
    name: 'capa',
    plural: 'capas',
    article: 'una',
    stackable: false,
    slot: 'cloak',
    use: 'equip',
    color: 0x7a1f2a,
  }),
  trousers: item({
    kind: 'trousers',
    name: 'pantalón',
    plural: 'pantalones',
    article: 'un',
    stackable: false,
    slot: 'legs',
    use: 'equip',
    color: 0x3a4a6a,
  }),
  boots: item({
    kind: 'boots',
    name: 'par de botas',
    plural: 'pares de botas',
    article: 'un',
    stackable: false,
    slot: 'feet',
    use: 'equip',
    color: 0x3a2a1c,
  }),
};

export function isItemKind(value: unknown): value is ItemKind {
  return typeof value === 'string' && (ITEM_KINDS as readonly string[]).includes(value);
}

/** "una manzana", "3 manzanas", "50 monedas de oro". */
export function describeItem(kind: ItemKind, amount = 1): string {
  const definition = ITEMS[kind];
  if (amount === 1) return `${definition.article} ${definition.name}`;
  return `${amount} ${definition.plural}`;
}

/** Máximo de unidades en una pila. */
export const MAX_STACK = 60_000;
