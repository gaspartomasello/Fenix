import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseSavedCharacter } from '../../domain/persistence/saved-character';
import { MemoryCharacterStore, parseCharacterList } from './memory-character-store';

/** Espera entre un cambio y la escritura, para juntar varios guardados en uno. */
const WRITE_DELAY_MS = 1000;

/**
 * Personajes en un archivo JSON. Se lee entero al arrancar y se reescribe de
 * forma atómica (archivo temporal + renombrar) poco después de cada cambio.
 */
export class JsonFileCharacterStore extends MemoryCharacterStore {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly path: string) {
    super(JsonFileCharacterStore.read(path));
  }

  override save(...args: Parameters<MemoryCharacterStore['save']>): void {
    super.save(...args);
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

  private static read(path: string) {
    try {
      return parseCharacterList(readFileSync(path, 'utf8'), parseSavedCharacter);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new Error(`No se pudo leer ${path}`, { cause: error });
    }
  }
}
