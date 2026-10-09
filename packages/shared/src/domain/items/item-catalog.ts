import { SPELLS, SPELL_KEYS, type SpellKey } from '../magic/spell-catalog';
import type { SkillKey } from '../skills/skill-catalog';
import type { EquipmentSlot } from './equipment';

/** Tipos de objeto del juego. La clave es la que se usa en mapas y en la red. */
export const BASE_ITEM_KINDS = [
  'gold',
  // Comida y bebida
  'apple',
  'raw-fish',
  'fish-steak',
  'raw-ribs',
  'cooked-ribs',
  'healing-potion',
  'cure-potion',
  'refresh-potion',
  'strength-potion',
  'agility-potion',
  'empty-bottle',
  'bandage',
  // Armas
  'dagger',
  'kryss',
  'spear',
  'short-sword',
  'broadsword',
  'katana',
  'axe',
  'mace',
  'war-hammer',
  'bow',
  'arrow',
  // Armaduras y ropa
  'wooden-shield',
  'leather-cap',
  'iron-helmet',
  'plate-helm',
  'wizard-hat',
  'leather-armor',
  'studded-leather',
  'chainmail',
  'plate-chest',
  'robe',
  'cloak',
  'trousers',
  'leather-leggings',
  'plate-legs',
  'boots',
  // Magia
  'spellbook',
  'blank-scroll',
  'black-pearl',
  'blood-moss',
  'garlic',
  'ginseng',
  'mandrake-root',
  'nightshade',
  'spiders-silk',
  'sulfurous-ash',
  // Herramientas
  'pickaxe',
  'fishing-pole',
  'smith-hammer',
  'sewing-kit',
  'saw',
  'fletching-kit',
  'mortar-pestle',
  'scribe-pen',
  'skillet',
  // Materiales
  'logs',
  'boards',
  'iron-ore',
  'iron-ingot',
  'cloth',
  'hides',
] as const;

export type BaseItemKind = (typeof BASE_ITEM_KINDS)[number];
/** Pergamino de un hechizo: se lanza una vez sin gastar reactivos. */
export type ScrollKind = `scroll-${SpellKey}`;
export type ItemKind = BaseItemKind | ScrollKind;

export const SCROLL_KINDS: readonly ScrollKind[] = SPELL_KEYS.map((k) => `scroll-${k}` as const);
export const ITEM_KINDS: readonly ItemKind[] = [...BASE_ITEM_KINDS, ...SCROLL_KINDS];

/**
 * Qué pasa con doble clic. `tool`: elegir un lugar para recolectar (árbol,
 * roca, agua); `craft`: abrir la ventana del oficio; `smelt`: fundir mineral
 * cerca de una forja; `bandage`: elegir a quién vendar; `scroll`: lanzar el
 * hechizo del pergamino.
 */
export type ItemUse =
  | 'eat'
  | 'drink'
  | 'equip'
  | 'spellbook'
  | 'tool'
  | 'craft'
  | 'smelt'
  | 'bandage'
  | 'scroll'
  | 'none';

/** Lo que hace una poción al tomarla. */
export type PotionEffect = 'heal' | 'cure' | 'refresh' | 'strength' | 'agility';

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
  /** Ocupa las dos manos (no se puede usar escudo). */
  readonly twoHanded?: boolean;
  /** Herramienta: qué oficio abre. */
  readonly crafts?: SkillKey;
  /** Comida: cuánta vida devuelve. */
  readonly food?: number;
  /** Poción: qué hace. */
  readonly potion?: PotionEffect;
  /** Pergamino: qué hechizo tiene. */
  readonly spell?: SpellKey;
}

type Spec = Omit<ItemDefinition, 'kind' | 'stackable' | 'use'> &
  Partial<Pick<ItemDefinition, 'stackable' | 'use'>>;

