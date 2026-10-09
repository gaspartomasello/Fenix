import { validatePassword, type EntityId } from '@fenix/shared';
import { captureCharacter, type SavedCharacter } from '../domain/persistence/saved-character';
import type { Player } from '../domain/player';
import type { World } from '../domain/world';
import type { CharacterStore, PasswordHasher } from './ports';

/** Cada cuánto se guardan todos los personajes conectados. */
export const AUTOSAVE_MS = 30_000;

export type Authentication =
  | { ok: true; saved: SavedCharacter | null; passwordHash: string | null }
  | { ok: false; reason: string };

/**
 * Guardar y cargar personajes. Sin almacén no se guarda nada; sin hasher
 * (modo solo) no se pide contraseña.
 */
export class CharacterPersistence {
  private readonly hashes = new Map<EntityId, string | null>();
  private nextAutosaveAt = 0;

  constructor(
    private readonly world: World,
    private readonly store: CharacterStore | undefined,
    private readonly hasher: PasswordHasher | undefined,
  ) {}

  /** Verifica la contraseña de un personaje guardado, o prepara la de uno nuevo. */
  authenticate(name: string, password: string | undefined): Authentication {
    const saved = this.store?.find(name) ?? null;
    if (!this.hasher) return { ok: true, saved, passwordHash: saved?.passwordHash ?? null };
    if (password === undefined) return { ok: false, reason: 'Escribí la contraseña.' };
    if (saved) {
      const valid = saved.passwordHash !== null && this.hasher.verify(password, saved.passwordHash);
      return valid
        ? { ok: true, saved, passwordHash: saved.passwordHash }
        : { ok: false, reason: 'Contraseña incorrecta.' };
    }
    const validation = validatePassword(password);
    if (!validation.ok) return validation;
    return { ok: true, saved: null, passwordHash: this.hasher.hash(password) };
  }

  /** Empieza a seguir a un jugador recién conectado y lo guarda (así reserva el nombre). */
  register(player: Player, passwordHash: string | null): void {
    this.hashes.set(player.id, passwordHash);
    this.save(player);
  }

  save(player: Player): void {
    if (!this.store || !this.hashes.has(player.id)) return;
    this.store.save(captureCharacter(player, this.world, this.hashes.get(player.id) ?? null));
  }

  /** Guarda y deja de seguir al jugador (al desconectarse). */
  release(player: Player): void {
    this.save(player);
    this.hashes.delete(player.id);
  }

  saveAll(): void {
    for (const player of this.world.allPlayers()) this.save(player);
  }

  autosave(now: number): void {
    if (now < this.nextAutosaveAt) return;
    if (this.nextAutosaveAt !== 0) this.saveAll();
    this.nextAutosaveAt = now + AUTOSAVE_MS;
  }
}
