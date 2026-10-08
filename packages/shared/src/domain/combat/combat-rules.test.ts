import { describe, expect, it } from 'vitest';
import {
  blockChance,
  effectiveMoveMode,
  hitChance,
  inMeleeRange,
  resolveAttack,
} from './combat-rules';
import { fullVitals } from './vitals';
import { FISTS, armorOf, weaponOf } from './weapons';

/** Generador que devuelve valores fijos en orden. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
};

const attacker = { strength: 50, weapon: FISTS, skill: 500, tactics: 1000 };
const defender = { armor: 0, skill: 500, parrying: 0 };

describe('reglas de combate', () => {
  it('calcula los vitales según los atributos', () => {
    expect(fullVitals({ strength: 50, dexterity: 40, intelligence: 30 })).toEqual({
      hits: 75,
      maxHits: 75,
      mana: 30,
      maxMana: 30,
      stamina: 40,
      maxStamina: 40,
    });
  });

  it('usa el arma de la mano derecha o los puños, con su habilidad', () => {
    expect(weaponOf({}).skill).toBe('wrestling');
    expect(weaponOf({ rightHand: 'dagger' }).skill).toBe('fencing');
    expect(weaponOf({ rightHand: 'axe' }).name).toBe('hacha');
    expect(armorOf({ head: 'iron-helmet', torso: 'chainmail', leftHand: 'wooden-shield' })).toBe(
      23,
    );
  });

  it('el acierto depende de las habilidades (50 % a igual nivel)', () => {
    expect(hitChance(500, 500)).toBeCloseTo(0.5);
    expect(hitChance(1000, 0)).toBe(0.95);
    expect(hitChance(0, 1000)).toBe(0.1);
    expect(blockChance(1000)).toBe(0.25);
  });

  it('falla, bloquea o pega según los dados', () => {
    expect(resolveAttack(attacker, defender, sequence(0.99))).toEqual({
      hit: false,
      blocked: false,
      damage: 0,
    });
    expect(resolveAttack(attacker, { ...defender, parrying: 1000 }, sequence(0.1, 0.1))).toEqual({
      hit: true,
      blocked: true,
      damage: 0,
    });
    // Acierta (0.1) y saca el daño máximo (0.99): (4 + 50/20) × 1,0 = 6.
    expect(resolveAttack(attacker, defender, sequence(0.1, 0.99))).toEqual({
      hit: true,
      blocked: false,
      damage: 6,
    });
    // Con Tácticas en 0 se pega al 60 %.
    expect(resolveAttack({ ...attacker, tactics: 0 }, defender, sequence(0.1, 0.99)).damage).toBe(
      4,
    );
    expect(resolveAttack(attacker, { ...defender, armor: 1000 }, sequence(0.1, 0)).damage).toBe(1);
  });

  it('golpea a tiles vecinos y sin energía no se corre', () => {
    expect(inMeleeRange({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true);
    expect(inMeleeRange({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
    expect(effectiveMoveMode('run', 0)).toBe('walk');
  });
});
