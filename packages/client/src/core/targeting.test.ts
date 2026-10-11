import { describe, expect, it } from 'vitest';
import { nextAutoTarget, type TargetCandidate } from './targeting';

const mob = (id: string, x: number, extra: Partial<TargetCandidate> = {}): TargetCandidate => ({
  id,
  position: { x, y: 0 },
  body: 'rat',
  dead: false,
  npc: null,
  ownerId: null,
  ...extra,
});

describe('botón de atacar', () => {
  it('elige la criatura salvaje más cercana, sigue con ella y «siguiente» las recorre', () => {
    const near = [
      mob('lejos', 6),
      mob('cerca', 2),
      mob('medio', 4),
      mob('muerta', 1, { dead: true }),
      mob('persona', 1, { body: 'human' }),
      mob('montura', 1, { ownerId: 'otro' }),
      mob('afuera', 30),
    ];
    const from = { x: 0, y: 0 };
    expect(nextAutoTarget(near, from, null)).toBe('cerca');
    // Tocar de nuevo sigue con la misma mientras viva.
    expect(nextAutoTarget(near, from, 'cerca')).toBe('cerca');
    // «Siguiente» las recorre.
    expect(nextAutoTarget(near, from, 'cerca', true)).toBe('medio');
    expect(nextAutoTarget(near, from, 'medio', true)).toBe('lejos');
    expect(nextAutoTarget(near, from, 'lejos', true)).toBe('cerca');
    expect(nextAutoTarget([mob('muerta', 1, { dead: true })], from, null)).toBeNull();
  });
});
