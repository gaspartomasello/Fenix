import { describe, expect, it } from 'vitest';
import { Terrain } from './terrain';
import { TileMap } from './tile-map';

const G = Terrain.Grass;

describe('TileMap', () => {
  const map = new TileMap({
    width: 3,
    height: 3,
    terrain: new Array<Terrain>(9).fill(G),
    statics: [
      { kind: 'oak', x: 1, y: 0 },
      { kind: 'flowers', x: 2, y: 2 },
    ],
    regions: [{ name: 'Plaza', x: 0, y: 1, width: 2, height: 2 }],
  });

  it('los objetos que bloquean impiden pasar, los demás no', () => {
    expect(map.isWalkable({ x: 1, y: 0 })).toBe(false);
    expect(map.isWalkable({ x: 2, y: 2 })).toBe(true);
    expect(map.isWalkable({ x: 0, y: 0 })).toBe(true);
  });

  it('encuentra la zona de una posición', () => {
    expect(map.regionAt({ x: 1, y: 2 })?.name).toBe('Plaza');
    expect(map.regionAt({ x: 2, y: 0 })).toBeUndefined();
  });
});
