import { Terrain } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { generateIslandMap } from './procedural-map';
import { buildWorld } from './world-builder';

describe('generateIslandMap', () => {
  const options = { width: 64, height: 64, seed: 42 };

  it('es determinístico para un mismo seed', () => {
    expect(generateIslandMap(options).map.toData()).toEqual(
      generateIslandMap(options).map.toData(),
    );
  });

  it('sin pueblo deja una plaza transitable en el centro', () => {
    const { map, spawnPoint } = generateIslandMap(options);
    expect(map.terrainAt(spawnPoint)).toBe(Terrain.Stone);
    expect(map.isWalkable(spawnPoint)).toBe(true);
  });

  it('rodea la isla de agua y no pone vegetación en el agua', () => {
    const { map } = generateIslandMap(options);
    for (let i = 0; i < 64; i++) {
      expect(map.terrainAt({ x: i, y: 0 })).toBe(Terrain.Water);
      expect(map.terrainAt({ x: 0, y: i })).toBe(Terrain.Water);
    }
    expect(map.statics.length).toBeGreaterThan(0);
    for (const placed of map.statics) expect(map.terrainAt(placed)).not.toBe(Terrain.Water);
  });
});

describe('buildWorld (con el pueblo de Tiled)', () => {
  const { map, spawnPoint } = buildWorld({ size: 128, seed: 1997 });

  it('aparece en el pueblo, en un tile transitable', () => {
    expect(map.isWalkable(spawnPoint)).toBe(true);
    expect(map.regionAt(spawnPoint)?.name).toBe('Puerto Ceniza');
  });

  it('desde la aparición se puede salir caminando del pueblo', () => {
    // Búsqueda en anchura: debe alcanzarse un tile fuera de la zona del pueblo.
    const region = map.regionAt(spawnPoint);
    const seen = new Set<string>([`${spawnPoint.x},${spawnPoint.y}`]);
    const queue = [spawnPoint];
    let escaped = false;
    while (queue.length > 0 && !escaped) {
      const current = queue.shift();
      if (!current) break;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const next = { x: current.x + dx, y: current.y + dy };
        const key = `${next.x},${next.y}`;
        if (seen.has(key) || !map.isWalkable(next)) continue;
        seen.add(key);
        if (map.regionAt(next) !== region) escaped = true;
        queue.push(next);
      }
    }
    expect(escaped).toBe(true);
  });
});