const BASE: Readonly<Record<BaseItemKind, Spec>> = {
  gold: { name: 'moneda de oro', plural: 'monedas de oro', article: 'una', stackable: true },
  apple: {
    name: 'manzana',
    plural: 'manzanas',
    article: 'una',
    stackable: true,
    use: 'eat',
    food: 3,
  },
  'raw-fish': { name: 'pescado crudo', plural: 'pescados crudos', article: 'un', stackable: true },
  'fish-steak': {
    name: 'filete de pescado',
    plural: 'filetes de pescado',
    article: 'un',
    stackable: true,
    use: 'eat',
    food: 8,
  },
  'raw-ribs': {
    name: 'costilla cruda',
    plural: 'costillas crudas',
    article: 'una',
    stackable: true,
  },
  'cooked-ribs': {
    name: 'costilla asada',
    plural: 'costillas asadas',
    article: 'una',
    stackable: true,
    use: 'eat',
    food: 10,
  },
  'healing-potion': potion('poción de curación', 'pociones de curación', 'heal'),
  'cure-potion': potion('poción de purificación', 'pociones de purificación', 'cure'),
  'refresh-potion': potion('poción de vigor', 'pociones de vigor', 'refresh'),
  'strength-potion': potion('poción de fuerza', 'pociones de fuerza', 'strength'),
  'agility-potion': potion('poción de agilidad', 'pociones de agilidad', 'agility'),
  'empty-bottle': {
    name: 'botella vacía',
    plural: 'botellas vacías',
    article: 'una',
    stackable: true,
  },
  bandage: { name: 'venda', plural: 'vendas', article: 'una', stackable: true, use: 'bandage' },

  dagger: weapon('daga', 'dagas', 'una'),
  kryss: weapon('estoque', 'estoques', 'un'),
  spear: { ...weapon('lanza', 'lanzas', 'una'), twoHanded: true },
  'short-sword': weapon('espada corta', 'espadas cortas', 'una'),
  broadsword: weapon('espada ancha', 'espadas anchas', 'una'),
  katana: weapon('katana', 'katanas', 'una'),
  axe: { ...weapon('hacha', 'hachas', 'un'), use: 'tool' },
  mace: weapon('maza', 'mazas', 'una'),
  'war-hammer': { ...weapon('martillo de guerra', 'martillos de guerra', 'un'), twoHanded: true },
  bow: { ...weapon('arco', 'arcos', 'un'), twoHanded: true },
  arrow: { name: 'flecha', plural: 'flechas', article: 'una', stackable: true },

  'wooden-shield': wear('escudo de madera', 'escudos de madera', 'un', 'leftHand', 0x8a5a2e),
  'leather-cap': wear('gorro de cuero', 'gorros de cuero', 'un', 'head', 0x7a4e2a),
  'iron-helmet': wear('yelmo de hierro', 'yelmos de hierro', 'un', 'head', 0x9aa0a8),
  'plate-helm': wear('yelmo cerrado', 'yelmos cerrados', 'un', 'head', 0xa8aeb6),
  'wizard-hat': wear('sombrero de mago', 'sombreros de mago', 'un', 'head', 0x3a2a6a),
  'leather-armor': wear('pechera de cuero', 'pecheras de cuero', 'una', 'torso', 0x7a4e2a),
  'studded-leather': wear('pechera tachonada', 'pecheras tachonadas', 'una', 'torso', 0x5e3c22),
  chainmail: wear('cota de malla', 'cotas de malla', 'una', 'torso', 0x8e949c),
  'plate-chest': wear('peto de placas', 'petos de placas', 'un', 'torso', 0xa8aeb6),
  robe: wear('túnica', 'túnicas', 'una', 'torso', 0x3a2a6a),
  cloak: wear('capa', 'capas', 'una', 'cloak', 0x7a1f2a),
  trousers: wear('pantalón', 'pantalones', 'un', 'legs', 0x3a4a6a),
  'leather-leggings': wear(
    'par de perneras de cuero',
    'pares de perneras de cuero',
    'un',
    'legs',
    0x6a4426,
  ),
  'plate-legs': wear(
    'par de grebas de placas',
    'pares de grebas de placas',
    'un',
    'legs',
    0xa8aeb6,
  ),
  boots: wear('par de botas', 'pares de botas', 'un', 'feet', 0x3a2a1c),

  spellbook: {
    name: 'libro de hechizos',
    plural: 'libros de hechizos',
    article: 'un',
    use: 'spellbook',
  },
  'blank-scroll': {
    name: 'pergamino en blanco',
    plural: 'pergaminos en blanco',
    article: 'un',
    stackable: true,
  },
  'black-pearl': reagent('perla negra', 'perlas negras', 'una'),
  'blood-moss': reagent('musgo de sangre', 'musgos de sangre', 'un'),
  garlic: reagent('diente de ajo', 'dientes de ajo', 'un'),
  ginseng: reagent('raíz de ginseng', 'raíces de ginseng', 'una'),
  'mandrake-root': reagent('raíz de mandrágora', 'raíces de mandrágora', 'una'),
  nightshade: reagent('belladona', 'belladonas', 'una'),
  'spiders-silk': reagent('seda de araña', 'sedas de araña', 'una'),
  'sulfurous-ash': reagent('ceniza sulfurosa', 'cenizas sulfurosas', 'una'),

  pickaxe: { ...weapon('pico', 'picos', 'un'), use: 'tool' },
  'fishing-pole': {
    name: 'caña de pescar',
    plural: 'cañas de pescar',
    article: 'una',
    use: 'tool',
  },
  'smith-hammer': tool('martillo de herrero', 'martillos de herrero', 'un', 'blacksmithy'),
  'sewing-kit': tool('costurero', 'costureros', 'un', 'tailoring'),
  saw: tool('serrucho', 'serruchos', 'un', 'carpentry'),
  'fletching-kit': tool('juego de flechero', 'juegos de flechero', 'un', 'bowcraft'),
  'mortar-pestle': tool('mortero', 'morteros', 'un', 'alchemy'),
  'scribe-pen': tool('pluma de escriba', 'plumas de escriba', 'una', 'inscription'),
  skillet: tool('sartén', 'sartenes', 'una', 'cooking'),

  logs: { name: 'tronco', plural: 'troncos', article: 'un', stackable: true },
  boards: { name: 'tabla', plural: 'tablas', article: 'una', stackable: true },
  'iron-ore': {
    name: 'mineral de hierro',
    plural: 'minerales de hierro',
    article: 'un',
    stackable: true,
    use: 'smelt',
  },
  'iron-ingot': {
    name: 'lingote de hierro',
    plural: 'lingotes de hierro',
    article: 'un',
    stackable: true,
  },
  cloth: { name: 'rollo de tela', plural: 'rollos de tela', article: 'un', stackable: true },
  hides: { name: 'piel', plural: 'pieles', article: 'una', stackable: true },
};

