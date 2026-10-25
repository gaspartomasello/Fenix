import type { HouseStore } from '../../application/ports';
import { parseHouseList, type SavedHouse } from '../../domain/persistence/saved-house';
import type { KeyValueStorage } from './key-value-character-store';

const STORAGE_KEY = 'fenix.casas';

/**
 * Las casas guardadas en el navegador (modo solo). Si el navegador no deja
 * guardar, el juego sigue andando y solo se pierden al cerrar.
 */
export class KeyValueHouseStore implements HouseStore {
  constructor(private readonly storage: KeyValueStorage) {}

  load(): SavedHouse[] {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      return raw ? parseHouseList(raw) : [];
    } catch {
      return [];
    }
  }

  save(houses: readonly SavedHouse[]): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(houses));
    } catch {
      // Sin espacio o sin permiso: se conservan en memoria mientras dure la partida.
    }
  }
}
