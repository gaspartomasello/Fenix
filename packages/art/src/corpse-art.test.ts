import { describe, expect, it } from 'vitest';
import { CREATURE_KINDS, Direction } from '@fenix/shared';
import { corpseLayout, drawCreatureCorpse, leavesCorpse } from './corpse-art';
import { drawCreatureFrame } from './creature-art';

const DIRECTIONS = [
  Direction.North,
  Direction.NorthEast,
  Direction.East,
  Direction.SouthEast,
  Direction.South,
  Direction.SouthWest,
  Direction.West,
  Direction.NorthWest,
];

describe('cuerpos muertos', () => {
  it('toda criatura de carne o hueso deja cuerpo; los espíritus no', () => {
    for (const kind of CREATURE_KINDS) {
      const spirit = ['energy-vortex', 'air-elemental', 'fire-elemental', 'water-elemental'];
      expect(leavesCorpse(kind), kind).toBe(!spirit.includes(kind));
    }
  });

  it('el cuerpo entra entero en su lienzo, mire hacia donde mire', () => {
    for (const kind of CREATURE_KINDS.filter(leavesCorpse)) {
      for (const direction of DIRECTIONS) {
        const image = drawCreatureCorpse(kind, direction);
        const layout = corpseLayout(kind);
        expect(image.width).toBe(layout.width);
        let painted = 0;
        let onEdge = 0;
        for (let y = 0; y < image.height; y++)
          for (let x = 0; x < image.width; x++) {
            if (image.alphaAt(x, y) === 0) continue;
            painted++;
            if (x === 0 || y === 0 || x === image.width - 1 || y === image.height - 1) onEdge++;
          }
        expect(painted, `${kind} ${direction}`).toBeGreaterThan(80);
        expect(onEdge, `${kind} ${direction}`).toBe(0);
      }
    }
  });

  it('queda tirado: mucho más bajo que de pie', () => {
    const standing = drawCreatureFrame('orc', Direction.South, 'idle');
    const lying = drawCreatureCorpse('orc', Direction.South);
    const rows = (image: typeof lying): number => {
      let top = image.height;
      let bottom = 0;
      for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++)
          if (image.alphaAt(x, y) > 0) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
      return bottom - top;
    };
    expect(rows(lying)).toBeLessThan(rows(standing) / 2);
  });
});
