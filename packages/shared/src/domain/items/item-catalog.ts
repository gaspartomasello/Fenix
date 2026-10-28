import { SPELLS, SPELL_KEYS, type SpellKey } from '../magic/spell-catalog';
import type { SkillKey } from '../skills/skill-catalog';
import { HOUSE_PLANS, type HouseKind } from '../housing/houses';
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
  'bread',
  'cheese',
  'ham',
  'carrot',
  'meat-pie',
  'wine',
  'ale',
  'healing-potion',
  'cure-potion',
  'refresh-potion',
  'strength-potion',
  'agility-potion',
  'empty-bottle',
  'bandage',
  // Recipientes: se abren con doble clic y guardan cosas adentro
  'bag',
  'pouch',
  'wooden-box',
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
  'longsword',
  'scimitar',
  'war-axe',
  'halberd',
  'club',
  'quarterstaff',
  'bow',
  'arrow',
  // Más armas, como las de UO: hachas, armas de asta, espadas y ballestas
  'double-axe',
  'battle-axe',
  'two-handed-axe',
  'large-battle-axe',
  'bardiche',
  'war-fork',
  'short-spear',
  'hammer-pick',
  'cutlass',
  'viking-sword',
  'crossbow',
  'heavy-crossbow',
  'bolt',
  // Armaduras y ropa
  'wooden-shield',
  'buckler',
  'metal-shield',
  'kite-shield',
  'heater-shield',
  'leather-cap',
  'chain-coif',
  'iron-helmet',
  'plate-helm',
  'wizard-hat',
  'leather-armor',
  'studded-leather',
  'chainmail',
  'ringmail',
  'plate-chest',
  'female-plate',
  'robe',
  'cloak',
  'trousers',
  'leather-leggings',
  'plate-legs',
  'boots',
  // Ropa: camisas, vestidos, polleras, sombreros y calzado
  'shirt',
  'fancy-shirt',
  'doublet',
  'dress',
  'skirt',
  'short-pants',
  'straw-hat',
  'feathered-hat',
  'tricorne',
  'bandana',
  'sandals',
  'shoes',
  'thigh-boots',
  'fur-cape',
  // Armadura de hueso: no es de metal (deja meditar y lanzar hechizos)
  'bone-helm',
  'bone-armor',
  'bone-leggings',
  // La máscara de madera pintada de las tribus de la selva, con penacho de plumas.
  'tribal-mask',
  // Piezas sueltas de armadura, como en UO: gola, brazales, guantes y perneras de cada material
  'leather-gorget',
  'studded-gorget',
  'plate-gorget',
  'leather-sleeves',
  'studded-sleeves',
  'ringmail-sleeves',
  'bone-arms',
  'plate-arms',
  'leather-gloves',
  'studded-gloves',
  'ringmail-gloves',
  'bone-gloves',
  'plate-gloves',
  'studded-leggings',
  'ringmail-leggings',
  'chain-leggings',
  // Etapa 59: mangual, escudos grandes y armaduras samurái, de legionario y templaria
  'flail',
  'legion-shield',
  'templar-shield',
  'samurai-kabuto',
  'samurai-mempo',
  'samurai-do',
  'samurai-sode',
  'samurai-haidate',
  'samurai-suneate',
  'legion-helm',
  'legion-cuirass',
  'legion-arms',
  'legion-greaves',
  'templar-helm',
  'templar-hauberk',
  'templar-sleeves',
  'templar-gauntlets',
  'templar-chausses',
  // Tinturas
  'dyes',
  'dye-tub',
  // Magia
  'spellbook',
  'book',
  'letter',
  'blank-scroll',
  'rune',
  'moongate',
  // Muros y campos mágicos (fijos en el suelo, por un rato)
  'field-stone',
  'field-fire',
  'field-poison',
  'field-paralyze',
  'field-energy',
  // Búsqueda de tesoros
  'treasure-map',
  'shovel',
  'treasure-chest',
  // Barcos: maquetas para botarlos, la bodega y las balas de los cañones
  'sloop-deed',
  'galleon-deed',
  'ship-hold',
  'cannonball',
  // Casas: la escritura de cada una (se compra al arquitecto) y los cofres de adentro
  'deed-wood-shack',
  'deed-log-cabin',
  'deed-stone-cottage',
  'deed-sandstone-patio',
  'deed-plank-house',
  'deed-stone-house',
  'deed-basalt-tower',
  'deed-stone-keep',
  'deed-fortress',
  'deed-lot-small',
  'deed-lot-medium',
  'deed-lot-large',
  'deed-lot-huge',
  'house-chest',
  'black-pearl',
  'blood-moss',
  'garlic',
  'ginseng',
  'mandrake-root',
  'nightshade',
  'spiders-silk',
  'sulfurous-ash',
  // Luz: en la mano izquierda, alumbra alrededor de noche y en las mazmorras
  'torch',
  'lantern',
  // Instrumentos
  'lute',
  'drum',
  'flute',
  // Gemas: botín valioso, se venden bien
  'ruby',
  'sapphire',
  'emerald',
  'amethyst',
  'diamond',
  // Herramientas
  'pickaxe',
  'fishing-pole',
  'smith-hammer',
  'lockpick',
  // Leyendas: reliquias que hay que devolver y los pergaminos de maestría que se ganan
  'silent-grimoire',
  'buried-crown',
  'hermit-diary',
  'burnt-key',
  'mastery-magery',
  'mastery-tactics',
  'mastery-healing',
  'mastery-lockpicking',
  'sewing-kit',
  'saw',
  'fletching-kit',
  'mortar-pestle',
  'scribe-pen',
  'skillet',
  // Materiales
  'logs',
  'boards',
  'stone-block',
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
  | 'container'
  | 'book'
  | 'music'
  | 'dye'
  | 'map'
  | 'dig'
  | 'ship'
  | 'house'
  | 'lockpick'
  | 'mastery'
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
  /** Solo lo pueden poner las mujeres (el peto de placas de mujer, como en UO). */
  readonly womenOnly?: boolean;
  /** Herramienta: qué oficio abre. */
  readonly crafts?: SkillKey;
  /** Comida: cuánta vida devuelve. */
  readonly food?: number;
  /** Poción: qué hace. */
  readonly potion?: PotionEffect;
  /** Pergamino: qué hechizo tiene. */
  readonly spell?: SpellKey;
  /** No se puede levantar ni mover (un portal abierto). */
  readonly fixed?: boolean;
  /** Recipiente: cuántos objetos entran adentro. */
  readonly capacity?: number;
  /** Luz que da llevándolo en la mano (radio en tiles). */
  readonly light?: number;
  /** Se puede teñir (tela y cuero). */
  readonly dyeable?: boolean;
}

