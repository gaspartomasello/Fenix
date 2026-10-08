import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '../domain/character/appearance';
import { decodeClientMessage, decodeServerMessage, encodeMessage } from './codec';

describe('decodeClientMessage', () => {
  it('acepta mensajes bien formados', () => {
    const raw = encodeMessage({ type: 'move', direction: 3, mode: 'run', seq: 7 });
    expect(decodeClientMessage(raw)).toEqual({
      ok: true,
      message: { type: 'move', direction: 3, mode: 'run', seq: 7 },
    });
  });

  it('descarta campos extra', () => {
    const raw = JSON.stringify({ type: 'chat', text: 'hola', admin: true });
    expect(decodeClientMessage(raw)).toEqual({ ok: true, message: { type: 'chat', text: 'hola' } });
  });

  it('rechaza mensajes inválidos', () => {
    expect(decodeClientMessage('no json').ok).toBe(false);
    expect(decodeClientMessage('[]').ok).toBe(false);
    expect(decodeClientMessage(JSON.stringify({ type: 'move', direction: 9 })).ok).toBe(false);
    expect(
      decodeClientMessage(
        JSON.stringify({
          type: 'join',
          name: 'Ana',
          appearance: { ...DEFAULT_APPEARANCE, clothHue: 1 },
        }),
      ).ok,
    ).toBe(false);
    expect(decodeClientMessage(JSON.stringify({ type: 'teleport' })).ok).toBe(false);
  });

  it('acepta el ingreso con contraseña', () => {
    const join = { type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE, password: 'secreta' };
    expect(decodeClientMessage(JSON.stringify(join))).toEqual({ ok: true, message: join });
    expect(decodeClientMessage(JSON.stringify({ ...join, password: 5 })).ok).toBe(false);
  });

  it('rechaza mensajes demasiado grandes', () => {
    expect(decodeClientMessage(JSON.stringify({ type: 'chat', text: 'a'.repeat(2000) })).ok).toBe(
      false,
    );
  });
});

describe('mensajes de objetos', () => {
  it('acepta mover a suelo, mochila o equipo', () => {
    for (const to of [
      { type: 'ground', position: { x: 3, y: 4 } },
      { type: 'backpack' },
      { type: 'backpack', position: { x: 10, y: 20 } },
      { type: 'equipment', slot: 'head' },
    ]) {
      expect(decodeClientMessage(JSON.stringify({ type: 'moveItem', itemId: 'i1', to })).ok).toBe(
        true,
      );
    }
  });

  it('acepta pedidos de comercio, recolección y fabricación', () => {
    const ok = (m: unknown): boolean => decodeClientMessage(JSON.stringify(m)).ok;
    expect(ok({ type: 'buy', vendorId: 'n1', kind: 'apple', amount: 3 })).toBe(true);
    expect(ok({ type: 'buy', vendorId: 'n1', kind: 'apple', amount: 0 })).toBe(false);
    expect(ok({ type: 'buy', vendorId: 'n1', kind: 'dragon', amount: 1 })).toBe(false);
    expect(ok({ type: 'sell', vendorId: 'n1', itemId: 'i1' })).toBe(true);
    expect(ok({ type: 'gather', toolId: 't', position: { x: 1, y: 2 } })).toBe(true);
    expect(ok({ type: 'craft', recipe: 'dagger' })).toBe(true);
    expect(ok({ type: 'moveItem', itemId: 'i1', to: { type: 'bank' } })).toBe(true);
  });

  it('acepta chat por canal y comandos sociales', () => {
    const ok = (m: unknown): boolean => decodeClientMessage(JSON.stringify(m)).ok;
    expect(ok({ type: 'chat', text: 'hola', channel: 'party' })).toBe(true);
    expect(ok({ type: 'chat', text: 'hola', channel: 'world' })).toBe(false);
    expect(ok({ type: 'social', command: 'party-invite', name: 'Ana' })).toBe(true);
    expect(
      ok({ type: 'social', command: 'guild-create', name: 'Orden del Fénix', tag: 'FNX' }),
    ).toBe(true);
    expect(ok({ type: 'social', command: 'party-kick' })).toBe(false);
  });

  it('acepta pedidos de ataque', () => {
    expect(decodeClientMessage(JSON.stringify({ type: 'attack', targetId: 'c1' })).ok).toBe(true);
    expect(decodeClientMessage(JSON.stringify({ type: 'attack' })).ok).toBe(false);
    expect(decodeClientMessage(JSON.stringify({ type: 'stopAttack' })).ok).toBe(true);
  });

  it('rechaza destinos inválidos', () => {
    for (const to of [
      { type: 'ground' },
      { type: 'ground', position: { x: 1.5, y: 0 } },
      { type: 'equipment', slot: 'tail' },
      { type: 'bank', position: { x: 'a', y: 0 } },
      null,
    ]) {
      expect(decodeClientMessage(JSON.stringify({ type: 'moveItem', itemId: 'i1', to })).ok).toBe(
        false,
      );
    }
    expect(decodeClientMessage(JSON.stringify({ type: 'useItem', itemId: '' })).ok).toBe(false);
  });
});

describe('decodeServerMessage', () => {
  it('reconoce tipos conocidos y rechaza el resto', () => {
    expect(
      decodeServerMessage(JSON.stringify({ type: 'moveAck', seq: 1, position: { x: 0, y: 0 } })).ok,
    ).toBe(true);
    expect(decodeServerMessage(JSON.stringify({ type: 'hack' })).ok).toBe(false);
  });
});
