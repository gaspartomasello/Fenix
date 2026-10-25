/**
 * Objetos fijos del mundo (árboles, rocas, paredes…), como los "statics"
 * de UO. Cada uno ocupa un tile; los que bloquean impiden pasar por él.
 */
import { Direction } from '../geometry/direction';
import type { Position } from '../geometry/position';

export const STATIC_KINDS = [
  'oak',
  'pine',
  'bush',
  'rock',
  'flowers',
  'wall-x',
  'wall-y',
  'wall-corner',
  'wall-post',
  'fence-x',
  'fence-y',
  'barrel',
  'crate',
  'well',
  'lamp',
  'sign',
  'shrine',
  'forge',
  'anvil',
  'cave-wall',
  'cave-entrance',
  'ladder',
  'brazier',
  'bones',
  'stalagmite',
  'ceibo',
  'gomero',
  'willow',
  'poplar',
  'dead-tree',
  'mountain',
  // Riscos y picos sueltos sobre la ladera de la montaña (cada uno con su forma)
  'crag',
  'crag-spire',
  'crag-ledge',
  'cactus',
  'tent',
  'campfire',
  'gravestone',
  'lighthouse',
  'rubble',
  'reeds',
  'snow-pine',
  'palm',
  'jungle-tree',
  'birch',
  'acacia',
  'tall-grass',
  'weeds',
  'fern',
  'mushrooms',
  'wildflowers',
  'peyote',
  'dry-shrub',
  'pebbles',
  'boulder',
  'mossy-rock',
  'jungle-plant',
  'tundra-shrub',
  'column',
  'fallen-column',
  'maple',
  'cypress',
  'baobab',
  'bamboo',
  // Ciudades: paredes de cada estilo, murallas y lo que hay en las calles
  'log-wall-x',
  'log-wall-y',
  'log-wall-corner',
  'log-wall-post',
  'plank-wall-x',
  'plank-wall-y',
  'plank-wall-corner',
  'plank-wall-post',
  'basalt-wall-x',
  'basalt-wall-y',
  'basalt-wall-corner',
  'basalt-wall-post',
  'rampart-x',
  'rampart-y',
  'rampart-corner',
  'rampart-post',
  'tower',
  'palisade-x',
  'palisade-y',
  'palisade-post',
  'iron-fence-x',
  'iron-fence-y',
  'crypt',
  'stall',
  'banner',
  'throne',
  'fountain',
  // Interiores y oficios
  'hay-bale',
  'hay-pile',
  'hitching-post',
  'water-trough',
  'stump-axe',
  'log-pile',
  'workbench',
  'alchemy-table',
  'bookshelf-x',
  'bookshelf-y',
  'potion-shelf-x',
  'potion-shelf-y',
  'cauldron',
  'table',
  'stool',
  'counter',
  'chest',
  'weapon-rack',
  'armor-stand',
  'bed',
  'hearth',
  'keg',
  'chair-n',
  'chair-e',
  'chair-s',
  'chair-w',
  'bench-x',
  'bench-y',
  'sawhorse',
  'plank-stack',
  'carpet',
  'candelabra',
  // Puertas (cerradas y abiertas) y ventanas de cada estilo de pared
  'door-x',
  'door-y',
  'door-x-open',
  'door-y-open',
  'iron-door-x',
  'iron-door-y',
  'iron-door-x-open',
  'iron-door-y-open',
  'dungeon-door-x',
  'dungeon-door-y',
  'dungeon-door-x-open',
  'dungeon-door-y-open',
  'bone-door-x',
  'bone-door-y',
  'bone-door-x-open',
  'bone-door-y-open',
  // Hojas de puertas dobles: la de menor coordenada (`-l`) y la otra (`-r`)
  'door-x-l',
  'door-x-l-open',
  'door-x-r',
  'door-x-r-open',
  'door-y-l',
  'door-y-l-open',
  'door-y-r',
  'door-y-r-open',
  'iron-door-x-l',
  'iron-door-x-l-open',
  'iron-door-x-r',
  'iron-door-x-r-open',
  'iron-door-y-l',
  'iron-door-y-l-open',
  'iron-door-y-r',
  'iron-door-y-r-open',
  'dungeon-door-x-l',
  'dungeon-door-x-l-open',
  'dungeon-door-x-r',
  'dungeon-door-x-r-open',
  'dungeon-door-y-l',
  'dungeon-door-y-l-open',
  'dungeon-door-y-r',
  'dungeon-door-y-r-open',
  'bone-door-x-l',
  'bone-door-x-l-open',
  'bone-door-x-r',
  'bone-door-x-r-open',
  'bone-door-y-l',
  'bone-door-y-l-open',
  'bone-door-y-r',
  'bone-door-y-r-open',
  'wall-window-x',
  'wall-window-y',
  'log-window-x',
  'log-window-y',
  'plank-window-x',
  'plank-window-y',
  'basalt-window-x',
  'basalt-window-y',
  // Bajo tierra: criptas y alcantarillas
  'sarcophagus',
  'sewer-grate',
  'cobweb',
  // Puertos: barcos amarrados (ocupan 3 × 3 tiles de agua)
  'ship',
  'pirate-ship',
  'pier-post',
  // Pisos altos: escaleras para subir y bajar
  'stairs-wood',
  'stairs-stone',
  'spiral-stairs',
  'ladder-up',
  'stair-hole',
  'trapdoor',
  // Azoteas: parapeto con almenas alrededor del techo plano
  'parapet-x',
  'parapet-y',
  'parapet-corner',
  'parapet-post',
  // Casas de arenisca (bloques claros con una moldura y ventanas en arco)
  'sandstone-wall-x',
  'sandstone-wall-y',
  'sandstone-wall-corner',
  'sandstone-wall-post',
  'sandstone-window-x',
  'sandstone-window-y',
  // Bajo la ciudad: alcantarillas, catacumbas y pasadizos secretos
  'sewer-wall',
  'slime',
  'noxious-hole',
  'skull-pile',
  'cracked-wall',
  'loose-flagstone',
] as const;

