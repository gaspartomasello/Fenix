import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HouseStore } from '../../application/ports';
import { parseHouseList, type SavedHouse } from '../../domain/persistence/saved-house';

/** Espera entre un cambio y la escritura, para juntar varios guardados en uno. */
const WRITE_DELAY_MS = 1000;

/**
 * Las casas en un archivo JSON. Se lee al arrancar y se reescribe de forma
 * atómica (archivo temporal + renombrar) poco después de cada guardado.
 */
export class JsonFileHouseStore implements HouseStore {
  private pending: readonly SavedHouse[] | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly path: string) {}

  load(): SavedHouse[] {
    try {
      return parseHouseList(readFileSync(this.path, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new Error(`No se pudo leer ${this.path}`, { cause: error });
    }
  }

  save(houses: readonly SavedHouse[]): void {
    this.pending = houses;
    this.timer ??= setTimeout(() => this.flush(), WRITE_DELAY_MS);
  }

  /** Escribe ya lo pendiente (al apagar el servidor). */
  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.pending) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.pending, null, 1));
    renameSync(temporary, this.path);
    this.pending = null;
  }
}
