import type { EntityId, ServerMessage } from '@fenix/shared';
import type { SavedCharacter } from '../domain/persistence/saved-character';

/**
 * Puertos de salida de la aplicación. La infraestructura los implementa
 * (reloj del sistema, WebSocket, etc.) y los casos de uso solo los conocen
 * por esta interfaz, lo que permite probarlos sin red.
 */

export interface Clock {
  now(): number;
}

export interface IdGenerator {
  next(): EntityId;
}

export interface RandomSource {
  /** Número en [0, 1). */
  next(): number;
}

/** Entrega mensajes del protocolo a los jugadores conectados. */
export interface Notifier {
  send(playerId: EntityId, message: ServerMessage): void;
  /** Envía el mismo mensaje a varios jugadores (se serializa una vez). */
  sendMany(playerIds: Iterable<EntityId>, message: ServerMessage): void;
  broadcast(message: ServerMessage, options?: { except?: EntityId }): void;
}

/** Dónde se guardan los personajes (archivo en el servidor, navegador en el modo solo). */
export interface CharacterStore {
  /** Busca por nombre, sin distinguir mayúsculas. */
  find(name: string): SavedCharacter | undefined;
  save(character: SavedCharacter): void;
  /** Lo borra para siempre (al borrar un personaje de la cuenta). */
  remove(name: string): void;
}

/** Una cuenta: su contraseña y los nombres de sus personajes. */
export interface AccountRecord {
  readonly name: string;
  /** Hash de la contraseña; null en el modo solo, que no la pide. */
  readonly passwordHash: string | null;
  readonly characters: readonly string[];
}

/** Dónde se guardan las cuentas (junto a los personajes). */
export interface AccountStore {
  /** Busca por nombre, sin distinguir mayúsculas. */
  find(name: string): AccountRecord | undefined;
  save(account: AccountRecord): void;
}

/** Hash de contraseñas: nunca se guardan en texto plano. */
export interface PasswordHasher {
  hash(password: string): string;
  verify(password: string, hash: string): boolean;
}
