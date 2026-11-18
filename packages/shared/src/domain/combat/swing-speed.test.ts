import { describe, expect, it } from 'vitest';
import { MIN_SWING_MS, swingDelayMs, weaponSpeed } from './swing-speed';
import { FISTS, weaponByKind } from './weapons';

const katana = weaponByKind('katana');
const halberd = weaponByKind('halberd');

describe('velocidad de los golpes (Sphere: destreza; OSI: energía)', () => {
  it('con 40 de destreza cada arma tarda lo de siempre', () => {
    if (!katana || !halberd) throw new Error('faltan armas');
    expect(swingDelayMs(katana, 40)).toBe(katana.swingMs);
    expect(swingDelayMs(halberd, 40)).toBe(halberd.swingMs);
    expect(swingDelayMs(FISTS, 40)).toBe(FISTS.swingMs);
  });

  it('con más destreza se pega más rápido, con menos más lento', () => {
    if (!katana) throw new Error('falta la katana');
    expect(swingDelayMs(katana, 100)).toBe(1400);
    expect(swingDelayMs(katana, 10)).toBeGreaterThan(katana.swingMs);
  });

  it('cansado se pega más lento, como en OSI', () => {
    if (!katana) throw new Error('falta la katana');
    expect(swingDelayMs(katana, 100, 1)).toBeLessThan(swingDelayMs(katana, 100, 0.2));
    expect(swingDelayMs(katana, 100, 0.5)).toBe(swingDelayMs(katana, 50));
    expect(swingDelayMs(katana, 100, 0)).toBe(swingDelayMs(katana, 0));
  });

  it('nunca más seguido que un golpe por segundo', () => {
    const dagger = weaponByKind('dagger');
    if (!dagger) throw new Error('falta la daga');
    expect(swingDelayMs(dagger, 1000)).toBe(MIN_SWING_MS);
  });

  it('la velocidad al estilo UO: más alta, más rápida', () => {
    const dagger = weaponByKind('dagger');
    if (!dagger || !halberd) throw new Error('faltan armas');
    expect(weaponSpeed(dagger)).toBeGreaterThan(weaponSpeed(halberd));
  });
});
