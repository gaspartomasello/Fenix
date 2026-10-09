import { describe, expect, it } from 'vitest';
import { parseChatInput } from './chat-commands';

describe('comandos del chat', () => {
  it('el texto común se dice en voz alta', () => {
    expect(parseChatInput('  hola  ')).toEqual({ kind: 'chat', channel: 'say', text: 'hola' });
  });

  it('habla al grupo o al gremio', () => {
    expect(parseChatInput('/g vamos al bosque')).toEqual({
      kind: 'chat',
      channel: 'party',
      text: 'vamos al bosque',
    });
    expect(parseChatInput('/GR reunión')).toEqual({
      kind: 'chat',
      channel: 'guild',
      text: 'reunión',
    });
    expect(parseChatInput('/g').kind).toBe('error');
  });

  it('traduce comandos de grupo y gremio', () => {
    expect(parseChatInput('/invitar Bruno')).toEqual({
      kind: 'social',
      command: 'party-invite',
      name: 'Bruno',
    });
    expect(parseChatInput('/fundar FNX Orden del Fénix')).toEqual({
      kind: 'social',
      command: 'guild-create',
      tag: 'FNX',
      name: 'Orden del Fénix',
    });
    expect(parseChatInput('/aceptar')).toEqual({ kind: 'answer', accept: true });
    expect(parseChatInput('/fundar FNX').kind).toBe('error');
    expect(parseChatInput('/volar')).toEqual({
      kind: 'error',
      text: 'No conozco el comando /volar. Escribí /ayuda.',
    });
  });

  it('/hora pide una hora válida', () => {
    expect(parseChatInput('/hora 22')).toEqual({ kind: 'hour', hour: 22 });
    expect(parseChatInput('/hora 6,5')).toEqual({ kind: 'hour', hour: 6.5 });
    expect(parseChatInput('/hora 30').kind).toBe('error');
    expect(parseChatInput('/hora').kind).toBe('error');
  });
});
