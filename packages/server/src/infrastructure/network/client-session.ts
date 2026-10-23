import { decodeClientMessage, encodeMessage } from '@fenix/shared/protocol/codec';
import type { ClientMessage, EntityId, ServerMessage } from '@fenix/shared/protocol/messages';
import type { GameApplication } from '../../application/game-application';
import type { AccountRecord } from '../../application/ports';
import type { JoinWorldResult } from '../../application/use-cases/join-world';
import type { Outbound, SessionRegistry } from './session-registry';

/**
 * Ciclo de vida de un cliente conectado, independiente del transporte:
 * entrar a la cuenta, elegir o crear un personaje, mensajes dentro del mundo
 * y salida. Lo usan tanto el servidor WebSocket como el servidor embebido
 * del modo solo.
 */
export class ClientSession {
  private playerId: EntityId | null = null;
  private account: AccountRecord | null = null;

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
    this.beforeWorld(message);
  }

  close(): void {
    if (!this.playerId) return;
    this.sessions.unbind(this.playerId);
    this.app.leave(this.playerId);
    this.playerId = null;
  }

  /** Antes de entrar al mundo: la cuenta, la lista de personajes y la creación. */
  private beforeWorld(message: ClientMessage): void {
    const accounts = this.app.accounts;
    switch (message.type) {
      case 'join':
        // Entrada directa con un personaje (sin cuenta), como antes de las cuentas.
        this.enter(this.app.join(message));
        return;
      case 'login': {
        const result = accounts.login(message.account, message.password, message.create);
        if (!result.ok) return this.reject(result.reason);
        this.account = result.account;
        this.send(accounts.describe(result.account));
        return;
      }
      case 'createCharacter':
        if (this.account) this.enter(accounts.createCharacter(this.account, message.creation));
        return;
      case 'play':
        if (this.account) this.enter(accounts.play(this.account, message.name));
        return;
      case 'deleteCharacter': {
        if (!this.account) return;
        const result = accounts.deleteCharacter(
          this.account,
          message.name,
          this.app.isOnline(message.name),
        );
        if (!result.ok) return this.reject(result.reason);
        this.account = result.account;
        this.send(accounts.describe(result.account));
        return;
      }
      default:
        return;
    }
  }

  private enter(result: JoinWorldResult): void {
    if (!result.ok) return this.reject(result.reason);
    this.playerId = result.playerId;
    this.sessions.bind(result.playerId, this.outbound);
    this.app.announceJoin(result.playerId);
  }

  private reject(reason: string): void {
    this.send({ type: 'joinRejected', reason });
  }

  private send(message: ServerMessage): void {
    this.outbound.send(encodeMessage(message));
  }
}
