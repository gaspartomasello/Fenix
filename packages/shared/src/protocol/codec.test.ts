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

  it('rechaza mensajes demasiado grandes', () => {
    expect(decodeClientMessage(JSON.stringify({ type: 'chat', text: 'a'.repeat(2000) })).ok).toBe(
      false,
    );
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
