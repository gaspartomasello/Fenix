import { describe, expect, it } from 'vitest';
import { ALL_DIRECTIONS, Direction, directionBetween, isDirection, step } from './direction';

describe('direction', () => {
  it('avanza un tile en la dirección indicada', () => {
    expect(step({ x: 5, y: 5 }, Direction.North)).toEqual({ x: 5, y: 4 });
    expect(step({ x: 5, y: 5 }, Direction.SouthEast)).toEqual({ x: 6, y: 6 });
    expect(step({ x: 5, y: 5 }, Direction.West)).toEqual({ x: 4, y: 5 });
  });

  it('directionBetween es la inversa de step', () => {
    for (const direction of ALL_DIRECTIONS) {
      const from = { x: 10, y: 10 };
      expect(directionBetween(from, step(from, direction))).toBe(direction);
    }
    expect(directionBetween({ x: 1, y: 1 }, { x: 1, y: 1 })).toBeNull();
  });

  it('valida valores fuera de rango', () => {
    expect(isDirection(7)).toBe(true);
    expect(isDirection(8)).toBe(false);
    expect(isDirection(1.5)).toBe(false);
    expect(isDirection('1')).toBe(false);
  });
});
