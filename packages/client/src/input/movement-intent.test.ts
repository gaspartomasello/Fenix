import { Direction } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { keysToIntent, pointerToIntent, RUN_DISTANCE_PX } from './movement-intent';

describe('keysToIntent', () => {
  it('mapea las flechas a direcciones de pantalla isométrica', () => {
    expect(keysToIntent(new Set(['ArrowUp']), false)?.direction).toBe(Direction.NorthWest);
    expect(keysToIntent(new Set(['ArrowRight']), false)?.direction).toBe(Direction.NorthEast);
    expect(keysToIntent(new Set(['ArrowDown']), false)?.direction).toBe(Direction.SouthEast);
    expect(keysToIntent(new Set(['ArrowLeft']), false)?.direction).toBe(Direction.SouthWest);
    expect(keysToIntent(new Set(['ArrowUp', 'ArrowRight']), false)?.direction).toBe(
      Direction.North,
    );
    expect(keysToIntent(new Set(['KeyS', 'KeyA']), false)?.direction).toBe(Direction.South);
  });

  it('corre con Shift y no hace nada sin teclas o con teclas opuestas', () => {
    expect(keysToIntent(new Set(['ArrowUp']), true)?.mode).toBe('run');
    expect(keysToIntent(new Set(), false)).toBeNull();
    expect(keysToIntent(new Set(['ArrowUp', 'ArrowDown']), false)).toBeNull();
  });
});

describe('pointerToIntent', () => {
  it('camina cerca del personaje y corre lejos', () => {
    expect(pointerToIntent(50, 0)).toEqual({ direction: Direction.NorthEast, mode: 'walk' });
    expect(pointerToIntent(0, RUN_DISTANCE_PX + 1)).toEqual({
      direction: Direction.SouthEast,
      mode: 'run',
    });
  });

  it('ignora el cursor encima del personaje', () => {
    expect(pointerToIntent(2, 3)).toBeNull();
  });
});
