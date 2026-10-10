import { ALL_DIRECTIONS, directionOffset } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { renderResolution, screenToTile, screenVectorToDirection, tileToScreen } from './iso';

describe('proyección isométrica', () => {
  it('ida y vuelta entre tile y pantalla', () => {
    const tile = { x: 12, y: 7 };
    expect(screenToTile(tileToScreen(tile))).toEqual(tile);
  });

  it('cada dirección apunta al mismo lado en pantalla que su paso', () => {
    for (const direction of ALL_DIRECTIONS) {
      const offset = directionOffset(direction);
      const screen = tileToScreen(offset);
      expect(screenVectorToDirection(screen.x, screen.y)).toBe(direction);
    }
  });
});

describe('renderResolution', () => {
  it('dibuja siempre a escala entera, la de arriba', () => {
    expect(renderResolution(1)).toBe(1);
    expect(renderResolution(1.25)).toBe(2);
    expect(renderResolution(1.5)).toBe(2);
    expect(renderResolution(2)).toBe(2);
    expect(renderResolution(2.625)).toBe(3);
    expect(renderResolution(undefined)).toBe(1);
  });
});