export type StaticKind = (typeof STATIC_KINDS)[number];

export interface StaticDefinition {
  readonly kind: StaticKind;
  readonly name: string;
  readonly blocking: boolean;
  /** Radio de luz que emite de noche, en tiles (0 = no ilumina). */
  readonly lightRadius: number;
  /**
   * Lado de la base en tiles (1 = un tile). Un objeto grande ocupa desde su
   * tile hacia +x y +y (el faro, 2 × 2).
   */
  readonly footprint: number;
}

const define = (
  kind: StaticKind,
  name: string,
  blocking: boolean,
  lightRadius = 0,
  footprint = 1,
): StaticDefinition => ({ kind, name, blocking, lightRadius, footprint });

/**
 * Lo que tapa la vista: paredes (y sus ventanas), puertas cerradas, rejas,
 * murallas, empalizadas, torres, montañas y peñascos. Detrás de eso no se
 * apunta ni llega un hechizo o una flecha. Los árboles, las cercas bajas y
 * los muebles no tapan.
 */
const SIGHT_BLOCKERS =
  /(^|-)wall(-|$)|window|rampart|palisade|iron-fence|door|^tower$|^crypt$|^mountain$|^crag|^boulder$|^lighthouse$/;

export function blocksSight(kind: StaticKind): boolean {
  return SIGHT_BLOCKERS.test(kind);
}

/**
 * Asientos: al quedarse quieto sobre uno, el personaje se sienta mirando
 * hacia donde mira el asiento (`any`: hacia donde venía mirando).
 */
export const SEATS: Readonly<Partial<Record<StaticKind, Direction | 'any'>>> = {
  'chair-n': Direction.North,
  'chair-e': Direction.East,
  'chair-s': Direction.South,
  'chair-w': Direction.West,
  'bench-x': Direction.South,
  'bench-y': Direction.East,
  stool: 'any',
  throne: Direction.SouthEast,
};

