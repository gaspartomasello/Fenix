import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { PasswordHasher } from '../../application/ports';

const KEY_LENGTH = 32;

/** Contraseñas con scrypt y sal aleatoria: `scrypt$sal$hash` en base64. */
export class ScryptPasswordHasher implements PasswordHasher {
  hash(password: string): string {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, KEY_LENGTH);
    return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
  }

  verify(password: string, stored: string): boolean {
    const [scheme, salt, hash] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'base64');
    const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length);
    return expected.length === KEY_LENGTH && timingSafeEqual(actual, expected);
  }
}
