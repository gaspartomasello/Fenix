import type { EntityId, ServerMessage } from '@fenix/shared';

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