/**
 * Puertas, como en UO: en el mapa van cerradas (bloquean); con doble clic se
 * abren y se ve la puerta abierta. El estado lo lleva el mapa (`TileMap.setDoorOpen`).
 */
export const DOORS: Readonly<Partial<Record<StaticKind, StaticKind>>> = {
  'door-x': 'door-x-open',
  'door-y': 'door-y-open',
  'iron-door-x': 'iron-door-x-open',
  'iron-door-y': 'iron-door-y-open',
  'dungeon-door-x': 'dungeon-door-x-open',
  'dungeon-door-y': 'dungeon-door-y-open',
  'bone-door-x': 'bone-door-x-open',
  'bone-door-y': 'bone-door-y-open',
  'door-x-l': 'door-x-l-open',
  'door-x-r': 'door-x-r-open',
  'door-y-l': 'door-y-l-open',
  'door-y-r': 'door-y-r-open',
  'iron-door-x-l': 'iron-door-x-l-open',
  'iron-door-x-r': 'iron-door-x-r-open',
  'iron-door-y-l': 'iron-door-y-l-open',
  'iron-door-y-r': 'iron-door-y-r-open',
  'dungeon-door-x-l': 'dungeon-door-x-l-open',
  'dungeon-door-x-r': 'dungeon-door-x-r-open',
  'dungeon-door-y-l': 'dungeon-door-y-l-open',
  'dungeon-door-y-r': 'dungeon-door-y-r-open',
  'bone-door-x-l': 'bone-door-x-l-open',
  'bone-door-x-r': 'bone-door-x-r-open',
  'bone-door-y-l': 'bone-door-y-l-open',
  'bone-door-y-r': 'bone-door-y-r-open',
};

/**
 * La otra hoja de una puerta doble: la `-l` está en la menor coordenada
 * del eje de la puerta y la `-r` en el tile siguiente. Se abren y se cierran
 * juntas. `null` si es una puerta sola.
 */
export function doorPartner(kind: StaticKind, at: Position): Position | null {
  const leaf = /-(x|y)-(l|r)(-open)?$/.exec(kind);
  if (!leaf) return null;
  const step = leaf[2] === 'l' ? 1 : -1;
  return leaf[1] === 'x' ? { x: at.x + step, y: at.y } : { x: at.x, y: at.y + step };
}

/**
 * Muebles que guardan cosas, como en UO: con doble clic se abren y se ve lo
 * que tienen (un cofre, un barril, una biblioteca…). `look` es el dibujo de
 * la ventana.
 */
export type ContainerLook = 'chest' | 'barrel' | 'crate' | 'bookshelf' | 'shelf' | 'bag' | 'box';

export const STATIC_CONTAINERS: Readonly<
  Partial<Record<StaticKind, { readonly look: ContainerLook; readonly capacity: number }>>
> = {
  chest: { look: 'chest', capacity: 60 },
  barrel: { look: 'barrel', capacity: 30 },
  keg: { look: 'barrel', capacity: 30 },
  crate: { look: 'crate', capacity: 40 },
  'bookshelf-x': { look: 'bookshelf', capacity: 30 },
  'bookshelf-y': { look: 'bookshelf', capacity: 30 },
  'potion-shelf-x': { look: 'shelf', capacity: 30 },
  'potion-shelf-y': { look: 'shelf', capacity: 30 },
};

/** La clave de un mueble que guarda cosas (los recipientes portátiles usan el id del objeto). */
export function staticContainerId(at: Position): string {
  return `static:${at.x}:${at.y}`;
}

