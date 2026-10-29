import { CREATURES, GOLD_BONUS } from '@fenix/shared/creatures/creature-catalog';
import { describe, expect, it } from 'vitest';
import { rollLoot } from './loot';

describe('botín', () => {
  it('los humanos dejan todo lo que llevan puesto y en las manos', () => {
    // Con la peor tirada (nada del botín al azar), igual queda la ropa y las armas.
    const drops = rollLoot(CREATURES['tribal-warrior'], () => 0.999);
    const kinds = drops.map((d) => d.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['tribal-mask', 'spear', 'wooden-shield', 'short-pants', 'sandals']),
    );
    expect(rollLoot(CREATURES.corsair, () => 0.999).map((d) => d.kind)).toContain('longsword');
  });

  it('los que hacen magia llevan una bolsa con sus reactivos', () => {
    const drops = rollLoot(CREATURES['tribal-shaman'], () => 0);
    const bag = drops.find((d) => d.kind === 'bag');
    expect(bag?.contents?.map((c) => c.kind)).toContain('nightshade');
  });

  it('el oro sale un 30 % más generoso', () => {
    const gold = rollLoot(CREATURES.barbarian, () => 0).find((d) => d.kind === 'gold');
    const [min] = CREATURES.barbarian.loot.find((l) => l.kind === 'gold')?.amount ?? [0];
    expect(gold?.amount).toBe(Math.round(min * GOLD_BONUS));
  });
});
