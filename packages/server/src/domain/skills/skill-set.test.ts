import { STARTING_SKILLS, SKILL_KEYS, skillGainAmount } from '@fenix/shared/skills/skill-catalog';
import { describe, expect, it } from 'vitest';
import { SkillSet } from './skill-set';

describe('SkillSet', () => {
  it('sube cuando sale la tirada: siempre y rápido hasta 50, de a 0,1 cerca del máximo', () => {
    const skills = new SkillSet(STARTING_SKILLS);
    expect(skills.tryGain('magery', () => 0)).toBe(true);
    expect(skills.get('magery')).toBe(
      STARTING_SKILLS.magery + skillGainAmount(STARTING_SKILLS.magery),
    );
    const expert = new SkillSet({ ...STARTING_SKILLS, magery: 900 });
    expert.tryGain('magery', () => 0);
    expect(expert.get('magery')).toBe(901);
    // Hasta 50 se sube con cada uso; más arriba, solo si sale la tirada.
    expect(skills.tryGain('magery', () => 0.99)).toBe(true);
    expect(expert.tryGain('magery', () => 0.99)).toBe(false);
  });

  it('no pasa del máximo ni del tope total', () => {
    const maxed = new SkillSet({ ...STARTING_SKILLS, magery: 1000 });
    expect(maxed.tryGain('magery', () => 0)).toBe(false);
    // Diez habilidades al máximo suman 1000,0 puntos.
    const zero = Object.fromEntries(SKILL_KEYS.map((k) => [k, 0])) as typeof STARTING_SKILLS;
    const tenSkills = SKILL_KEYS.slice(0, 10);
    const cappedValues = {
      ...zero,
      ...Object.fromEntries(tenSkills.map((key) => [key, 1000])),
    };
    const capped = new SkillSet(cappedValues);
    expect(capped.total).toBe(10000);
    expect(capped.tryGain('magery', () => 0)).toBe(false);

    const almostCapped = new SkillSet({ ...cappedValues, hiding: 999 });
    expect(almostCapped.total).toBe(9999);
    expect(almostCapped.tryGain('hiding', () => 0)).toBe(true);
    expect(almostCapped.total).toBe(10000);
    expect(almostCapped.tryGain('magery', () => 0)).toBe(false);
  });
  it('intercambia puntos al llegar al tope, sin tocar habilidades bloqueadas', () => {
    const zero = Object.fromEntries(SKILL_KEYS.map((key) => [key, 0])) as typeof STARTING_SKILLS;
    const values = {
      ...zero,
      ...Object.fromEntries(SKILL_KEYS.slice(0, 10).map((key) => [key, 1000])),
    };
    const skills = new SkillSet(values);
    skills.setDirection('wrestling', 'down');
    skills.setDirection('swordsmanship', 'lock');
    expect(skills.tryGain('magery', () => 1)).toBe(false);
    expect(skills.get('wrestling')).toBe(1000);
    expect(skills.tryGain('magery', () => 0)).toBe(true);
    expect(skills.get('magery')).toBe(10);
    expect(skills.get('wrestling')).toBe(990);
    expect(skills.get('swordsmanship')).toBe(1000);
    expect(skills.total).toBe(10000);
    expect(skills.tryGain('wrestling', () => 0)).toBe(false);
    expect(skills.tryGain('swordsmanship', () => 0)).toBe(false);
  });
});
