import { describe, expect, it } from 'vitest';
import { STATIC_ART_HEIGHT, STATIC_ART_WIDTH, STATIC_GROUND, drawStatic } from './static-art';

const SPECIES = ['oak', 'pine', 'ceibo', 'gomero', 'willow', 'poplar', 'dead-tree'] as const;

/** Alto (en pixeles sobre el suelo) y ancho de lo dibujado. */
function extent(kind: (typeof SPECIES)[number], variant: number) {
  const image = drawStatic(kind, variant);
  let top = STATIC_ART_HEIGHT;
  let left = STATIC_ART_WIDTH;
  let right = 0;
  for (let y = 0; y < STATIC_ART_HEIGHT; y++) {
    for (let x = 0; x < STATIC_ART_WIDTH; x++) {
      // Solo lo opaco: la sombra del suelo es translúcida.
      if (image.alphaAt(x, y) < 200) continue;
      top = Math.min(top, y);
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  return { height: STATIC_GROUND.y - top, width: right - left, top, image };
}

describe('árboles', () => {
  it('cada especie entra en el lienzo y tiene su silueta', () => {
    const size = Object.fromEntries(SPECIES.map((kind) => [kind, extent(kind, 1)]));
    for (const kind of SPECIES) {
      expect(size[kind]?.top, kind).toBeGreaterThan(0);
      expect(size[kind]?.height, kind).toBeGreaterThan(50);
    }
    // El álamo es una columna: el más alto y angosto; el gomero, el más ancho.
    const poplar = size.poplar;
    const gomero = size.gomero;
    expect(poplar?.height).toBeGreaterThan(size.oak?.height ?? 0);
    expect(poplar?.width).toBeLessThan((size.oak?.width ?? 0) / 2);
    for (const kind of SPECIES)
      expect(gomero?.width ?? 0).toBeGreaterThanOrEqual(size[kind]?.width ?? 0);
  });

  it('el tronco se ve al pie del árbol', () => {
    for (const kind of SPECIES) {
      const { image } = extent(kind, 0);
      let solid = 0;
      for (let x = STATIC_GROUND.x - 6; x <= STATIC_GROUND.x + 6; x++)
        if (image.alphaAt(x, STATIC_GROUND.y - 8) === 255) solid++;
      expect(solid, kind).toBeGreaterThan(3);
    }
  });

  it('las variantes de una especie son distintas', () => {
    const a = drawStatic('oak', 0).data;
    const b = drawStatic('oak', 1).data;
    expect(a).not.toEqual(b);
  });
});
