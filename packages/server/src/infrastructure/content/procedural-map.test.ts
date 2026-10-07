import { Terrain } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { generateIslandMap } from './procedural-map';

describe('generateIslandMap', () => {
  const options = { width: 64, height: 64, seed: 42 };

  it('es determinístico para un mismo seed', () => {
    expect(generateIslandMap(options).map.toData()).toEqual(
      generateIslandMap(options).map.toData(),
    );
  });

  it('deja el punto de aparición en el pueblo y transitable', () => {
    const { map, spawnPoint } = generateIslandMap(options);
    expect(map.terrainAt(spawnPoint)).toBe(Terrain.Stone);
    expect(map.isWalkable(spawnPoint)).toBe(true);
  });

  it('rodea la isla de agua', () => {
    const { map } = generateIslandMap(options);
    for (let i = 0; i < 64; i++) {
      expect(map.terrainAt({ x: i, y: 0 })).toBe(Terrain.Water);
      expect(map.terrainAt({ x: 0, y: i })).toBe(Terrain.Water);
    }
  });
});
