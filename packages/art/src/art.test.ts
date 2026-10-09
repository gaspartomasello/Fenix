import { ALL_DIRECTIONS, DEFAULT_APPEARANCE, STATIC_KINDS, Terrain } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { CHARACTER_ART_HEIGHT, CHARACTER_ART_WIDTH, drawCharacterFrame } from './character-art';
import { STATIC_ART_HEIGHT, STATIC_ART_WIDTH, drawStatic } from './static-art';
import { TERRAIN_ART_SIZE, drawTerrainTile } from './terrain-art';

const opaquePixels = (data: Uint8ClampedArray): number =>
  data.filter((_, i) => i % 4 === 3 && (data[i] ?? 0) > 0).length;

describe('arte procedural (sin DOM)', () => {
  it('dibuja los 8 sentidos del personaje', () => {
    for (const direction of ALL_DIRECTIONS) {
      const image = drawCharacterFrame(DEFAULT_APPEARANCE, direction, 'idle');
      expect([image.width, image.height]).toEqual([CHARACTER_ART_WIDTH, CHARACTER_ART_HEIGHT]);
      expect(opaquePixels(image.data)).toBeGreaterThan(100);
    }
  });

  it('dibuja todos los objetos fijos', () => {
    for (const kind of STATIC_KINDS) {
      const image = drawStatic(kind, 0);
      expect([image.width, image.height]).toEqual([STATIC_ART_WIDTH, STATIC_ART_HEIGHT]);
      expect(opaquePixels(image.data)).toBeGreaterThan(10);
    }
  });

  it('es determinístico', () => {
    expect(drawStatic('oak', 1).data).toEqual(drawStatic('oak', 1).data);
    expect(drawTerrainTile(Terrain.Grass, 2).data).toEqual(drawTerrainTile(Terrain.Grass, 2).data);
  });

  it('mezcla el borde con un vecino de mayor prioridad', () => {
    const plain = drawTerrainTile(Terrain.Sand, 0);
    const blended = drawTerrainTile(Terrain.Sand, 0, { north: Terrain.Grass });
    expect(blended.width).toBe(TERRAIN_ART_SIZE);
    expect(blended.data).not.toEqual(plain.data);
    // El empedrado no se mezcla.
    expect(drawTerrainTile(Terrain.Stone, 0, { north: Terrain.Grass }).data).toEqual(
      drawTerrainTile(Terrain.Stone, 0).data,
    );
  });
});