/** El tile de un mueble a partir de su clave, o null si es un objeto (una bolsa). */
export function staticContainerAt(containerId: string): Position | null {
  const match = /^static:(\d+):(\d+)$/.exec(containerId);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

/** A cuántos tiles hay que estar de un mueble para abrirlo. */
export const CONTAINER_RANGE = 2;

/** A cuántos tiles hay que estar de una puerta para abrirla o cerrarla. */
export const DOOR_RANGE = 1;

export const STATICS: Readonly<Record<StaticKind, StaticDefinition>> = {
  oak: define('oak', 'roble', true),
  pine: define('pine', 'pino', true),
  bush: define('bush', 'arbusto', false),
  rock: define('rock', 'roca', true),
  flowers: define('flowers', 'flores', false),
  'wall-x': define('wall-x', 'pared', true),
  'wall-y': define('wall-y', 'pared', true),
  'wall-corner': define('wall-corner', 'pared', true),
  'wall-post': define('wall-post', 'columna', true),
  'fence-x': define('fence-x', 'cerca', true),
  'fence-y': define('fence-y', 'cerca', true),
  barrel: define('barrel', 'barril', true),
  crate: define('crate', 'cajón', true),
  well: define('well', 'aljibe', true),
  lamp: define('lamp', 'farol', true, 5),
  sign: define('sign', 'cartel', false),
  shrine: define('shrine', 'santuario', true, 4),
  forge: define('forge', 'forja', true, 3),
  anvil: define('anvil', 'yunque', true),
  'cave-wall': define('cave-wall', 'pared de roca', true),
  'cave-entrance': define('cave-entrance', 'entrada a la cueva', false),
  ladder: define('ladder', 'escalera de salida', false),
  brazier: define('brazier', 'brasero', true, 6),
  bones: define('bones', 'huesos', false),
  stalagmite: define('stalagmite', 'estalagmita', true),
  ceibo: define('ceibo', 'ceibo', true),
  gomero: define('gomero', 'gomero', true),
  willow: define('willow', 'sauce llorón', true),
  poplar: define('poplar', 'álamo', true),
  'dead-tree': define('dead-tree', 'árbol seco', true),
  mountain: define('mountain', 'montaña', true),
  crag: define('crag', 'risco', true),
  'crag-spire': define('crag-spire', 'aguja de roca', true),
  'crag-ledge': define('crag-ledge', 'peñasco', true),
  cactus: define('cactus', 'cactus', true),
  tent: define('tent', 'carpa', true),
  campfire: define('campfire', 'fogata', true, 4),
  gravestone: define('gravestone', 'lápida', true),
  lighthouse: define('lighthouse', 'faro', true, 12, 2),
  rubble: define('rubble', 'escombros', false),
  reeds: define('reeds', 'juncos', false),
  'snow-pine': define('snow-pine', 'pino nevado', true),
  palm: define('palm', 'palmera', true),
  'jungle-tree': define('jungle-tree', 'árbol de la selva', true),
  birch: define('birch', 'abedul', true),
  acacia: define('acacia', 'acacia', true),
  'tall-grass': define('tall-grass', 'pastizal', false),
  weeds: define('weeds', 'yuyos', false),
  fern: define('fern', 'helecho', false),
  mushrooms: define('mushrooms', 'hongos', false),
  wildflowers: define('wildflowers', 'florcitas', false),
  peyote: define('peyote', 'peyote', false),
  'dry-shrub': define('dry-shrub', 'matorral seco', false),
  pebbles: define('pebbles', 'piedritas', false),
  boulder: define('boulder', 'peñasco', true),
  'mossy-rock': define('mossy-rock', 'piedra con musgo', true),
  'jungle-plant': define('jungle-plant', 'planta de hojas grandes', false),
  'tundra-shrub': define('tundra-shrub', 'mata de tundra', false),
  column: define('column', 'columna antigua', true),
  'fallen-column': define('fallen-column', 'columna caída', true),
  maple: define('maple', 'arce', true),
  cypress: define('cypress', 'ciprés', true),
  baobab: define('baobab', 'baobab', true),
  bamboo: define('bamboo', 'bambú', true),
  'log-wall-x': define('log-wall-x', 'pared de troncos', true),
  'log-wall-y': define('log-wall-y', 'pared de troncos', true),
  'log-wall-corner': define('log-wall-corner', 'pared de troncos', true),
  'log-wall-post': define('log-wall-post', 'poste', true),
  'plank-wall-x': define('plank-wall-x', 'pared de tablas', true),
  'plank-wall-y': define('plank-wall-y', 'pared de tablas', true),
  'plank-wall-corner': define('plank-wall-corner', 'pared de tablas', true),
  'plank-wall-post': define('plank-wall-post', 'poste', true),
  'basalt-wall-x': define('basalt-wall-x', 'pared de piedra negra', true),
  'basalt-wall-y': define('basalt-wall-y', 'pared de piedra negra', true),
  'basalt-wall-corner': define('basalt-wall-corner', 'pared de piedra negra', true),
  'basalt-wall-post': define('basalt-wall-post', 'columna', true),
  'rampart-x': define('rampart-x', 'muralla', true),
  'rampart-y': define('rampart-y', 'muralla', true),
  'rampart-corner': define('rampart-corner', 'muralla', true),
  'rampart-post': define('rampart-post', 'muralla', true),
  tower: define('tower', 'torre', true, 6, 2),
  'palisade-x': define('palisade-x', 'empalizada', true),
  'palisade-y': define('palisade-y', 'empalizada', true),
  'palisade-post': define('palisade-post', 'empalizada', true),
  'iron-fence-x': define('iron-fence-x', 'reja', true),
  'iron-fence-y': define('iron-fence-y', 'reja', true),
  crypt: define('crypt', 'cripta', true, 0, 2),
  stall: define('stall', 'puesto del mercado', true),
  banner: define('banner', 'estandarte', true),
  throne: define('throne', 'trono', false),
  fountain: define('fountain', 'fuente', true, 0, 2),
  'hay-bale': define('hay-bale', 'fardo de paja', true),
  'hay-pile': define('hay-pile', 'paja', false),
  'hitching-post': define('hitching-post', 'palenque', true),
  'water-trough': define('water-trough', 'bebedero', true),
  'stump-axe': define('stump-axe', 'tocón con un hacha', true),
  'log-pile': define('log-pile', 'pila de leños', true),
  workbench: define('workbench', 'banco de carpintero', true),
  'alchemy-table': define('alchemy-table', 'mesa de alquimia', true),
  'bookshelf-x': define('bookshelf-x', 'biblioteca', true),
  'bookshelf-y': define('bookshelf-y', 'biblioteca', true),
  'potion-shelf-x': define('potion-shelf-x', 'estante de frascos', true),
  'potion-shelf-y': define('potion-shelf-y', 'estante de frascos', true),
  cauldron: define('cauldron', 'caldero', true, 2),
  table: define('table', 'mesa', true),
  stool: define('stool', 'banqueta', false),
  counter: define('counter', 'mostrador', true),
  chest: define('chest', 'cofre', true),
  'weapon-rack': define('weapon-rack', 'armero', true),
  'armor-stand': define('armor-stand', 'maniquí con armadura', true),
  bed: define('bed', 'cama', true),
  hearth: define('hearth', 'hogar', true, 4),
  keg: define('keg', 'tonel', true),
  'chair-n': define('chair-n', 'silla', false),
  'chair-e': define('chair-e', 'silla', false),
  'chair-s': define('chair-s', 'silla', false),
  'chair-w': define('chair-w', 'silla', false),
  'bench-x': define('bench-x', 'banco', false),
  'bench-y': define('bench-y', 'banco', false),
  sawhorse: define('sawhorse', 'caballete con un serrucho', true),
  'plank-stack': define('plank-stack', 'pila de tablas', true),
  carpet: define('carpet', 'alfombra', false),
  candelabra: define('candelabra', 'candelabro', true, 4),
  sarcophagus: define('sarcophagus', 'sarcófago', true),
  'sewer-grate': define('sewer-grate', 'reja de la alcantarilla', false),
  'stairs-wood': define('stairs-wood', 'escalera de madera', false),
  'stairs-stone': define('stairs-stone', 'escalera de piedra', false),
  'spiral-stairs': define('spiral-stairs', 'escalera de caracol', false),
  'ladder-up': define('ladder-up', 'escalera de mano', false),
  'stair-hole': define('stair-hole', 'bajada al piso de abajo', false),
  trapdoor: define('trapdoor', 'trampilla', false),
  'parapet-x': define('parapet-x', 'almenas', true),
  'parapet-y': define('parapet-y', 'almenas', true),
  'parapet-corner': define('parapet-corner', 'almenas', true),
  'parapet-post': define('parapet-post', 'almenas', true),
  'sandstone-wall-x': define('sandstone-wall-x', 'pared de arenisca', true),
  'sandstone-wall-y': define('sandstone-wall-y', 'pared de arenisca', true),
  'sandstone-wall-corner': define('sandstone-wall-corner', 'pared de arenisca', true),
  'sandstone-wall-post': define('sandstone-wall-post', 'pared de arenisca', true),
  'sandstone-window-x': define('sandstone-window-x', 'ventana', true, 2),
  'sandstone-window-y': define('sandstone-window-y', 'ventana', true, 2),
  'sewer-wall': define('sewer-wall', 'muro de piedra', true),
  slime: define('slime', 'baba', false),
  'noxious-hole': define('noxious-hole', 'un agujero que despide gases', false),
  'skull-pile': define('skull-pile', 'montón de calaveras', true),
  // Un pasadizo secreto: parece pared, pero se pasa.
  'cracked-wall': define('cracked-wall', 'pared agrietada', false),
  'loose-flagstone': define('loose-flagstone', 'baldosa floja', false),
  cobweb: define('cobweb', 'telaraña', false),
  ship: define('ship', 'barco mercante', true, 4, 3),
  'pirate-ship': define('pirate-ship', 'barco pirata', true, 4, 3),
  'pier-post': define('pier-post', 'poste del muelle', true),
  'door-x': define('door-x', 'puerta', true),
  'door-y': define('door-y', 'puerta', true),
  'door-x-open': define('door-x-open', 'puerta abierta', false),
  'door-y-open': define('door-y-open', 'puerta abierta', false),
  'iron-door-x': define('iron-door-x', 'puerta de hierro', true),
  'iron-door-y': define('iron-door-y', 'puerta de hierro', true),
  'iron-door-x-open': define('iron-door-x-open', 'puerta de hierro abierta', false),
  'iron-door-y-open': define('iron-door-y-open', 'puerta de hierro abierta', false),
  'dungeon-door-x': define('dungeon-door-x', 'puerta de la mazmorra', true),
  'dungeon-door-y': define('dungeon-door-y', 'puerta de la mazmorra', true),
  'dungeon-door-x-open': define('dungeon-door-x-open', 'puerta de la mazmorra abierta', false),
  'dungeon-door-y-open': define('dungeon-door-y-open', 'puerta de la mazmorra abierta', false),
  'bone-door-x': define('bone-door-x', 'puerta de huesos', true),
  'bone-door-y': define('bone-door-y', 'puerta de huesos', true),
  'bone-door-x-open': define('bone-door-x-open', 'puerta de huesos abierta', false),
  'bone-door-y-open': define('bone-door-y-open', 'puerta de huesos abierta', false),
  'door-x-l': define('door-x-l', 'puerta', true),
  'door-x-l-open': define('door-x-l-open', 'puerta abierta', false),
  'door-x-r': define('door-x-r', 'puerta', true),
  'door-x-r-open': define('door-x-r-open', 'puerta abierta', false),
  'door-y-l': define('door-y-l', 'puerta', true),
  'door-y-l-open': define('door-y-l-open', 'puerta abierta', false),
  'door-y-r': define('door-y-r', 'puerta', true),
  'door-y-r-open': define('door-y-r-open', 'puerta abierta', false),
  'iron-door-x-l': define('iron-door-x-l', 'puerta de hierro', true),
  'iron-door-x-l-open': define('iron-door-x-l-open', 'puerta de hierro abierta', false),
  'iron-door-x-r': define('iron-door-x-r', 'puerta de hierro', true),
  'iron-door-x-r-open': define('iron-door-x-r-open', 'puerta de hierro abierta', false),
  'iron-door-y-l': define('iron-door-y-l', 'puerta de hierro', true),
  'iron-door-y-l-open': define('iron-door-y-l-open', 'puerta de hierro abierta', false),
  'iron-door-y-r': define('iron-door-y-r', 'puerta de hierro', true),
  'iron-door-y-r-open': define('iron-door-y-r-open', 'puerta de hierro abierta', false),
  'dungeon-door-x-l': define('dungeon-door-x-l', 'puerta de la mazmorra', true),
  'dungeon-door-x-l-open': define('dungeon-door-x-l-open', 'puerta de la mazmorra abierta', false),
  'dungeon-door-x-r': define('dungeon-door-x-r', 'puerta de la mazmorra', true),
  'dungeon-door-x-r-open': define('dungeon-door-x-r-open', 'puerta de la mazmorra abierta', false),
  'dungeon-door-y-l': define('dungeon-door-y-l', 'puerta de la mazmorra', true),
  'dungeon-door-y-l-open': define('dungeon-door-y-l-open', 'puerta de la mazmorra abierta', false),
  'dungeon-door-y-r': define('dungeon-door-y-r', 'puerta de la mazmorra', true),
  'dungeon-door-y-r-open': define('dungeon-door-y-r-open', 'puerta de la mazmorra abierta', false),
  'bone-door-x-l': define('bone-door-x-l', 'puerta de huesos', true),
  'bone-door-x-l-open': define('bone-door-x-l-open', 'puerta de huesos abierta', false),
  'bone-door-x-r': define('bone-door-x-r', 'puerta de huesos', true),
  'bone-door-x-r-open': define('bone-door-x-r-open', 'puerta de huesos abierta', false),
  'bone-door-y-l': define('bone-door-y-l', 'puerta de huesos', true),
  'bone-door-y-l-open': define('bone-door-y-l-open', 'puerta de huesos abierta', false),
  'bone-door-y-r': define('bone-door-y-r', 'puerta de huesos', true),
  'bone-door-y-r-open': define('bone-door-y-r-open', 'puerta de huesos abierta', false),
  'wall-window-x': define('wall-window-x', 'ventana', true, 2),
  'wall-window-y': define('wall-window-y', 'ventana', true, 2),
  'log-window-x': define('log-window-x', 'ventana', true, 2),
  'log-window-y': define('log-window-y', 'ventana', true, 2),
  'plank-window-x': define('plank-window-x', 'ventana', true, 2),
  'plank-window-y': define('plank-window-y', 'ventana', true, 2),
  'basalt-window-x': define('basalt-window-x', 'ventana', true, 2),
  'basalt-window-y': define('basalt-window-y', 'ventana', true, 2),
};

/**
 * Adornos bajos del suelo (pasto alto, flores, yuyos, piedritas): no tapan el
 * paso y se puede construir encima (quedan debajo del piso de la casa).
 */
export const GROUND_DECOR: ReadonlySet<StaticKind> = new Set<StaticKind>([
  'flowers',
  'bush',
  'tall-grass',
  'weeds',
  'fern',
  'mushrooms',
  'wildflowers',
  'peyote',
  'dry-shrub',
  'pebbles',
  'jungle-plant',
  'tundra-shrub',
  'reeds',
  'rubble',
  'hay-pile',
  'bones',
]);

export function isStaticKind(value: unknown): value is StaticKind {
  return typeof value === 'string' && (STATIC_KINDS as readonly string[]).includes(value);
}

export interface StaticPlacement {
  readonly kind: StaticKind;
  readonly x: number;
  readonly y: number;
}
