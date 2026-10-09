import { DEFAULT_APPEARANCE, Terrain, TileMap } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { World } from './world';

const map = new TileMap({ width: 10, height: 10, terrain: new Array(100).fill(Terrain.Grass) });

describe('World', () => {
  it('aparece jugadores cerca del punto de aparición', () => {
    const world = new World(map, { x: 5, y: 5 });
    const player = world.spawn({ id: 'a', name: 'Ana', appearance: DEFAULT_APPEARANCE }, () => 0.5);
    expect(Math.abs(player.position.x - 5)).toBeLessThanOrEqual(3);
    expect(world.get('a')).toBe(player);
  });

  it('detecta nombres repetidos sin importar mayúsculas', () => {
    const world = new World(map, { x: 5, y: 5 });
    world.spawn({ id: 'a', name: 'Ana', appearance: DEFAULT_APPEARANCE }, Math.random);
    expect(world.isNameTaken('ANA')).toBe(true);
    world.remove('a');
    expect(world.isNameTaken('ana')).toBe(false);
  });

  it('exige un punto de aparición transitable', () => {
    const water = new TileMap({ width: 1, height: 1, terrain: [Terrain.Water] });
    expect(() => new World(water, { x: 0, y: 0 })).toThrow();
  });
});
