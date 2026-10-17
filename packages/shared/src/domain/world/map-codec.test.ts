import { describe, expect, it } from 'vitest';
import { decodeMap, encodeMap } from './map-codec';
import { Terrain } from './terrain';

describe('mapa compacto', () => {
  it('ida y vuelta: terreno y objetos fijos quedan iguales', () => {
    const data = {
      width: 5,
      height: 3,
      terrain: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 31, 27, 2, 1].map((t) => t as Terrain),
      statics: [
        { kind: 'oak' as const, x: 1, y: 2 },
        { kind: 'fallen-column' as const, x: 300, y: 1200 },
      ],
      regions: [{ name: 'Plaza', x: 0, y: 0, width: 2, height: 2 }],
      teleporters: [],
    };
    const decoded = decodeMap(encodeMap(data));
    expect(Array.from(decoded.terrain)).toEqual(data.terrain);
    expect(decoded.statics).toEqual(data.statics);
    expect(decoded.regions).toEqual(data.regions);
  });

  it('las alturas viajan con el mapa', () => {
    const data = {
      width: 2,
      height: 2,
      terrain: [0, 0, 0, 0].map((t) => t as Terrain),
      statics: [],
      regions: [],
      teleporters: [],
      heights: [0, 3, 7, 12],
    };
    expect(decodeMap(encodeMap(data)).heights).toEqual([0, 3, 7, 12]);
  });

  it('un mapa grande ocupa un byte por tile', () => {
    const big = {
      width: 1000,
      height: 1400,
      terrain: new Array<Terrain>(1000 * 1400).fill(Terrain.Grass),
      statics: [],
      regions: [],
      teleporters: [],
    };
    const encoded = encodeMap(big);
    expect(encoded.terrain.length).toBeLessThan(1000 * 1400 * 1.4);
  });
});
