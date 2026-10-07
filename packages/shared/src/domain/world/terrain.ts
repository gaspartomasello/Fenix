/** Tipos de terreno base. El valor numérico es el que viaja por la red. */
export const Terrain = {
  Grass: 0,
  Dirt: 1,
  Sand: 2,
  Stone: 3,
  Water: 4,
  Wood: 5,
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
};

export const ALL_TERRAINS: readonly Terrain[] = Object.values(Terrain);

export function isTerrain(value: unknown): value is Terrain {
  return typeof value === 'number' && value in TERRAINS;
}

export function terrainByKey(key: string): Terrain | undefined {
  return ALL_TERRAINS.find((t) => TERRAINS[t].key === key);
}
