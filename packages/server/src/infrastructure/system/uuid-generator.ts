import type { IdGenerator } from '../../application/ports';

/** Ids únicos con la Web Crypto API (disponible en Node y en navegadores). */
export class UuidGenerator implements IdGenerator {
  next(): string {
    return globalThis.crypto.randomUUID();
  }
}
