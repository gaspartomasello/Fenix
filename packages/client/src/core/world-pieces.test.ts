import { STATIC_KINDS } from '@fenix/shared/world/statics';
import { describe, expect, it } from 'vitest';
import { pieceGroup, worldPieces } from './world-pieces';

describe('piezas del mundo en la ventana de todos los objetos', () => {
  const all = [...worldPieces().values()].flat();

  it('cada pieza listada existe y aparece una sola vez', () => {
    expect(new Set(all).size).toBe(all.length);
    for (const kind of all) expect(STATIC_KINDS).toContain(kind);
  });

  it('los muebles van con los muebles y los árboles con los árboles', () => {
    expect(pieceGroup('bed')).toBe('Muebles');
    expect(pieceGroup('throne')).toBe('Muebles');
    expect(pieceGroup('candelabra')).toBe('Luces');
    expect(pieceGroup('oak')).toBe('Árboles');
    expect(pieceGroup('door-x')).toBe('Paredes, puertas y escaleras');
    expect(pieceGroup('shop-sign-coins-x')).toBe('Carteles de tiendas');
  });

  it('de las versiones repetidas se muestra una sola', () => {
    for (const kind of ['wall-y', 'door-x-open', 'door-x-l', 'wall-corner', 'chair-n'] as const)
      expect(pieceGroup(kind)).toBeNull();
    expect(all).not.toContain('mountain');
  });
});
