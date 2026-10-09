import { describe, expect, it } from 'vitest';
import { Direction } from '../geometry/direction';
import { Terrain } from '../world/terrain';
import { TileMap } from '../world/tile-map';
import { canStep } from './movement';

const G = Terrain.Grass;
const W = Terrain.Water;

// 3x3:  G G G
//       W G G
//       G W G
const map = new TileMap({ width: 3, height: 3, terrain: [G, G, G, W, G, G, G, W, G] });

describe('canStep', () => {
  it('permite pasar a terreno transitable', () => {
    expect(canStep(map, { x: 1, y: 1 }, Direction.North)).toBe(true);
  });

  it('bloquea el agua y los bordes del mapa', () => {
    expect(canStep(map, { x: 1, y: 1 }, Direction.West)).toBe(false);
    expect(canStep(map, { x: 0, y: 0 }, Direction.North)).toBe(false);
  });

  it('no permite cortar esquinas entre dos tiles bloqueados', () => {
    // De (1,1) a (0,2): los laterales (0,1) y (1,2) son agua.
    expect(canStep(map, { x: 1, y: 1 }, Direction.SouthWest)).toBe(false);
    // De (1,1) a (2,2): el lateral (2,1) es transitable.
    expect(canStep(map, { x: 1, y: 1 }, Direction.SouthEast)).toBe(true);
  });
});
