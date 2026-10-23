import { describe, expect, it } from 'vitest';
import { Direction } from '../geometry/direction';
import { Terrain } from '../world/terrain';
import { TileMap } from '../world/tile-map';
import { canStep, slideDirection } from './movement';

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

describe('slideDirection (resbalar contra una pared, como en UO)', () => {
  // 3x3:  W G G
  //       G G G
  //       G G W
  const room = new TileMap({ width: 3, height: 3, terrain: [W, G, G, G, G, G, G, G, W] });

  it('en diagonal de la grilla, contra un obstáculo resbala por el lado libre', () => {
    // Al noroeste de (1,1) hay agua: sigue al norte o al oeste.
    expect(slideDirection(room, { x: 1, y: 1 }, Direction.NorthWest)).toBe(Direction.West);
    expect(slideDirection(room, { x: 1, y: 1 }, Direction.NorthWest, Direction.North)).toBe(
      Direction.North,
    );
  });

  it('si el camino está libre, va derecho', () => {
    expect(slideDirection(room, { x: 1, y: 1 }, Direction.NorthEast)).toBe(Direction.NorthEast);
  });

  it('de frente contra algo se frena', () => {
    // Desde (0,1), al norte está el agua: no hay hacia dónde resbalar.
    expect(slideDirection(room, { x: 0, y: 1 }, Direction.North)).toBeNull();
  });

  it('en un rincón (los dos lados cerrados) también se frena', () => {
    // Desde (2,1) hacia el sureste: se sale del mapa por un lado y abajo hay agua.
    expect(slideDirection(room, { x: 2, y: 1 }, Direction.SouthEast)).toBeNull();
  });
});
