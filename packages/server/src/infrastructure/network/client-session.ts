import { decodeClientMessage, encodeMessage, type EntityId } from '@fenix/shared';
import type { GameApplication } from '../../application/game-application';
import type { Outbound, SessionRegistry } from './session-registry';

/**
 * Ciclo de vida de un cliente conectado, independiente del transporte:
 * ingreso, mensajes dentro del mundo y salida. Lo usan tanto el servidor
 * WebSocket como el servidor embebido del modo solo.
 */
export class ClientSession {
  private playerId: EntityId | null = null;

  constructor(
    private readonly app: GameApplication,
    private readonly sessions: SessionRegistry,
    private readonly outbound: Outbound,
  ) {}

  /** Recibe un mensaje crudo del cliente. Los inválidos se descartan. */
  receive(raw: string): void {
    const decoded = decodeClientMessage(raw);
    if (!decoded.ok) return;
    const message = decoded.message;

    if (this.playerId) {
      this.app.handle(this.playerId, message);
      return;
    }
    if (message.type !== 'join') return;

    const result = this.app.join(message);
    if (!result.ok) {
      this.outbound.send(encodeMessage({ type: 'joinRejected', reason: result.reason }));
      return;
    }
    this.playerId = result.playerId;
    this.sessions.bind(result.playerId, this.outbound);
    this.app.announceJoin(result.playerId);
  }

  close(): void {
    if (!this.playerId) return;
    this.sessions.unbind(this.playerId);
    this.app.leave(this.playerId);
    this.playerId = null;
  }
}
