import { describe, expect, it } from 'vitest';
import { Terrain } from './terrain';
import { TileMap } from './tile-map';

/** Una calle de 30 × 20 y, a la derecha, el primer piso de una casa que se ve en (5, 5). */
function town(): TileMap {
  return new TileMap({
    width: 40,
    height: 20,
    terrain: new Array<Terrain>(800).fill(Terrain.Grass),
    regions: [
      { name: 'Pueblo', x: 0, y: 0, width: 30, height: 20 },
      {
        name: 'Pueblo: una casa, primer piso',
        x: 32,
        y: 2,
        width: 6,
        height: 6,
        floor: 1,
        anchor: { x: -27, y: 3 },
      },
    ],
  });
}

describe('pisos altos a la vista', () => {
  it('un piso alto se ve encima de su edificio, a su altura; la calle, en el suelo', () => {
    const map = town();
    expect(map.displayOf({ x: 34, y: 4 })).toEqual({ x: 7, y: 7, level: 1 });
    expect(map.displayOf({ x: 7, y: 7 })).toEqual({ x: 7, y: 7, level: 0 });
    expect(map.rawOf({ x: 7, y: 7 }, 1)).toEqual({ x: 34, y: 4 });
    expect(map.rawOf({ x: 20, y: 7 }, 1)).toBeNull();
    expect(map.anchoredFloors()).toHaveLength(1);
  });
});
