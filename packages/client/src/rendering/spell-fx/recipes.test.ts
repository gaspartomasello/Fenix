import { SPELL_KEYS } from '@fenix/shared/magic/spell-catalog';
import type { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { paintFx } from './paint';
import { SPELL_FX } from './recipes';

/** Un pincel de mentira que cuenta cuántas cosas se dibujan. */
function countingGraphics(): { g: Graphics; count: () => number } {
  let drawn = 0;
  const g = new Proxy({} as Graphics, {
    get: (_, method) => {
      if (method === 'fill' || method === 'stroke') return () => (drawn++, g);
      return () => g;
    },
  });
  return { g, count: () => drawn };
}

describe('efectos de los hechizos', () => {
  it('cada hechizo tiene su propio efecto, distinto de los demás', () => {
    const seen = new Map<string, string>();
    for (const spell of SPELL_KEYS) {
      const fx = SPELL_FX[spell];
      expect(fx, spell).toBeDefined();
      const look = JSON.stringify(fx);
      expect(seen.get(look), `${spell} se ve igual que otro`).toBeUndefined();
      seen.set(look, spell);
    }
  });

  it('todos se dibujan de principio a fin sin errores', () => {
    for (const spell of SPELL_KEYS) {
      const { g, count } = countingGraphics();
      const light = countingGraphics();
      for (let t = 0; t < 1; t += 0.05)
        paintFx(SPELL_FX[spell], {
          g,
          light: light.g,
          from: { x: 0, y: 0 },
          to: { x: 120, y: 60 },
          feet: { x: 120, y: 100 },
          t,
          seed: 1234,
        });
      expect(count() + light.count(), `${spell} no dibujó nada`).toBeGreaterThan(20);
    }
  });
});
