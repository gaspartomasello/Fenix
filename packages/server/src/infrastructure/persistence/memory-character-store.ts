import type { CharacterStore } from '../../application/ports';
import type { SavedCharacter } from '../../domain/persistence/saved-character';

const key = (name: string): string => name.trim().toLocaleLowerCase();

/** Personajes en memoria; base de los almacenes que además escriben a disco o al navegador. */
export class MemoryCharacterStore implements CharacterStore {
  protected readonly characters = new Map<string, SavedCharacter>();

  constructor(initial: Iterable<SavedCharacter> = []) {
    for (const character of initial) this.characters.set(key(character.name), character);
  }

  find(name: string): SavedCharacter | undefined {
    return this.characters.get(key(name));
  }

  save(character: SavedCharacter): void {
    this.characters.set(key(character.name), character);
  }

  all(): SavedCharacter[] {
    return [...this.characters.values()];
  }
}

/** Lee una lista de personajes guardados, descartando los dañados. */
export function parseCharacterList(
  raw: string,
  parse: (value: unknown) => SavedCharacter | null,
): SavedCharacter[] {
  const value: unknown = JSON.parse(raw);
  return Array.isArray(value) ? value.flatMap((item) => parse(item) ?? []) : [];
}
