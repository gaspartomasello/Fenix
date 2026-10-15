import { describe, expect, it } from 'vitest';
import {
  HOTBAR_SIZE,
  addToHotbar,
  countInBackpack,
  defaultHotbar,
  findInBackpack,
  hotbarKey,
  parseHotbar,
  slotLabel,
} from './hotbar';

const at = { x: 0, y: 0 };

describe('barra de atajos', () => {
  it('empieza con vendas, pociones y hechizos, y lo guardado se lee sin romperse', () => {
    const slots = defaultHotbar();
    expect(slots).toHaveLength(HOTBAR_SIZE);
    expect(slotLabel(slots[0] ?? null)).toBe('Vendas');
    expect(parseHotbar(null)).toEqual(slots);
    expect(parseHotbar('no es json')).toEqual(slots);
    const saved = parseHotbar(
      JSON.stringify([{ type: 'spell', spell: 'heal' }, { type: 'item', kind: 'inventado' }, 7]),
    );
    expect(saved[0]).toEqual({ type: 'spell', spell: 'heal' });
    expect(saved[1]).toBeNull();
    expect(saved).toHaveLength(HOTBAR_SIZE);
  });

  it('un objeto se busca por tipo en la mochila y se cuentan todas sus pilas', () => {
    const backpack = [
      { id: 'a', kind: 'bandage' as const, amount: 5, position: at },
      { id: 'b', kind: 'apple' as const, amount: 1, position: at },
      { id: 'c', kind: 'bandage' as const, amount: 3, position: at },
    ];
    expect(findInBackpack(backpack, 'bandage')?.id).toBe('a');
    expect(countInBackpack(backpack, 'bandage')).toBe(8);
    expect(findInBackpack(backpack, 'healing-potion')).toBeUndefined();
  });

  it('agregar va al primer casillero libre y no repite', () => {
    const empty = Array(HOTBAR_SIZE).fill(null);
    const one = addToHotbar(empty, { type: 'spell', spell: 'heal' });
    expect(one[0]).toEqual({ type: 'spell', spell: 'heal' });
    expect(addToHotbar(one, { type: 'spell', spell: 'heal' })).toEqual(one);
    expect(addToHotbar(one, { type: 'item', kind: 'bandage' })[1]).toEqual({
      type: 'item',
      kind: 'bandage',
    });
    expect(hotbarKey(0)).toBe('1');
    expect(hotbarKey(9)).toBe('0');
  });
});
