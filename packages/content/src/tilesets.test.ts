import { ALL_TERRAINS, STATIC_KINDS, TERRAINS } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { TILED, type TiledTileset } from './tiled-format';
import { TILESETS } from './index';

const valuesOf = (tileset: TiledTileset, property: string): unknown[] =>
  tileset.tiles.map((tile) => tile.properties?.find((p) => p.name === property)?.value);

describe('tilesets exportados', () => {
  // Si falla: se agregó un terreno u objeto y hay que correr `npm run tilesets -w @fenix/content`.
  it('el tileset de terreno coincide con los terrenos del juego', () => {
    const tileset = TILESETS['terreno.json'] as TiledTileset;
    expect(valuesOf(tileset, TILED.terrainProperty)).toEqual(
      ALL_TERRAINS.map((t) => TERRAINS[t].key),
    );
  });

  it('el tileset de objetos coincide con los objetos del juego', () => {
    const tileset = TILESETS['objetos.json'] as TiledTileset;
    expect(valuesOf(tileset, TILED.staticProperty)).toEqual([...STATIC_KINDS]);
  });
});
