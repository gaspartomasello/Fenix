import { describe, expect, it } from 'vitest';
import { Terrain } from '../world/terrain';
import { TileMap } from '../world/tile-map';
import { hasLineOfSight } from './line-of-sight';

/** Un patio de 10 × 10 con una pared en x = 5 (una puerta en y = 2 y una reja en y = 7). */
function yard(): TileMap {
  return new TileMap({
    width: 10,
    height: 10,
    terrain: new Array<Terrain>(100).fill(Terrain.Grass),
    statics: [
      ...[0, 1, 3, 4, 5, 6, 8, 9].map((y) => ({ kind: 'wall-y' as const, x: 5, y })),
      { kind: 'door-y', x: 5, y: 2 },
      { kind: 'iron-fence-y', x: 5, y: 7 },
      { kind: 'fence-x', x: 2, y: 8 },
      { kind: 'oak', x: 2, y: 5 },
    ],
    regions: [{ name: 'Torre: primer piso', x: 0, y: 9, width: 1, height: 1, floor: 1 }],
  });
}

describe('línea de visión', () => {
  it('la pared, la reja y la puerta cerrada tapan; abierta, se ve', () => {
    const map = yard();
    expect(hasLineOfSight(map, { x: 2, y: 4 }, { x: 8, y: 4 })).toBe(false);
    expect(hasLineOfSight(map, { x: 2, y: 7 }, { x: 8, y: 7 })).toBe(false);
    expect(hasLineOfSight(map, { x: 2, y: 2 }, { x: 8, y: 2 })).toBe(false);
    map.setDoorOpen({ x: 5, y: 2 }, true);
    expect(hasLineOfSight(map, { x: 2, y: 2 }, { x: 8, y: 2 })).toBe(true);
  });

  it('los árboles y las cercas bajas no tapan, y de un mismo lado se ve', () => {
    const map = yard();
    expect(hasLineOfSight(map, { x: 0, y: 5 }, { x: 4, y: 5 })).toBe(true);
    expect(hasLineOfSight(map, { x: 2, y: 9 }, { x: 2, y: 6 })).toBe(true);
    expect(hasLineOfSight(map, { x: 0, y: 0 }, { x: 4, y: 4 })).toBe(true);
  });

  it('no se ve entre pisos distintos', () => {
    const map = yard();
    expect(hasLineOfSight(map, { x: 0, y: 9 }, { x: 1, y: 9 })).toBe(false);
  });
});
