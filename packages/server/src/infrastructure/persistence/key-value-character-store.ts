import { parseSavedCharacter } from '../../domain/persistence/saved-character';
import { MemoryCharacterStore, parseCharacterList } from './memory-character-store';

/** Lo mínimo de `localStorage` que hace falta (así no depende del DOM). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'fenix.personajes';

/**
 * Personajes guardados en el navegador (modo solo). Si el navegador no
 * permite guardar, el juego sigue andando y solo se pierde el progreso.
 */
export class KeyValueCharacterStore extends MemoryCharacterStore {
  constructor(private readonly storage: KeyValueStorage) {
    super(KeyValueCharacterStore.read(storage));
  }

  override save(...args: Parameters<MemoryCharacterStore['save']>): void {
    super.save(...args);
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.all()));
    } catch {
      // Sin espacio o sin permiso: se conserva en memoria mientras dure la partida.
    }
  }

  private static read(storage: KeyValueStorage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return raw ? parseCharacterList(raw, parseSavedCharacter) : [];
    } catch {
      return [];
    }
  }
}
