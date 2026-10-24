import { describe, expect, it } from 'vitest';
import {
  comboOf,
  defaultOptions,
  infoChips,
  parseOptions,
  removeHotkey,
  setHotkey,
  type KeyPress,
} from './options';

const press = (code: string, extra: Partial<KeyPress> = {}): KeyPress => ({
  code,
  key: code.replace(/^Key|^Digit/, '').toLowerCase(),
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...extra,
});

describe('opciones', () => {
  it('nombra las combinaciones como en un asistente de UO', () => {
    expect(comboOf(press('F1'))).toBe('F1');
    expect(comboOf(press('KeyQ', { shiftKey: true }))).toBe('Shift+Q');
    expect(comboOf(press('Digit3', { ctrlKey: true, altKey: true }))).toBe('Ctrl+Alt+3');
    expect(comboOf(press('Numpad7'))).toBe('Num 7');
  });

  it('no deja pisar caminar ni Escape sin modificador, ni un modificador solo', () => {
    expect(comboOf(press('KeyW'))).toBeNull();
    expect(comboOf(press('ArrowLeft'))).toBeNull();
    expect(comboOf(press('Escape'))).toBeNull();
    expect(comboOf({ ...press('ShiftLeft'), key: 'Shift', shiftKey: true })).toBeNull();
    expect(comboOf(press('KeyW', { ctrlKey: true }))).toBe('Ctrl+W');
  });

  it('una combinación tiene un solo atajo', () => {
    const one = setHotkey([], { combo: 'F1', action: { type: 'spell', spell: 'heal' } });
    const two = setHotkey(one, { combo: 'F1', action: { type: 'command', command: 'war-mode' } });
    expect(two).toEqual([{ combo: 'F1', action: { type: 'command', command: 'war-mode' } }]);
    expect(removeHotkey(two, 'F1')).toEqual([]);
  });

  it('lo guardado roto o desconocido vuelve a lo de siempre, sin perder lo válido', () => {
    expect(parseOptions(null)).toEqual(defaultOptions());
    expect(parseOptions('{no es json')).toEqual(defaultOptions());
    const parsed = parseOptions(
      JSON.stringify({
        info: ['gold', 'inventado', 'gold', 'mana'],
        names: false,
        hotkeys: [
          { combo: 'F9', action: { type: 'spell', spell: 'explosion' } },
          { combo: 'F10', action: { type: 'spell', spell: 'no-existe' } },
          { combo: 'F11', action: { type: 'command', command: 'borrar-todo' } },
        ],
      }),
    );
    expect(parsed.info).toEqual(['gold', 'mana']);
    expect(parsed.names).toBe(false);
    expect(parsed.numbers).toBe(true);
    expect(parsed.hotkeys).toEqual([
      { combo: 'F9', action: { type: 'spell', spell: 'explosion' } },
    ]);
  });

  it('la barra muestra cada reactivo con su cantidad y marca lo que se acaba', () => {
    const chips = infoChips(['reagents', 'gold', 'weight'], {
      backpack: [
        { id: '1', kind: 'garlic', amount: 40 },
        { id: '2', kind: 'garlic', amount: 2 },
        { id: '3', kind: 'gold', amount: 1500 },
      ] as never,
      vitals: null,
      weight: 30,
      maxWeight: 200,
    });
    const garlic = chips.find((c) => c.key === 'reagent:garlic');
    expect(garlic?.value).toBe('42');
    expect(garlic?.low).toBe(false);
    expect(chips.find((c) => c.key === 'reagent:ginseng')?.low).toBe(true);
    expect(chips.filter((c) => c.key.startsWith('reagent:'))).toHaveLength(8);
    expect(chips.find((c) => c.key === 'weight')?.value).toBe('30/200');
  });

  it('cuenta lo de adentro de las bolsas cuando el servidor manda los totales', () => {
    const chips = infoChips(['reagents'], {
      backpack: [],
      carried: { 'black-pearl': 150 },
      vitals: null,
      weight: 0,
      maxWeight: null,
    });
    expect(chips.find((c) => c.key === 'reagent:black-pearl')?.value).toBe('150');
  });
});
