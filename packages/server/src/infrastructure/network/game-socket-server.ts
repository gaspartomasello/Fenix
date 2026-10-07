import type { Server as HttpServer } from 'node:http';
import { decodeClientMessage, encodeMessage, type EntityId } from '@fenix/shared';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type { GameApplication } from '../../application/game-application';
import { RateLimiter } from './rate-limiter';
import type { SessionRegistry } from './session-registry';

export const WEBSOCKET_PATH = '/ws';
const HEARTBEAT_INTERVAL_MS = 30_000;
const MESSAGES_PER_SECOND = 20;

interface Connection {
  readonly socket: WebSocket;
  readonly limiter: RateLimiter;
  playerId: EntityId | null;
  alive: boolean;
}

/**
 * Adaptador WebSocket: decodifica mensajes, maneja el ciclo de vida de cada
 * conexión y delega toda decisión de juego en `GameApplication`.
 */
export class GameSocketServer {
  private readonly wss: WebSocketServer;
  private readonly connections = new Set<Connection>();
  private readonly heartbeat: NodeJS.Timeout;

  constructor(
    httpServer: HttpServer,
    private readonly app: GameApplication,
    private readonly sessions: SessionRegistry,
  ) {
    this.wss = new WebSocketServer({ server: httpServer, path: WEBSOCKET_PATH, maxPayload: 4096 });
    this.wss.on('connection', (socket) => this.onConnection(socket));
    this.heartbeat = setInterval(() => this.checkHeartbeats(), HEARTBEAT_INTERVAL_MS);
  }

  close(): Promise<void> {
    clearInterval(this.heartbeat);
    for (const connection of this.connections) connection.socket.terminate();
    return new Promise((resolve) => this.wss.close(() => resolve()));
  }

  private onConnection(socket: WebSocket): void {
    const connection: Connection = {
      socket,
      limiter: new RateLimiter(MESSAGES_PER_SECOND, MESSAGES_PER_SECOND, () => performance.now()),
      playerId: null,
      alive: true,
    };
    this.connections.add(connection);

    socket.on('pong', () => (connection.alive = true));
    socket.on('message', (data, isBinary) => {
      if (!isBinary) this.onMessage(connection, data);
    });
    socket.on('close', () => this.onClose(connection));
    socket.on('error', (error) => console.warn('[ws] error de conexión:', error.message));
  }

  private onMessage(connection: Connection, data: RawData): void {
    if (!connection.limiter.tryConsume()) return;

    const decoded = decodeClientMessage(data.toString());
    if (!decoded.ok) return;
    const message = decoded.message;

    if (connection.playerId) {
      this.app.handle(connection.playerId, message);
      return;
    }
    if (message.type !== 'join') return;

    const result = this.app.join(message);
    if (!result.ok) {
      connection.socket.send(encodeMessage({ type: 'joinRejected', reason: result.reason }));
      return;
    }
    connection.playerId = result.playerId;
    this.sessions.bind(result.playerId, connection.socket);
    this.app.announceJoin(result.playerId);
  }

  private onClose(connection: Connection): void {
    this.connections.delete(connection);
    if (!connection.playerId) return;
    this.sessions.unbind(connection.playerId);
    this.app.leave(connection.playerId);
  }

  /** Cierra conexiones que dejaron de responder (pestaña colgada, red caída). */
  private checkHeartbeats(): void {
    for (const connection of this.connections) {
      if (!connection.alive) {
        connection.socket.terminate();
        continue;
      }
      connection.alive = false;
      connection.socket.ping();
    }
  }
}
