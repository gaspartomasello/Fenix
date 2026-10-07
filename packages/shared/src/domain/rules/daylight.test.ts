import { describe, expect, it } from 'vitest';
import { advanceTime, daylight, formatGameTime } from './daylight';

describe('daylight', () => {
  it('es pleno al mediodía y bajo a medianoche', () => {
    expect(daylight(0.5)).toBe(1);
    expect(daylight(0)).toBeCloseTo(0.25);
  });

  it('cambia gradualmente al amanecer', () => {
    const dawn = daylight(6 / 24);
    expect(dawn).toBeGreaterThan(0.25);
    expect(dawn).toBeLessThan(1);
  });

  it('avanza y da la vuelta al día', () => {
    const time = advanceTime({ dayProgress: 0.9, dayLengthMs: 1000 }, 200);
    expect(time.dayProgress).toBeCloseTo(0.1);
  });

  it('formatea la hora del juego', () => {
    expect(formatGameTime(0.5)).toBe('12:00');
    expect(formatGameTime(0.75 + 1 / 1440)).toBe('18:01');
  });
});
