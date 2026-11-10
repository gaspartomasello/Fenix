import type { IdGenerator } from '../../application/ports';

/**
 * Ids únicos con la Web Crypto API (Node y navegadores). `randomUUID` solo
 * existe en páginas seguras (https): abierto como archivo suelto en el
 * celular, el modo solo no la tiene, y se arma el mismo formato con
 * `getRandomValues`, que está en todos lados.
 */
export class UuidGenerator implements IdGenerator {
  next(): string {
    const crypto = globalThis.crypto;
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return uuidFromBytes(crypto.getRandomValues(new Uint8Array(16)));
  }
}

/** Un UUID versión 4 a partir de 16 bytes al azar. */
export function uuidFromBytes(bytes: Uint8Array): string {
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
