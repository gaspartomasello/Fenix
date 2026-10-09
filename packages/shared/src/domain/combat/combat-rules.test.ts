import { describe, expect, it } from 'vitest';
import { effectiveMoveMode, hitChance, inMeleeRange, resolveAttack } from './combat-rules';
import { fullVitals } from './vitals';
import { FISTS, armorOf, weaponOf } from './weapons';

/** Generador que devuelve valores fijos en orden. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
};

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

  it('usa el arma de la mano derecha o los puños, y suma la armadura', () => {
    expect(weaponOf({}).name).toBe(FISTS.name);
    expect(weaponOf({ rightHand: 'axe' }).name).toBe('hacha');
    expect(armorOf({ head: 'iron-helmet', torso: 'chainmail', leftHand: 'wooden-shield' })).toBe(
      23,
    );
  });

  it('acota la probabilidad de acierto', () => {
    expect(hitChance(40, 40)).toBeCloseTo(0.6);
    expect(hitChance(200, 0)).toBe(0.9);
    expect(hitChance(0, 200)).toBe(0.3);
  });

  it('un golpe fallado no hace daño; uno acertado hace al menos 1', () => {
    const attacker = { strength: 50, dexterity: 40, weapon: FISTS };
    expect(resolveAttack(attacker, { dexterity: 40, armor: 0 }, sequence(0.99))).toEqual({
      hit: false,
      damage: 0,
    });
    // Acierta (0.1) y saca el daño máximo (0.99): 4 + 50/20 = 6.
    expect(resolveAttack(attacker, { dexterity: 40, armor: 0 }, sequence(0.1, 0.99))).toEqual({
      hit: true,
      damage: 6,
    });
    expect(resolveAttack(attacker, { dexterity: 40, armor: 1000 }, sequence(0.1, 0))).toEqual({
      hit: true,
      damage: 1,
    });
  });

  it('golpea a tiles vecinos y sin energía no se corre', () => {
    expect(inMeleeRange({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true);
    expect(inMeleeRange({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
    expect(effectiveMoveMode('run', 0)).toBe('walk');
    expect(effectiveMoveMode('run', 5)).toBe('run');
  });
});
