import { describe, expect, it } from 'vitest';
import { CREATURES } from './creature-catalog';
import {
  MELEE_CHASE_PACE,
  STRIDE_VARIATION,
  creatureStepMs,
  spellCooldownMs,
} from './creature-pace';

describe('el paso de las criaturas', () => {
  it('cada individuo camina distinto, dentro del margen de su especie', () => {
    const wolf = CREATURES.wolf;
    const steps = ['lobo-1', 'lobo-2', 'lobo-3', 'lobo-4', 'lobo-5'].map((id) =>
      creatureStepMs(wolf, id, false),
    );
    expect(new Set(steps).size).toBeGreaterThan(1);
    for (const ms of steps) {
      expect(ms).toBeGreaterThanOrEqual(Math.floor(wolf.moveMs * (1 - STRIDE_VARIATION)));
      expect(ms).toBeLessThanOrEqual(Math.ceil(wolf.moveMs * (1 + STRIDE_VARIATION)));
    }
    // Siempre el mismo para la misma criatura.
    expect(creatureStepMs(wolf, 'lobo-1', false)).toBe(steps[0]);
  });

  it('los de cuerpo a cuerpo persiguen más despacio; los magos no', () => {
    const orc = CREATURES.orc;
    expect(creatureStepMs(orc, 'orco', true)).toBe(
      Math.round(creatureStepMs(orc, 'orco', false) * MELEE_CHASE_PACE),
    );
    const lich = CREATURES.lich;
    expect(creatureStepMs(lich, 'liche', true)).toBe(creatureStepMs(lich, 'liche', false));
  });

  it('los magos esperan menos entre hechizo y hechizo', () => {
    expect(spellCooldownMs(6000)).toBeLessThan(6000);
  });
});
