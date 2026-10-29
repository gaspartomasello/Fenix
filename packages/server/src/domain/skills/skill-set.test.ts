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
    // Siete habilidades al máximo ya suman el tope total.
    const zero = Object.fromEntries(SKILL_KEYS.map((k) => [k, 0])) as typeof STARTING_SKILLS;
    const capped = new SkillSet({
      ...zero,
      wrestling: 1000,
      swordsmanship: 1000,
      fencing: 1000,
      tactics: 1000,
      parrying: 1000,
      anatomy: 1000,
      healing: 1000,
    });
    expect(capped.tryGain('magery', () => 0)).toBe(false);
  });
});
