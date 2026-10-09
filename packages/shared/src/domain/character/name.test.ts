import { describe, expect, it } from 'vitest';
import { validateCharacterName } from './name';
import { sanitizeChatText } from '../rules/chat';

describe('validateCharacterName', () => {
  it('normaliza espacios', () => {
    expect(validateCharacterName('  Lord   British ')).toEqual({ ok: true, name: 'Lord British' });
  });

  it('rechaza nombres cortos, largos o con símbolos', () => {
    expect(validateCharacterName('A').ok).toBe(false);
    expect(validateCharacterName('A'.repeat(17)).ok).toBe(false);
    expect(validateCharacterName('<script>').ok).toBe(false);
    expect(validateCharacterName('Ana123').ok).toBe(false);
  });
});

describe('sanitizeChatText', () => {
  it('quita caracteres de control y recorta', () => {
    expect(sanitizeChatText('  hola\u0000 mundo  ')).toBe('hola mundo');
    expect(sanitizeChatText('   ')).toBeNull();
    expect(sanitizeChatText('x'.repeat(500))).toHaveLength(120);
  });
});
