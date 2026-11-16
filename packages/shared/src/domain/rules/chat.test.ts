import { describe, expect, it } from 'vitest';
import { OVERHEAD_TEXT_MAX_MS, overheadTextDurationMs } from './chat';

describe('los textos sobre la cabeza', () => {
  it('lo largo se queda más tiempo, para alcanzar a leerlo (con un tope)', () => {
    const short = overheadTextDurationMs('Hola');
    const long = overheadTextDurationMs(
      'Una manada de lobos me está diezmando los animales: anoche se llevaron dos corderos.',
    );
    expect(short).toBeGreaterThanOrEqual(4000);
    expect(long).toBeGreaterThan(short + 3000);
    expect(overheadTextDurationMs('x'.repeat(1000))).toBe(OVERHEAD_TEXT_MAX_MS);
  });
});