type Spec = Omit<ItemDefinition, 'kind' | 'stackable' | 'use'> &
  Partial<Pick<ItemDefinition, 'stackable' | 'use'>>;

/** La escritura de una casa: con doble clic se elige dónde levantarla. */
const houseDeed = (kind: HouseKind): Spec => ({
  name: `escritura de ${HOUSE_PLANS[kind].name}`,
  plural: `escrituras de ${HOUSE_PLANS[kind].name}`,
  article: 'una',
  use: 'house',
});

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
  bread: food('pan', 'panes', 'un', 6),
  cheese: food('queso', 'quesos', 'un', 5),
  ham: food('jamón', 'jamones', 'un', 12),
  carrot: food('zanahoria', 'zanahorias', 'una', 3),
  'meat-pie': food('pastel de carne', 'pasteles de carne', 'un', 14),
  wine: { ...food('botella de vino', 'botellas de vino', 'una', 4), use: 'drink' },
  ale: { ...food('jarra de cerveza', 'jarras de cerveza', 'una', 3), use: 'drink' },
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
  // Las bolsas son de cuero: se pueden teñir, como en UO.
  bag: {
    name: 'bolsa',
    plural: 'bolsas',
    article: 'una',
    use: 'container',
    capacity: 40,
    color: 0x96683c,
    dyeable: true,
  },
  pouch: {
    name: 'bolsita',
    plural: 'bolsitas',
    article: 'una',
    use: 'container',
    capacity: 15,
    color: 0x784c2e,
    dyeable: true,
  },
  'wooden-box': {
    name: 'caja de madera',
    plural: 'cajas de madera',
    article: 'una',
    use: 'container',
    capacity: 60,
  },
  // Viajes: la runa guarda un lugar (con Marcar) y el portal lo abre Portal.
  rune: { name: 'runa', plural: 'runas', article: 'una', color: 0x8a7a9c },
  moongate: { name: 'portal', plural: 'portales', article: 'un', fixed: true, color: 0x4aa8ff },
  'field-stone': { name: 'muro de piedra', plural: 'muros de piedra', article: 'un', fixed: true },
  'field-fire': { name: 'campo de fuego', plural: 'campos de fuego', article: 'un', fixed: true },
  'field-poison': {
    name: 'campo venenoso',
    plural: 'campos venenosos',
    article: 'un',
    fixed: true,
  },
  'field-paralyze': {
    name: 'campo paralizante',
    plural: 'campos paralizantes',
    article: 'un',
    fixed: true,
  },
  'field-energy': {
    name: 'campo de energía',
    plural: 'campos de energía',
    article: 'un',
    fixed: true,
  },
  'treasure-map': {
    name: 'mapa del tesoro',
    plural: 'mapas del tesoro',
    article: 'un',
    use: 'map',
  },
  shovel: { name: 'pala', plural: 'palas', article: 'una', use: 'dig' },
  'silent-grimoire': {
    name: 'Grimorio del Silencio',
    plural: 'Grimorios del Silencio',
    article: 'un',
  },
  'buried-crown': { name: 'corona del Rey Sepultado', plural: 'coronas', article: 'una' },
  'hermit-diary': { name: 'diario del ermitaño', plural: 'diarios', article: 'un' },
  'burnt-key': { name: 'llave chamuscada', plural: 'llaves chamuscadas', article: 'una' },
  'mastery-magery': mastery('Magia'),
  'mastery-tactics': mastery('Tácticas'),
  'mastery-healing': mastery('Primeros auxilios'),
  'mastery-lockpicking': mastery('Forzar cerraduras'),
  lockpick: { name: 'ganzúa', plural: 'ganzúas', article: 'una', stackable: true, use: 'lockpick' },
  'sloop-deed': {
    name: 'maqueta de balandra',
    plural: 'maquetas de balandra',
    article: 'una',
    use: 'ship',
  },
  'galleon-deed': {
    name: 'maqueta de galeón',
    plural: 'maquetas de galeón',
    article: 'una',
    use: 'ship',
  },
  'deed-wood-shack': houseDeed('wood-shack'),
  'deed-log-cabin': houseDeed('log-cabin'),
  'deed-stone-cottage': houseDeed('stone-cottage'),
  'deed-sandstone-patio': houseDeed('sandstone-patio'),
  'deed-plank-house': houseDeed('plank-house'),
  'deed-stone-house': houseDeed('stone-house'),
  'deed-basalt-tower': houseDeed('basalt-tower'),
  'deed-stone-keep': houseDeed('stone-keep'),
  'deed-fortress': houseDeed('fortress'),
  'deed-lot-small': houseDeed('lot-small'),
  'deed-lot-medium': houseDeed('lot-medium'),
  'deed-lot-large': houseDeed('lot-large'),
  'deed-lot-huge': houseDeed('lot-huge'),
  'house-chest': {
    name: 'cofre de la casa',
    plural: 'cofres de la casa',
    article: 'un',
    fixed: true,
    capacity: 125,
  },
  'ship-hold': {
    name: 'bodega del barco',
    plural: 'bodegas de barco',
    article: 'una',
    fixed: true,
    capacity: 80,
  },
  cannonball: {
    name: 'bala de cañón',
    plural: 'balas de cañón',
    article: 'una',
    stackable: true,
  },
  'treasure-chest': {
    name: 'cofre del tesoro',
    plural: 'cofres del tesoro',
    article: 'un',
    fixed: true,
    capacity: 40,
  },

  dagger: weapon('daga', 'dagas', 'una'),
  kryss: weapon('estoque', 'estoques', 'un'),
  spear: { ...weapon('lanza', 'lanzas', 'una'), twoHanded: true },
  'short-sword': weapon('espada corta', 'espadas cortas', 'una'),
  broadsword: weapon('espada ancha', 'espadas anchas', 'una'),
  katana: weapon('katana', 'katanas', 'una'),
  axe: { ...weapon('hacha', 'hachas', 'un'), use: 'tool' },
  mace: weapon('maza', 'mazas', 'una'),
  'war-hammer': { ...weapon('martillo de guerra', 'martillos de guerra', 'un'), twoHanded: true },
  longsword: weapon('espada larga', 'espadas largas', 'una'),
  scimitar: weapon('cimitarra', 'cimitarras', 'una'),
  'war-axe': weapon('hacha de guerra', 'hachas de guerra', 'un'),
  halberd: { ...weapon('alabarda', 'alabardas', 'una'), twoHanded: true },
  club: weapon('garrote', 'garrotes', 'un'),
  quarterstaff: { ...weapon('bastón de combate', 'bastones de combate', 'un'), twoHanded: true },
  bow: { ...weapon('arco', 'arcos', 'un'), twoHanded: true },
  arrow: { name: 'flecha', plural: 'flechas', article: 'una', stackable: true },
  'double-axe': { ...weapon('hacha doble', 'hachas dobles', 'un'), twoHanded: true },
  'battle-axe': { ...weapon('hacha de batalla', 'hachas de batalla', 'un'), twoHanded: true },
  'two-handed-axe': {
    ...weapon('hacha a dos manos', 'hachas a dos manos', 'un'),
    twoHanded: true,
  },
  'large-battle-axe': {
    ...weapon('gran hacha de batalla', 'grandes hachas de batalla', 'una'),
    twoHanded: true,
  },
  bardiche: { ...weapon('hacha de asta', 'hachas de asta', 'un'), twoHanded: true },
  'war-fork': weapon('horquilla de guerra', 'horquillas de guerra', 'una'),
  'short-spear': { ...weapon('lanza corta', 'lanzas cortas', 'una'), twoHanded: true },
  'hammer-pick': weapon('pico de guerra', 'picos de guerra', 'un'),
  cutlass: weapon('alfanje', 'alfanjes', 'un'),
  'viking-sword': weapon('espada vikinga', 'espadas vikingas', 'una'),
  crossbow: { ...weapon('ballesta', 'ballestas', 'una'), twoHanded: true },
  'heavy-crossbow': { ...weapon('ballesta pesada', 'ballestas pesadas', 'una'), twoHanded: true },
  bolt: { name: 'virote', plural: 'virotes', article: 'un', stackable: true },

  'wooden-shield': wear('escudo de madera', 'escudos de madera', 'un', 'leftHand', 0x8a5a2e),
  buckler: wear('rodela', 'rodelas', 'una', 'leftHand', 0x9aa0a8),
  'metal-shield': wear('escudo de metal', 'escudos de metal', 'un', 'leftHand', 0xa8aeb6),
  'kite-shield': wear('escudo de cometa', 'escudos de cometa', 'un', 'leftHand', 0x8a2a2a),
  'heater-shield': wear('escudo heráldico', 'escudos heráldicos', 'un', 'leftHand', 0x2a3a6a),
  'chain-coif': wear('capucha de malla', 'capuchas de malla', 'una', 'head', 0x8e949c),
  'leather-cap': cloth('gorro de cuero', 'gorros de cuero', 'un', 'head', 0x7a4e2a),
  'iron-helmet': wear('yelmo de hierro', 'yelmos de hierro', 'un', 'head', 0x9aa0a8),
  'plate-helm': wear('yelmo cerrado', 'yelmos cerrados', 'un', 'head', 0xa8aeb6),
  'wizard-hat': cloth('sombrero de mago', 'sombreros de mago', 'un', 'head', 0x3a2a6a),
  'leather-armor': cloth('pechera de cuero', 'pecheras de cuero', 'una', 'torso', 0x7a4e2a),
  'studded-leather': cloth('pechera tachonada', 'pecheras tachonadas', 'una', 'torso', 0x5e3c22),
  chainmail: wear('cota de malla', 'cotas de malla', 'una', 'torso', 0x8e949c),
  ringmail: wear('cota de anillas', 'cotas de anillas', 'una', 'torso', 0x7e848c),
  'plate-chest': wear('peto de placas', 'petos de placas', 'un', 'torso', 0xa8aeb6),
  // Como en UO, el peto de placas de mujer tiene su forma (y solo lo usan ellas).
  'female-plate': {
    ...wear('peto de placas de mujer', 'petos de placas de mujer', 'un', 'torso', 0xa8aeb6),
    womenOnly: true,
  },
  robe: cloth('túnica', 'túnicas', 'una', 'torso', 0x3a2a6a),
  cloak: cloth('capa', 'capas', 'una', 'cloak', 0x7a1f2a),
  trousers: cloth('pantalón', 'pantalones', 'un', 'legs', 0x3a4a6a),
  'leather-leggings': cloth(
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
  boots: cloth('par de botas', 'pares de botas', 'un', 'feet', 0x3a2a1c),
  shirt: cloth('camisa', 'camisas', 'una', 'torso', 0xd8d0c0),
  'fancy-shirt': cloth('camisa fina', 'camisas finas', 'una', 'torso', 0x8a2a4a),
  doublet: cloth('jubón', 'jubones', 'un', 'torso', 0x2a4a7a),
  dress: cloth('vestido', 'vestidos', 'un', 'torso', 0x6a2a6a),
  skirt: cloth('pollera', 'polleras', 'una', 'legs', 0x5a3a2a),
  'short-pants': cloth('pantalón corto', 'pantalones cortos', 'un', 'legs', 0x5a5a3a),
  'straw-hat': cloth('sombrero de paja', 'sombreros de paja', 'un', 'head', 0xd8b86a),
  'feathered-hat': cloth('sombrero con pluma', 'sombreros con pluma', 'un', 'head', 0x2a3a6a),
  tricorne: cloth('tricornio', 'tricornios', 'un', 'head', 0x2a2626),
  bandana: cloth('pañuelo', 'pañuelos', 'un', 'head', 0xb02a2a),
  sandals: cloth('par de sandalias', 'pares de sandalias', 'un', 'feet', 0x8a5a2e),
  shoes: cloth('par de zapatos', 'pares de zapatos', 'un', 'feet', 0x2a1c14),
  'thigh-boots': cloth('par de botas altas', 'pares de botas altas', 'un', 'feet', 0x3a2418),
  'fur-cape': cloth('capa de piel', 'capas de piel', 'una', 'cloak', 0x8a6a4a),
  'bone-helm': wear('yelmo de calavera', 'yelmos de calavera', 'un', 'head', 0xe2dac4),
  'bone-armor': wear('pechera de hueso', 'pecheras de hueso', 'una', 'torso', 0xe2dac4),
  'tribal-mask': wear('máscara tribal', 'máscaras tribales', 'una', 'head', 0xb0442c),
  'bone-leggings': wear(
    'par de perneras de hueso',
    'pares de perneras de hueso',
    'un',
    'legs',
    0xe2dac4,
  ),
  'leather-gorget': cloth('gola de cuero', 'golas de cuero', 'una', 'neck', 0x7a4e2a),
  'studded-gorget': cloth('gola tachonada', 'golas tachonadas', 'una', 'neck', 0x5e3c22),
  'plate-gorget': wear('gola de placas', 'golas de placas', 'una', 'neck', 0xa8aeb6),
  'leather-sleeves': cloth(
    'par de mangas de cuero',
    'pares de mangas de cuero',
    'un',
    'arms',
    0x7a4e2a,
  ),
  'studded-sleeves': cloth(
    'par de mangas tachonadas',
    'pares de mangas tachonadas',
    'un',
    'arms',
    0x5e3c22,
  ),
  'ringmail-sleeves': wear(
    'par de mangas de anillas',
    'pares de mangas de anillas',
    'un',
    'arms',
    0x7e848c,
  ),
  'bone-arms': wear(
    'par de brazales de hueso',
    'pares de brazales de hueso',
    'un',
    'arms',
    0xe2dac4,
  ),
  'plate-arms': wear(
    'par de brazales de placas',
    'pares de brazales de placas',
    'un',
    'arms',
    0xa8aeb6,
  ),
  'leather-gloves': cloth(
    'par de guantes de cuero',
    'pares de guantes de cuero',
    'un',
    'hands',
    0x7a4e2a,
  ),
  'studded-gloves': cloth(
    'par de guantes tachonados',
    'pares de guantes tachonados',
    'un',
    'hands',
    0x5e3c22,
  ),
  'ringmail-gloves': wear(
    'par de guantes de anillas',
    'pares de guantes de anillas',
    'un',
    'hands',
    0x7e848c,
  ),
  'bone-gloves': wear(
    'par de guantes de hueso',
    'pares de guantes de hueso',
    'un',
    'hands',
    0xe2dac4,
  ),
  'plate-gloves': wear(
    'par de guanteletes de placas',
    'pares de guanteletes de placas',
    'un',
    'hands',
    0xa8aeb6,
  ),
  'studded-leggings': cloth(
    'par de perneras tachonadas',
    'pares de perneras tachonadas',
    'un',
    'legs',
    0x5e3c22,
  ),
  'ringmail-leggings': wear(
    'par de perneras de anillas',
    'pares de perneras de anillas',
    'un',
    'legs',
    0x7e848c,
  ),
  'chain-leggings': wear(
    'par de perneras de malla',
    'pares de perneras de malla',
    'un',
    'legs',
    0x8e949c,
  ),
  flail: weapon('mangual', 'manguales', 'un'),
  'legion-shield': wear('escudo legionario', 'escudos legionarios', 'un', 'leftHand', 0x8e2a24),
  'templar-shield': wear('escudo templario', 'escudos templarios', 'un', 'leftHand', 0xe6e0d0),
  // Samurái: placas laqueadas en rojo, atadas con cordones.
  'samurai-kabuto': wear('yelmo samurái', 'yelmos samuráis', 'un', 'head', 0x9a2620),
  'samurai-mempo': wear('máscara samurái', 'máscaras samuráis', 'una', 'neck', 0x9a2620),
  'samurai-do': wear('coraza samurái', 'corazas samuráis', 'una', 'torso', 0x9a2620),
  'samurai-sode': wear(
    'par de hombreras samuráis',
    'pares de hombreras samuráis',
    'un',
    'arms',
    0x9a2620,
  ),
  'samurai-haidate': wear('faldar samurái', 'faldares samuráis', 'un', 'legs', 0x9a2620),
  'samurai-suneate': wear(
    'par de canilleras samuráis',
    'pares de canilleras samuráis',
    'un',
    'feet',
    0x9a2620,
  ),
  // Legionario: coraza de bandas, yelmo con penacho y faldón de tiras.
  'legion-helm': wear('yelmo legionario', 'yelmos legionarios', 'un', 'head', 0xb0b4ba),
  'legion-cuirass': wear('coraza legionaria', 'corazas legionarias', 'una', 'torso', 0xb0b4ba),
  'legion-arms': wear(
    'par de brazales legionarios',
    'pares de brazales legionarios',
    'un',
    'arms',
    0xb0b4ba,
  ),
  'legion-greaves': wear(
    'par de grebas legionarias',
    'pares de grebas legionarias',
    'un',
    'legs',
    0xb0b4ba,
  ),
  // Templario: malla bajo una sobreveste blanca con la cruz roja.
  'templar-helm': wear('yelmo templario', 'yelmos templarios', 'un', 'head', 0xa8aeb6),
  'templar-hauberk': wear('loriga templaria', 'lorigas templarias', 'una', 'torso', 0xe6e0d0),
  'templar-sleeves': wear(
    'par de mangas templarias',
    'pares de mangas templarias',
    'un',
    'arms',
    0x8e949c,
  ),
  'templar-gauntlets': wear(
    'par de manoplas templarias',
    'pares de manoplas templarias',
    'un',
    'hands',
    0x8e949c,
  ),
  'templar-chausses': wear(
    'par de calzas templarias',
    'pares de calzas templarias',
    'un',
    'legs',
    0x8e949c,
  ),
  dyes: { name: 'tintura', plural: 'tinturas', article: 'una', stackable: true },
  'dye-tub': {
    name: 'tina de tintura',
    plural: 'tinas de tintura',
    article: 'una',
    use: 'dye',
    // El agua: hasta que se le elige un color en el panel.
    color: 0x3c5aaa,
  },

  spellbook: {
    name: 'libro de hechizos',
    plural: 'libros de hechizos',
    article: 'un',
    use: 'spellbook',
  },
  book: { name: 'libro', plural: 'libros', article: 'un', use: 'book' },
  // Carta de una misión: se lee como un libro y se entrega a quien va dirigida.
  letter: { name: 'carta sellada', plural: 'cartas selladas', article: 'una', use: 'book' },
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

  torch: { ...wear('antorcha', 'antorchas', 'una', 'leftHand', 0x8a5a2e), light: 6 },
  lantern: { ...wear('farol', 'faroles', 'un', 'leftHand', 0x6a5a3a), light: 5 },
  lute: { name: 'laúd', plural: 'laúdes', article: 'un', use: 'music' },
  drum: { name: 'tambor', plural: 'tambores', article: 'un', use: 'music' },
  flute: { name: 'flauta', plural: 'flautas', article: 'una', use: 'music' },
  ruby: gem('rubí', 'rubíes', 'un'),
  sapphire: gem('zafiro', 'zafiros', 'un'),
  emerald: gem('esmeralda', 'esmeraldas', 'una'),
  amethyst: gem('amatista', 'amatistas', 'una'),
  diamond: gem('diamante', 'diamantes', 'un'),

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
  'stone-block': {
    name: 'bloque de piedra',
    plural: 'bloques de piedra',
    article: 'un',
    stackable: true,
  },
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

function cloth(
  name: string,
  plural: string,
  article: 'un' | 'una',
  slot: EquipmentSlot,
  color: number,
): Spec {
  return { ...wear(name, plural, article, slot, color), dyeable: true };
}
function food(name: string, plural: string, article: 'un' | 'una', amount: number): Spec {
  return { name, plural, article, stackable: true, use: 'eat', food: amount };
}
function gem(name: string, plural: string, article: 'un' | 'una'): Spec {
  return { name, plural, article, stackable: true };
}
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
function mastery(skill: string): Spec {
  return {
    name: `pergamino de maestría: ${skill}`,
    plural: `pergaminos de maestría: ${skill}`,
    article: 'un',
    use: 'mastery',
  };
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
