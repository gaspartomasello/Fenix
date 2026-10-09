import { describe, expect, it } from 'vitest';
import { ITEMS, ITEM_KINDS, describeItem } from './item-catalog';
import { clampToBackpack } from './item-rules';

describe('catálogo de objetos', () => {
  it('describe cantidades en español', () => {
    expect(describeItem('apple')).toBe('una manzana');
    expect(describeItem('axe')).toBe('un hacha');
    expect(describeItem('boots')).toBe('un par de botas');
    expect(describeItem('iron-helmet')).toBe('un yelmo de hierro');
    expect(describeItem('apple', 3)).toBe('3 manzanas');
    expect(describeItem('gold', 50)).toBe('50 monedas de oro');
  });

  it('todo lo equipable tiene un lugar en el cuerpo', () => {
    for (const kind of ITEM_KINDS) {
      const definition = ITEMS[kind];
      expect(definition.use === 'equip').toBe(definition.slot !== undefined);
    }
  });

  it('mantiene los íconos dentro de la mochila', () => {
    expect(clampToBackpack({ x: -10, y: 500 })).toEqual({ x: 0, y: 116 });
  });
});
