import { describe, expect, it } from 'vitest';
import { encumbrance, itemWeight, maxWeight } from './weight';

describe('peso y carga', () => {
  it('se puede llevar 40 piedras más 3,5 por punto de Fuerza, como en UO', () => {
    expect(maxWeight(50)).toBe(215);
    expect(maxWeight(100)).toBe(390);
  });

  it('lo pesado pesa más: placas más que cuero, armas a dos manos más que una daga', () => {
    expect(itemWeight('plate-chest')).toBeGreaterThan(itemWeight('leather-armor'));
    expect(itemWeight('halberd')).toBeGreaterThan(itemWeight('dagger'));
    expect(itemWeight('gold')).toBeLessThan(0.1);
  });

  it('con sobrepeso no se corre y cada paso cansa; muy cargado no se mueve', () => {
    expect(encumbrance(100, 200)).toEqual({ canMove: true, canRun: true, stepStamina: 0 });
    const heavy = encumbrance(225, 200);
    expect(heavy.canRun).toBe(false);
    expect(heavy.canMove).toBe(true);
    expect(heavy.stepStamina).toBe(3);
    expect(encumbrance(260, 200).canMove).toBe(false);
  });
});
