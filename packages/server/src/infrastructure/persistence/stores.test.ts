import { DEFAULT_APPEARANCE, Direction, STARTING_SKILLS } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, type SavedCharacter } from '../../domain/persistence/saved-character';
import { ScryptPasswordHasher } from '../system/scrypt-password-hasher';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFileCharacterStore } from './json-file-character-store';
import { KeyValueCharacterStore } from './key-value-character-store';

const ana: SavedCharacter = {
  version: SAVE_VERSION,
  name: 'Ana',
  passwordHash: null,
  appearance: DEFAULT_APPEARANCE,
  position: { x: 3, y: 4 },
  direction: Direction.South,
  vitals: { hits: 50, mana: 10, stamina: 20 },
  dead: false,
  skills: STARTING_SKILLS,
  reputation: { fame: 0, karma: 0, murders: 0 },
  guild: null,
  items: [{ kind: 'apple', amount: 3, location: { type: 'backpack', position: { x: 0, y: 0 } } }],
};

describe('JsonFileCharacterStore', () => {
  it('escribe el archivo y lo vuelve a leer al arrancar', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fenix-'));
    try {
      const path = join(dir, 'datos', 'personajes.json');
      const store = new JsonFileCharacterStore(path);
      expect(store.all()).toEqual([]);
      store.save(ana);
      store.flush();
      expect(new JsonFileCharacterStore(path).find('ANA')).toEqual(ana);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('KeyValueCharacterStore', () => {
  it('guarda en el navegador y tolera datos dañados', () => {
    const data = new Map<string, string>([['fenix.personajes', '{roto']]);
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
    const store = new KeyValueCharacterStore(storage);
    expect(store.all()).toEqual([]);
    store.save(ana);
    expect(new KeyValueCharacterStore(storage).find('ana')).toEqual(ana);

    data.set('fenix.personajes', JSON.stringify([{ version: 1, name: 'Sin datos' }, ana]));
    expect(new KeyValueCharacterStore(storage).all()).toEqual([ana]);
  });

  it('sigue andando si el navegador no deja guardar', () => {
    const store = new KeyValueCharacterStore({
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    });
    store.save(ana);
    expect(store.find('Ana')).toEqual(ana);
  });
});

describe('ScryptPasswordHasher', () => {
  it('verifica sin guardar la contraseña', () => {
    const hasher = new ScryptPasswordHasher();
    const hash = hasher.hash('secreta1');
    expect(hash).not.toContain('secreta1');
    expect(hasher.verify('secreta1', hash)).toBe(true);
    expect(hasher.verify('secreta2', hash)).toBe(false);
    expect(hasher.verify('secreta1', 'basura')).toBe(false);
  });
});
