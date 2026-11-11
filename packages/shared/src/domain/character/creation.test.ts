import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from './appearance';
import { CREATION_STRENGTH_MIN, startingKit, validateCreation } from './creation';
import { SKILL_KEYS } from '../skills/skill-catalog';
import { itemWeight, maxWeight } from '../items/weight';

const base = {
  name: 'Prueba',
  appearance: DEFAULT_APPEARANCE,
  skills: ['magery', 'archery', 'bowcraft', 'healing'],
};

describe('crear un personaje', () => {
  it('la Fuerza arranca en 60 como mínimo', () => {
    const weak = validateCreation({
      ...base,
      attributes: { strength: 40, dexterity: 30, intelligence: 50 },
    });
    expect(weak.ok).toBe(false);
    const strong = validateCreation({
      ...base,
      attributes: { strength: CREATION_STRENGTH_MIN, dexterity: 10, intelligence: 50 },
    });
    expect(strong.ok).toBe(true);
  });

  it('con la Fuerza mínima, el equipo inicial más pesado entra holgado (menos de la mitad)', () => {
    const weight = (skills: readonly (typeof SKILL_KEYS)[number][]): number =>
      startingKit(skills).reduce((total, e) => total + itemWeight(e.kind) * e.amount, 0);
    // Las cuatro habilidades que más cargan, juntas.
    const heaviest = [...SKILL_KEYS].sort((a, b) => weight([b]) - weight([a])).slice(0, 4);
    expect(weight(heaviest)).toBeLessThan(maxWeight(CREATION_STRENGTH_MIN) / 2);
  });
});
