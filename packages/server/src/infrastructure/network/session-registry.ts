import type { EntityId, ServerMessage } from '@fenix/shared';
import { encodeMessage } from '@fenix/shared';
import type { Notifier } from '../../application/ports';

/** Lo mínimo que se necesita de una conexión para enviarle datos. */
export interface Outbound {
  send(data: string): void;
}

/**
 * Asocia jugadores con sus conexiones e implementa el puerto `Notifier`.
 * Cada mensaje se serializa una sola vez aunque vaya a muchos destinatarios.
 */
export class SessionRegistry implements Notifier {
  private readonly sessions = new Map<EntityId, Outbound>();

  bind(playerId: EntityId, connection: Outbound): void {
    this.sessions.set(playerId, connection);
  }

  unbind(playerId: EntityId): void {
    this.sessions.delete(playerId);
  }

  send(playerId: EntityId, message: ServerMessage): void {
    this.sessions.get(playerId)?.send(encodeMessage(message));
  }

  broadcast(message: ServerMessage, options?: { except?: EntityId }): void {
    const data = encodeMessage(message);
    for (const [playerId, connection] of this.sessions) {
      if (playerId !== options?.except) connection.send(data);
    }
  }
}
