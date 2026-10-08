import { describe, expect, it } from 'vitest';
import { formatSkill, skillGainChance } from '../skills/skill-catalog';
import { SPELLS, rollSpellPower, spellSuccessChance } from './spell-catalog';

describe('magia y habilidades', () => {
  it('la probabilidad de éxito sube con la Magia', () => {
    expect(spellSuccessChance(SPELLS.fireball, 300)).toBe(0.5);
    expect(spellSuccessChance(SPELLS.fireball, 500)).toBe(1);
    expect(spellSuccessChance(SPELLS.heal, 0)).toBe(0.5);
  });

  it('la potencia suma un punto cada 10 de Magia', () => {
    expect(rollSpellPower(SPELLS['magic-arrow'], 500, () => 0)).toBe(4 + 5);
    expect(rollSpellPower(SPELLS.light, 500, () => 0)).toBe(0);
  });

  it('formatea habilidades y cuesta más subirlas cerca del máximo', () => {
    expect(formatSkill(312)).toBe('31.2');
    expect(skillGainChance(0)).toBeGreaterThan(skillGainChance(900));
    expect(skillGainChance(1000)).toBe(0.02);
  });
});
