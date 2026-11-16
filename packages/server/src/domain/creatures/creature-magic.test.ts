import { CREATURES } from '@fenix/shared/creatures/creature-catalog';
import { describe, expect, it } from 'vitest';
import { Creature } from './creature';
import { startCreatureCast } from './creature-magic';

/** Números al azar repetibles (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('los hechizos de las criaturas', () => {
  it('tres magos juntos no tiran todos a la vez, y cada uno espera entre hechizo y hechizo', () => {
    const random = seeded(7);
    const target = new Creature('blanco', 'orc', { x: 3, y: 0 });
    const mages = [0, 1, 2].map((i) => new Creature(`mago-${i}`, 'skeleton-mage', { x: 0, y: i }));
    const casts: { mage: number; at: number }[] = [];
    for (let now = 1; now <= 20_000; now += 100)
      mages.forEach((mage, i) => {
        mage.combat.restoreMana(1000);
        mage.pendingCast = null;
        if (startCreatureCast(mage, target, now, random)) casts.push({ mage: i, at: now });
      });
    // Nadie tira apenas empieza la pelea.
    expect(Math.min(...casts.map((c) => c.at))).toBeGreaterThanOrEqual(800);
    // Nunca salen los tres en el mismo instante.
    const byTime = new Map<number, number>();
    for (const c of casts) byTime.set(c.at, (byTime.get(c.at) ?? 0) + 1);
    expect(Math.max(...byTime.values())).toBeLessThan(3);
    // Cada mago espera al menos unos segundos entre hechizo y hechizo.
    for (const i of [0, 1, 2]) {
      const mine = casts.filter((c) => c.mage === i).map((c) => c.at);
      for (let k = 1; k < mine.length; k++)
        expect((mine[k] ?? 0) - (mine[k - 1] ?? 0)).toBeGreaterThanOrEqual(3000);
    }
  });

  it('los enemigos con forma de persona dejan entre 80 y 120 monedas', () => {
    for (const kind of ['brigand', 'orc', 'wraith', 'skeleton-mage', 'pirate', 'zombie'] as const) {
      const gold = CREATURES[kind].loot?.find((l) => l.kind === 'gold');
      expect(gold?.amount, kind).toEqual([80, 120]);
    }
  });
});
