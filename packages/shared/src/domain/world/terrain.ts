/** Tipos de terreno base. El valor numérico es el que viaja por la red. */
export const Terrain = {
  Grass: 0,
  Dirt: 1,
  Sand: 2,
  Stone: 3,
  Water: 4,
  Wood: 5,
  Cave: 6,
  Rock: 7,
  Snow: 8,
  Swamp: 9,
  Tundra: 10,
  Jungle: 11,
  DryGrass: 12,
  Meadow: 13,
  Clay: 14,
  Ice: 15,
  Terracotta: 16,
  MarbleLight: 17,
  MarbleDark: 18,
  Flagstone: 19,
  OldRoad: 20,
  Corrupted: 21,
  Mud: 22,
  Ruins: 23,
  StoneTiles: 24,
  Granite: 25,
  Sandstone: 26,
  ShallowWater: 27,
  Salt: 28,
  Lava: 29,
  Ash: 30,
  Gravel: 31,
  SnowyGrass: 32,
  SandyGrass: 33,
  Leaves: 34,
  SparseGrass: 35,
} as const;

export type Terrain = (typeof Terrain)[keyof typeof Terrain];

export interface TerrainDefinition {
  readonly id: Terrain;
  /** Identificador estable usado en los archivos de mapa. */
  readonly key: string;
  readonly name: string;
  readonly walkable: boolean;
  /**
   * Prioridad al mezclar bordes: el terreno de mayor prioridad se "derrama"
   * sobre el vecino de menor prioridad (el pasto sobre la arena, la arena
   * sobre el agua). Negativa = bordes nítidos, sin mezcla (empedrado, pisos).
   */
  readonly blendPriority: number;
}

