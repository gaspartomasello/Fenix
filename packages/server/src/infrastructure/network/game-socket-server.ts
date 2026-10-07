import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type { GameApplication } from '../../application/game-application';
import { ClientSession } from './client-session';
import { RateLimiter } from './rate-limiter';
import type { SessionRegistry } from './session-registry';

export const WEBSOCKET_PATH = '/ws';
const HEARTBEAT_INTERVAL_MS = 30_000;
const MESSAGES_PER_SECOND = 20;

interface Connection {
  readonly socket: WebSocket;
  readonly limiter: RateLimiter;
  readonly session: ClientSession;
  alive: boolean;
}

/**
 * Adaptador WebSocket: limita mensajes, detecta conexiones caídas y delega
 * cada conexión en una `ClientSession`.
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
      session: new ClientSession(this.app, this.sessions, socket),
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
    if (connection.limiter.tryConsume()) connection.session.receive(data.toString());
  }

  private onClose(connection: Connection): void {
    this.connections.delete(connection);
    connection.session.close();
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
