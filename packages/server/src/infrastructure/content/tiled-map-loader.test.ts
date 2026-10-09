import { TILESETS, TOWN_MAP } from '@fenix/content';
import { Terrain } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { loadTiledMap, MapFormatError } from './tiled-map-loader';

/** Mapa mínimo de 2×1 en formato Tiled. */
function tinyMap(terrain: number[], objects: number[] = [0, 0]): unknown {
  return {
    type: 'map',
    orientation: 'isometric',
    width: 2,
    height: 1,
    tilewidth: 44,
    tileheight: 44,
    tilesets: [
      { firstgid: 1, source: '../tilesets/terreno.json' },
      { firstgid: 7, source: '../tilesets/objetos.json' },
    ],
    layers: [
      { type: 'tilelayer', name: 'terreno', width: 2, height: 1, data: terrain },
      { type: 'tilelayer', name: 'objetos', width: 2, height: 1, data: objects },
      {
        type: 'objectgroup',
        name: 'zonas',
        objects: [
          { id: 1, name: 'aparicion', point: true, x: 66, y: 22, width: 0, height: 0 },
          { id: 2, name: 'Muelle', type: 'region', x: 0, y: 0, width: 88, height: 44 },
        ],
      },
      {
        type: 'objectgroup',
        name: 'objetos-sueltos',
        objects: [
          {
            id: 3,
            name: 'gold',
            point: true,
            x: 22,
            y: 22,
            width: 0,
            height: 0,
            properties: [{ name: 'cantidad', type: 'int', value: 25 }],
          },
        ],
      },
    ],
  };
}

describe('loadTiledMap', () => {
  it('traduce terreno, objetos, zonas y aparición', () => {
    const region = loadTiledMap('test', tinyMap([1, 0], [0, 7]), TILESETS);
    expect(region.terrain).toEqual([Terrain.Grass, null]);
    expect(region.statics).toEqual([{ kind: 'oak', x: 1, y: 0 }]);
    expect(region.spawn).toEqual({ x: 1, y: 0 });
    expect(region.regions).toEqual([{ name: 'Muelle', x: 0, y: 0, width: 2, height: 1 }]);
    expect(region.items).toEqual([{ kind: 'gold', amount: 25, position: { x: 0, y: 0 } }]);
  });

  it('explica qué está mal en un mapa inválido', () => {
    expect(() =>
      loadTiledMap('test', { type: 'map', orientation: 'orthogonal' }, TILESETS),
    ).toThrow(MapFormatError);
    expect(() => loadTiledMap('test', tinyMap([7, 0]), TILESETS)).toThrow(/no es terreno/);
  });

  it('carga el pueblo incluido en el juego', () => {
    const town = loadTiledMap('puerto-ceniza', TOWN_MAP, TILESETS);
    expect(town.spawn).not.toBeNull();
    expect(town.statics.length).toBeGreaterThan(50);
    expect(town.regions.map((r) => r.name)).toContain('Puerto Ceniza');
    expect(town.items.length).toBeGreaterThan(5);
  });
});