export const TERRAINS: Readonly<Record<Terrain, TerrainDefinition>> = {
  [Terrain.Grass]: {
    id: Terrain.Grass,
    key: 'grass',
    name: 'pasto',
    walkable: true,
    blendPriority: 3,
  },
  [Terrain.Dirt]: {
    id: Terrain.Dirt,
    key: 'dirt',
    name: 'tierra',
    walkable: true,
    blendPriority: 2,
  },
  [Terrain.Sand]: {
    id: Terrain.Sand,
    key: 'sand',
    name: 'arena',
    walkable: true,
    blendPriority: 1,
  },
  [Terrain.Stone]: {
    id: Terrain.Stone,
    key: 'stone',
    name: 'empedrado',
    walkable: true,
    blendPriority: -1,
  },
  [Terrain.Water]: {
    id: Terrain.Water,
    key: 'water',
    name: 'agua',
    walkable: false,
    blendPriority: 0,
  },
  [Terrain.Wood]: {
    id: Terrain.Wood,
    key: 'wood',
    name: 'piso de madera',
    walkable: true,
    blendPriority: -1,
  },
  [Terrain.Cave]: {
    id: Terrain.Cave,
    key: 'cave',
    name: 'suelo de cueva',
    walkable: true,
    blendPriority: -1,
  },
  [Terrain.Rock]: {
    id: Terrain.Rock,
    key: 'rock',
    name: 'roca maciza',
    walkable: false,
    blendPriority: -1,
  },
  [Terrain.Snow]: {
    id: Terrain.Snow,
    key: 'snow',
    name: 'nieve',
    walkable: true,
    blendPriority: 4,
  },
  [Terrain.Swamp]: {
    id: Terrain.Swamp,
    key: 'swamp',
    name: 'pantano',
    walkable: true,
    blendPriority: 0.5,
  },
  [Terrain.Tundra]: {
    id: Terrain.Tundra,
    key: 'tundra',
    name: 'tundra',
    walkable: true,
    blendPriority: 3.6,
  },
  [Terrain.Jungle]: {
    id: Terrain.Jungle,
    key: 'jungle',
    name: 'suelo de selva',
    walkable: true,
    blendPriority: 3.3,
  },
  [Terrain.DryGrass]: {
    id: Terrain.DryGrass,
    key: 'dry-grass',
    name: 'pasto seco',
    walkable: true,
    blendPriority: 2.6,
  },
  [Terrain.Meadow]: {
    id: Terrain.Meadow,
    key: 'meadow',
    name: 'prado',
    walkable: true,
    blendPriority: 3.1,
  },
  [Terrain.Clay]: {
    id: Terrain.Clay,
    key: 'clay',
    name: 'tierra roja agrietada',
    walkable: true,
    blendPriority: 1.5,
  },
  [Terrain.Ice]: {
    id: Terrain.Ice,
    key: 'ice',
    name: 'hielo',
    walkable: true,
    blendPriority: 0.2,
  },
  [Terrain.Terracotta]: {
    id: Terrain.Terracotta,
    key: 'terracotta',
    name: 'baldosas',
    walkable: true,
    blendPriority: -1,
  },
  [Terrain.MarbleLight]: {
    id: Terrain.MarbleLight,
    key: 'marble-light',
    name: 'mármol claro',
    walkable: true,
    blendPriority: -1,
  },
  [Terrain.MarbleDark]: {
    id: Terrain.MarbleDark,
    key: 'marble-dark',
    name: 'mármol oscuro',
    walkable: true,
    blendPriority: -1,
  },
  [Terrain.Flagstone]: {
    id: Terrain.Flagstone,
    key: 'flagstone',
    name: 'lajas',
    walkable: true,
    blendPriority: -1,
  },
  [Terrain.OldRoad]: {
    id: Terrain.OldRoad,
    key: 'old-road',
    name: 'camino antiguo',
    walkable: true,
    blendPriority: -1,
  },
  [Terrain.Corrupted]: {
    id: Terrain.Corrupted,
    key: 'corrupted',
    name: 'tierra corrupta',
    walkable: true,
    blendPriority: 4.5,
  },
  [Terrain.Mud]: {
    id: Terrain.Mud,
    key: 'mud',
    name: 'barro',
    walkable: true,
    blendPriority: 0.8,
  },
  [Terrain.Ruins]: {
    id: Terrain.Ruins,
    key: 'ruins',
    name: 'losas en ruinas',
    walkable: true,
    blendPriority: -1,
  },
  [Terrain.StoneTiles]: {
    id: Terrain.StoneTiles,
    key: 'stone-tiles',
    name: 'baldosas de piedra',
    walkable: true,
    blendPriority: -1,
  },
  [Terrain.Granite]: {
    id: Terrain.Granite,
    key: 'granite',
    name: 'baldosas de granito',
    walkable: true,
    blendPriority: -1,
  },
  [Terrain.Sandstone]: {
    id: Terrain.Sandstone,
    key: 'sandstone',
    name: 'baldosas de arenisca',
    walkable: true,
    blendPriority: -1,
  },
  [Terrain.ShallowWater]: {
    id: Terrain.ShallowWater,
    key: 'shallow-water',
    name: 'agua poco profunda',
    // Se cruza a pie o a caballo (el agua profunda, no).
    walkable: true,
    blendPriority: 0.1,
  },
  [Terrain.Salt]: {
    id: Terrain.Salt,
    key: 'salt',
    name: 'salina',
    walkable: true,
    blendPriority: 1.2,
  },
  [Terrain.Lava]: {
    id: Terrain.Lava,
    key: 'lava',
    name: 'lava',
    walkable: false,
    blendPriority: 0.05,
  },
  [Terrain.Ash]: {
    id: Terrain.Ash,
    key: 'ash',
    name: 'ceniza',
    walkable: true,
    blendPriority: 1.8,
  },
  [Terrain.Gravel]: {
    id: Terrain.Gravel,
    key: 'gravel',
    name: 'grava',
    walkable: true,
    blendPriority: 1.9,
  },
  // Transiciones como las del Age of Empires: entre dos suelos hay uno mezclado.
  [Terrain.SnowyGrass]: {
    id: Terrain.SnowyGrass,
    key: 'snowy-grass',
    name: 'pasto nevado',
    walkable: true,
    blendPriority: 3.8,
  },
  [Terrain.SandyGrass]: {
    id: Terrain.SandyGrass,
    key: 'sandy-grass',
    name: 'pasto con arena',
    walkable: true,
    blendPriority: 1.5,
  },
  [Terrain.Leaves]: {
    id: Terrain.Leaves,
    key: 'leaves',
    name: 'hojarasca',
    walkable: true,
    blendPriority: 3.1,
  },
  [Terrain.SparseGrass]: {
    id: Terrain.SparseGrass,
    key: 'sparse-grass',
    name: 'pasto ralo',
    walkable: true,
    blendPriority: 2.5,
  },
};

/** Agua (de mar o de río, profunda o de orilla): se pesca; la de orilla se cruza caminando. */
export function isWater(terrain: Terrain | undefined): boolean {
  return terrain === Terrain.Water || terrain === Terrain.ShallowWater;
}

export const ALL_TERRAINS: readonly Terrain[] = Object.values(Terrain);

export function isTerrain(value: unknown): value is Terrain {
  return typeof value === 'number' && value in TERRAINS;
}

export function terrainByKey(key: string): Terrain | undefined {
  return ALL_TERRAINS.find((t) => TERRAINS[t].key === key);
}
