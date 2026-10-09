import { describe, expect, it } from 'vitest';
import { validateGuild } from './groups';
import { notorietyOf, reputationTitle } from './reputation';

describe('reputación y gremios', () => {
  it('calcula la reputación', () => {
    expect(notorietyOf(0, 0, 100)).toBe('innocent');
    expect(notorietyOf(0, 200, 100)).toBe('criminal');
    expect(notorietyOf(5, 0, 100)).toBe('murderer');
  });

  it('da títulos por fama y karma', () => {
    expect(reputationTitle(0, 0)).toBe('Aventurero');
    expect(reputationTitle(3500, 2500)).toBe('Noble Célebre');
    expect(reputationTitle(0, -3000)).toBe('Vil');
  });

  it('valida nombre y siglas de gremio', () => {
    expect(validateGuild('  Orden   del Fénix ', 'fnx')).toEqual({
      ok: true,
      name: 'Orden del Fénix',
      tag: 'FNX',
    });
    expect(validateGuild('Yo', 'AB').ok).toBe(false);
    expect(validateGuild('Orden', 'A1').ok).toBe(false);
  });
});
