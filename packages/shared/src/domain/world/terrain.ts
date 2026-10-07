/** Tipos de terreno base. El valor numérico es el que viaja por la red. */
export const Terrain = {
  Grass: 0,
  Dirt: 1,
  Sand: 2,
  Stone: 3,
  Water: 4,
} as const;

export type Terrain = (typeof Terrain)[keyof typeof Terrain];

export interface TerrainDefinition {
  readonly id: Terrain;
  readonly name: string;
  readonly walkable: boolean;
}

export const TERRAINS: Readonly<Record<Terrain, TerrainDefinition>> = {
  [Terrain.Grass]: { id: Terrain.Grass, name: 'pasto', walkable: true },
  [Terrain.Dirt]: { id: Terrain.Dirt, name: 'tierra', walkable: true },
  [Terrain.Sand]: { id: Terrain.Sand, name: 'arena', walkable: true },
  [Terrain.Stone]: { id: Terrain.Stone, name: 'empedrado', walkable: true },
  [Terrain.Water]: { id: Terrain.Water, name: 'agua', walkable: false },
};

export function isTerrain(value: unknown): value is Terrain {
  return typeof value === 'number' && value in TERRAINS;
}
