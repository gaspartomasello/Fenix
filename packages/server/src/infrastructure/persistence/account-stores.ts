import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AccountRecord, AccountStore } from '../../application/ports';
import type { KeyValueStorage } from './key-value-character-store';

const key = (name: string): string => name.trim().toLocaleLowerCase();

/** Valida una cuenta leída de almacenamiento. Devuelve null si está dañada. */
export function parseAccount(value: unknown): AccountRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.name !== 'string') return null;
  if (data.passwordHash !== null && typeof data.passwordHash !== 'string') return null;
  const characters = Array.isArray(data.characters)
    ? data.characters.filter((c): c is string => typeof c === 'string')
    : [];
  return { name: data.name, passwordHash: data.passwordHash, characters };
}

function parseAccountList(raw: string): AccountRecord[] {
  const value: unknown = JSON.parse(raw);
  return Array.isArray(value) ? value.flatMap((item) => parseAccount(item) ?? []) : [];
}

/** Cuentas en memoria; base de los almacenes que además escriben a disco o al navegador. */
export class MemoryAccountStore implements AccountStore {
  private readonly accounts = new Map<string, AccountRecord>();

  constructor(initial: Iterable<AccountRecord> = []) {
    for (const account of initial) this.accounts.set(key(account.name), account);
  }

  find(name: string): AccountRecord | undefined {
    return this.accounts.get(key(name));
  }

  save(account: AccountRecord): void {
    this.accounts.set(key(account.name), account);
    this.changed();
  }

  all(): AccountRecord[] {
    return [...this.accounts.values()];
  }

  protected changed(): void {}
}

/** Espera entre un cambio y la escritura, para juntar varios guardados en uno. */
const WRITE_DELAY_MS = 1000;

/** Cuentas en un archivo JSON (como los personajes: escritura atómica poco después del cambio). */
export class JsonFileAccountStore extends MemoryAccountStore {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly path: string) {
    super(JsonFileAccountStore.read(path));
  }

  protected override changed(): void {
    this.timer ??= setTimeout(() => this.flush(), WRITE_DELAY_MS);
  }

  /** Escribe ya los cambios pendientes (al apagar el servidor). */
  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.all(), null, 1));
    renameSync(temporary, this.path);
  }

  private static read(path: string): AccountRecord[] {
    try {
      return parseAccountList(readFileSync(path, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new Error(`No se pudo leer ${path}`, { cause: error });
    }
  }
}

const STORAGE_KEY = 'fenix.cuentas';

/** Cuentas guardadas en el navegador (modo solo). */
export class KeyValueAccountStore extends MemoryAccountStore {
  constructor(private readonly storage: KeyValueStorage) {
    super(KeyValueAccountStore.read(storage));
  }

  protected override changed(): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.all()));
    } catch {
      // Sin espacio o sin permiso: se conserva en memoria mientras dure la partida.
    }
  }

  private static read(storage: KeyValueStorage): AccountRecord[] {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return raw ? parseAccountList(raw) : [];
    } catch {
      return [];
    }
  }
}
