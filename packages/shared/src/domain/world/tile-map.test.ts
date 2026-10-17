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

  it('una puerta cerrada bloquea; abierta, se pasa', () => {
    const doorMap = new TileMap({
      width: 3,
      height: 1,
      terrain: [G, G, G],
      statics: [{ kind: 'door-y', x: 1, y: 0 }],
    });
    const door = { x: 1, y: 0 };
    expect(doorMap.doorAt(door)).toBe('door-y');
    expect(doorMap.isWalkable(door)).toBe(false);
    expect(doorMap.setDoorOpen(door, true)).toBe(true);
    expect(doorMap.isWalkable(door)).toBe(true);
    expect(doorMap.openDoorPositions()).toEqual([door]);
    expect(doorMap.setDoorOpen(door, true)).toBe(false);
    doorMap.setDoorOpen(door, false);
    expect(doorMap.isWalkable(door)).toBe(false);
    // Donde no hay puerta no pasa nada.
    expect(doorMap.setDoorOpen({ x: 0, y: 0 }, true)).toBe(false);
  });

  it('encuentra la zona de una posición', () => {
    expect(map.regionAt({ x: 1, y: 2 })?.name).toBe('Plaza');
    expect(map.regionAt({ x: 2, y: 0 })).toBeUndefined();
  });

  it('un objeto grande (el faro) ocupa toda su base de 2 × 2', () => {
    const coast = new TileMap({
      width: 4,
      height: 4,
      terrain: new Array<Terrain>(16).fill(G),
      statics: [{ kind: 'lighthouse', x: 1, y: 1 }],
    });
    for (const p of [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ])
      expect(coast.isWalkable(p)).toBe(false);
    expect(coast.isWalkable({ x: 3, y: 3 })).toBe(true);
  });

  it('el agua poco profunda se camina; la profunda, no', () => {
    const shore = new TileMap({
      width: 2,
      height: 1,
      terrain: [Terrain.ShallowWater, Terrain.Water],
    });
    expect(shore.isWalkable({ x: 0, y: 0 })).toBe(true);
    expect(shore.isWalkable({ x: 1, y: 0 })).toBe(false);
  });

  it('la altura de cada tile (plano si no tiene)', () => {
    const hills = new TileMap({ width: 2, height: 1, terrain: [G, G], heights: [0, 3] });
    expect(hills.heightAt({ x: 1, y: 0 })).toBe(3);
    expect(hills.heightAt({ x: 9, y: 0 })).toBe(3);
    expect(map.heightAt({ x: 1, y: 1 })).toBe(0);
  });
});
