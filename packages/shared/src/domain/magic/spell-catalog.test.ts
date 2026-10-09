import { describe, expect, it } from 'vitest';
import { ITEMS } from '../items/item-catalog';
import { formatSkill, skillGainChance } from '../skills/skill-catalog';
import { cureChance, poisonLevel } from './effects';
import {
  SPELLS,
  SPELL_CIRCLES,
  SPELL_KEYS,
  resistChance,
  rollSpellPower,
  spellSuccessChance,
  spellsOfCircle,
} from './spell-catalog';

describe('magia y habilidades', () => {
  it('ordena los hechizos en siete círculos con maná y Magia crecientes', () => {
    let mana = 0;
    for (const circle of SPELL_CIRCLES) {
      const spells = spellsOfCircle(circle);
      expect(spells.length).toBeGreaterThan(0);
      expect(spells[0]?.mana).toBeGreaterThan(mana);
      mana = spells[0]?.mana ?? 0;
    }
    expect(SPELLS.flamestrike.mana).toBe(40);
    expect(SPELLS['energy-bolt'].minSkill).toBe(650);
  });

  it('cada hechizo usa reactivos reales y tiene su pergamino', () => {
    for (const key of SPELL_KEYS) {
      expect(SPELLS[key].reagents.length).toBeGreaterThan(0);
      expect(ITEMS[`scroll-${key}`].spell).toBe(key);
    }
  });

  it('la probabilidad de éxito sube con la Magia', () => {
    expect(spellSuccessChance(SPELLS.fireball, 250)).toBe(0.5);
    expect(spellSuccessChance(SPELLS.fireball, 450)).toBe(1);
    expect(spellSuccessChance(SPELLS.heal, 0)).toBe(0.5);
  });

  it('la potencia suma un punto cada 10 de Magia', () => {
    expect(rollSpellPower(SPELLS['magic-arrow'], 500, () => 0)).toBe(4 + 5);
    expect(rollSpellPower(SPELLS.light, 500, () => 0)).toBe(0);
  });

  it('la Resistencia mágica aguanta más los círculos bajos', () => {
    expect(resistChance(0, 1)).toBe(0);
    expect(resistChance(1000, 1)).toBeGreaterThan(resistChance(1000, 7));
    expect(resistChance(1000, 1)).toBeLessThanOrEqual(0.7);
  });

  it('el veneno es más fuerte con más Magia y más difícil de curar', () => {
    expect(poisonLevel(0)).toBe(1);
    expect(poisonLevel(1000)).toBe(3);
    expect(cureChance(0.6, 1)).toBeGreaterThan(cureChance(0.6, 3));
  });

  it('formatea habilidades y cuesta más subirlas cerca del máximo', () => {
    expect(formatSkill(312)).toBe('31.2');
    expect(skillGainChance(0)).toBeGreaterThan(skillGainChance(900));
    expect(skillGainChance(1000)).toBe(0.02);
  });
});
