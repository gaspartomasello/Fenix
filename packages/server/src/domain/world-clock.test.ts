import { describe, expect, it } from 'vitest';
import { WorldClock } from './world-clock';

describe('WorldClock', () => {
  it('arranca a la hora pedida y avanza con el tiempo real', () => {
    const clock = new WorldClock(1000, 12, 24_000);
    expect(clock.timeAt(1000).dayProgress).toBeCloseTo(0.5);
    // Un día dura 24 s: 6 s reales son 6 horas del juego.
    expect(clock.timeAt(7000).dayProgress).toBeCloseTo(0.75);
  });
});
