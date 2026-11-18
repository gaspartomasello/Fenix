import { STATIC_KINDS, type StaticKind } from '@fenix/shared/world/statics';

/**
 * Las piezas fijas del mundo (muebles, luces, árboles, paredes, ruinas…) para
 * la ventana de todos los objetos: no van en la mochila, pero así se ven
 * todas juntas. De las que vienen en varias versiones (la pared mirando para
 * un lado y para el otro, la puerta abierta, cada hoja de una puerta doble)
 * se muestra una sola.
 */
export const PIECE_GROUPS = [
  'Muebles',
  'Luces',
  'Carteles de tiendas',
  'Árboles',
  'Plantas y rocas',
  'Paredes, puertas y escaleras',
  'Ruinas, tumbas y mazmorras',
] as const;
export type PieceGroup = (typeof PIECE_GROUPS)[number];

const GROUP_OF: Readonly<Partial<Record<PieceGroup, readonly StaticKind[]>>> = {
  Muebles: [
    'throne',
    'table',
    'stool',
    'chair-s',
    'bench-x',
    'counter',
    'bed',
    'double-bed',
    'wardrobe',
    'chest',
    'bookshelf-x',
    'potion-shelf-x',
    'weapon-rack',
    'armor-stand',
    'carpet',
    'tapestry-x',
    'potted-plant',
    'statue',
    'keg',
    'barrel',
    'crate',
    'workbench',
    'alchemy-table',
    'cauldron',
    'forge',
    'small-forge',
    'great-forge',
    'anvil',
    'sawhorse',
    'plank-stack',
    'log-pile',
    'stump-axe',
    'hay-bale',
    'hay-pile',
    'water-trough',
    'hitching-post',
    'stall',
    'banner',
    'fountain',
    'well',
    'sign',
  ],
  Luces: [
    'lamp',
    'wall-lantern-x',
    'wall-torch-x',
    'candelabra',
    'candle-table',
    'hearth',
    'brazier',
    'campfire',
  ],
  Árboles: [
    'oak',
    'pine',
    'snow-pine',
    'birch',
    'maple',
    'poplar',
    'willow',
    'cypress',
    'ceibo',
    'gomero',
    'acacia',
    'baobab',
    'palm',
    'jungle-tree',
    'bamboo',
    'cactus',
    'dead-tree',
  ],
  'Plantas y rocas': [
    'bush',
    'flowers',
    'wildflowers',
    'tall-grass',
    'weeds',
    'fern',
    'reeds',
    'mushrooms',
    'peyote',
    'dry-shrub',
    'jungle-plant',
    'tundra-shrub',
    'pebbles',
    'rock',
    'mossy-rock',
    'boulder',
    'crag',
    'crag-spire',
    'crag-ledge',
    'stalagmite',
    'ice-crystal',
  ],
  'Ruinas, tumbas y mazmorras': [
    'shrine',
    'ankh',
    'menhir',
    'stone-ring',
    'stela',
    'totem',
    'colossal-head',
    'serpent-head',
    'column',
    'fallen-column',
    'rubble',
    'gravestone',
    'crypt',
    'sarcophagus',
    'bones',
    'skull-pile',
    'cobweb',
    'slime',
    'noxious-hole',
    'sewer-grate',
    'loose-flagstone',
    'cave-entrance',
  ],
};

/** Las que no se muestran: lo que es parte del mapa más que un objeto (la montaña, los barcos). */
const LEFT_OUT: ReadonlySet<StaticKind> = new Set<StaticKind>([
  'mountain',
  'ship',
  'pirate-ship',
  'stair-hole',
]);

/** ¿Es una versión repetida de otra pieza (la otra dirección, abierta, una hoja, el poste)? */
function isVariant(kind: StaticKind): boolean {
  if (kind.startsWith('shop-sign-')) return kind.endsWith('-y');
  return (
    /-open$|-[lr]$|-[lr]-open$|-(corner|post)$|^chair-[new]$/.test(kind) ||
    (/-y$/.test(kind) && (STATIC_KINDS as readonly string[]).includes(kind.replace(/-y$/, '-x')))
  );
}

/** En qué grupo va una pieza (o null si no se muestra). */
export function pieceGroup(kind: StaticKind): PieceGroup | null {
  if (LEFT_OUT.has(kind) || isVariant(kind)) return null;
  if (kind.startsWith('shop-sign-')) return 'Carteles de tiendas';
  for (const group of PIECE_GROUPS) if (GROUP_OF[group]?.includes(kind)) return group;
  return 'Paredes, puertas y escaleras';
}

/** Las piezas a mostrar, por grupo y en orden. */
export function worldPieces(): ReadonlyMap<PieceGroup, readonly StaticKind[]> {
  const byGroup = new Map<PieceGroup, StaticKind[]>(PIECE_GROUPS.map((g) => [g, []]));
  for (const group of PIECE_GROUPS) {
    const listed = GROUP_OF[group];
    if (listed) byGroup.set(group, [...listed]);
  }
  for (const kind of STATIC_KINDS) {
    const group = pieceGroup(kind);
    if (!group || GROUP_OF[group]) continue;
    byGroup.get(group)?.push(kind);
  }
  return byGroup;
}
