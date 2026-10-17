/**
 * Objetos fijos del mundo (árboles, rocas, paredes…), como los "statics"
 * de UO. Cada uno ocupa un tile; los que bloquean impiden pasar por él.
 */
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
] as const;

export type StaticKind = (typeof STATIC_KINDS)[number];

export interface StaticDefinition {
  readonly kind: StaticKind;
  readonly name: string;
  readonly blocking: boolean;
  /** Radio de luz que emite de noche, en tiles (0 = no ilumina). */
  readonly lightRadius: number;
}

const define = (
  kind: StaticKind,
  name: string,
  blocking: boolean,
  lightRadius = 0,
): StaticDefinition => ({ kind, name, blocking, lightRadius });

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
  cactus: define('cactus', 'cactus', true),
  tent: define('tent', 'carpa', true),
  campfire: define('campfire', 'fogata', true, 4),
  gravestone: define('gravestone', 'lápida', true),
  lighthouse: define('lighthouse', 'faro', true, 9),
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
};

export function isStaticKind(value: unknown): value is StaticKind {
  return typeof value === 'string' && (STATIC_KINDS as readonly string[]).includes(value);
}

export interface StaticPlacement {
  readonly kind: StaticKind;
  readonly x: number;
  readonly y: number;
}