function potion(name: string, plural: string, effect: PotionEffect): Spec {
  return { name, plural, article: 'una', stackable: true, use: 'drink', potion: effect };
}
function weapon(name: string, plural: string, article: 'un' | 'una'): Spec {
  return { name, plural, article, slot: 'rightHand', use: 'equip' };
}
function wear(
  name: string,
  plural: string,
  article: 'un' | 'una',
  slot: EquipmentSlot,
  color: number,
): Spec {
  return { name, plural, article, slot, use: 'equip', color };
}
function reagent(name: string, plural: string, article: 'un' | 'una'): Spec {
  return { name, plural, article, stackable: true };
}
function tool(name: string, plural: string, article: 'un' | 'una', crafts: SkillKey): Spec {
  return { name, plural, article, use: 'craft', crafts };
}

const scrolls = Object.fromEntries(
  SPELL_KEYS.map((spell): [ScrollKind, ItemDefinition] => {
    const kind = `scroll-${spell}` as const;
    return [
      kind,
      {
        kind,
        name: `pergamino de ${SPELLS[spell].name}`,
        plural: `pergaminos de ${SPELLS[spell].name}`,
        article: 'un',
        stackable: true,
        use: 'scroll',
        spell,
      },
    ];
  }),
) as Record<ScrollKind, ItemDefinition>;

export const ITEMS: Readonly<Record<ItemKind, ItemDefinition>> = {
  ...(Object.fromEntries(
    BASE_ITEM_KINDS.map((kind) => {
      const spec = BASE[kind];
      return [kind, { kind, stackable: false, use: 'none', ...spec }];
    }),
  ) as Record<BaseItemKind, ItemDefinition>),
  ...scrolls,
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

/** Máximo de unidades en una pila, como en UO. */
export const MAX_STACK = 60_000;
