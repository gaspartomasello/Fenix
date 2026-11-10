import { afterEach, describe, expect, it, vi } from 'vitest';
import { UuidGenerator, uuidFromBytes } from './uuid-generator';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('ids únicos', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('arma un UUID versión 4 con bytes al azar', () => {
    expect(uuidFromBytes(new Uint8Array(16).fill(255))).toMatch(UUID_V4);
  });

  it('anda sin randomUUID (página abierta como archivo suelto)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    const ids = new UuidGenerator();
    const a = ids.next();
    expect(a).toMatch(UUID_V4);
    expect(ids.next()).not.toBe(a);
  });
});
