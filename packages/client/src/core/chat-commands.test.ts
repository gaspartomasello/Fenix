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

  it('/esconderse y /mirar usan esas habilidades', () => {
    expect(parseChatInput('/esconderse')).toEqual({ kind: 'useSkill', skill: 'hiding' });
    expect(parseChatInput('/mirar')).toEqual({ kind: 'useSkill', skill: 'detect-hidden' });
  });

  it('/hora pide una hora válida', () => {
    expect(parseChatInput('/hora 22')).toEqual({ kind: 'hour', hour: 22 });
    expect(parseChatInput('/hora 6,5')).toEqual({ kind: 'hour', hour: 6.5 });
    expect(parseChatInput('/hora 30').kind).toBe('error');
    expect(parseChatInput('/hora').kind).toBe('error');
  });

  it('/ir va a un lugar; solo, pide la lista', () => {
    expect(parseChatInput('/ir Roca Alta')).toEqual({ kind: 'goto', place: 'Roca Alta' });
    expect(parseChatInput('/ir')).toEqual({ kind: 'goto', place: '' });
  });

  it('/desconectar pide salir del juego', () => {
    expect(parseChatInput('/desconectar')).toEqual({ kind: 'logout' });
  });

  it('/invul activa o desactiva la invulnerabilidad', () => {
    expect(parseChatInput('/invul')).toEqual({ kind: 'invulnerable' });
  });

  it('entiende los comandos del administrador del juego', () => {
    expect(parseChatInput('/crear lobo gris 3')).toEqual({
      kind: 'gm',
      command: { kind: 'summon', creature: 'lobo gris', amount: 3, tame: false },
    });
    expect(parseChatInput('/invocar dragón')).toEqual({
      kind: 'gm',
      command: { kind: 'summon', creature: 'dragón', amount: 1, tame: true },
    });
    expect(parseChatInput('/objeto oro 1000')).toEqual({
      kind: 'gm',
      command: { kind: 'item', item: 'oro', amount: 1000 },
    });
    expect(parseChatInput('/objetos')).toEqual({ kind: 'gm', command: { kind: 'catalog' } });
    expect(parseChatInput('/eliminar')).toEqual({ kind: 'gmDelete' });
    expect(parseChatInput('/rastrear')).toEqual({ kind: 'tracking' });
    expect(parseChatInput('/matar')).toEqual({ kind: 'gmTarget', action: 'slay' });
    expect(parseChatInput('/curar Ana')).toEqual({
      kind: 'gm',
      command: { kind: 'heal', name: 'Ana' },
    });
    expect(parseChatInput('/limpiar')).toEqual({
      kind: 'gm',
      command: { kind: 'clear', radius: 12 },
    });
  });
});
