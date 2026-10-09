import { decodeServerMessage, encodeMessage, type ClientMessage } from '@fenix/shared';
import type { GameGateway, GatewayHandlers } from './game-gateway';

/** Conexión con el servidor de juego por WebSocket. */
export class WebSocketGateway implements GameGateway {
  private socket: WebSocket | null = null;

  constructor(
    private readonly url: string,
    private readonly handlers: GatewayHandlers,
  ) {}

  /** URL del servidor de juego en el mismo host que sirve la página. */
  static defaultUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}/ws`;
  }

  connect(): Promise<void> {
    this.handlers.onStatus('connecting');
    const socket = new WebSocket(this.url);
    this.socket = socket;

    return new Promise((resolve, reject) => {
      socket.addEventListener('open', () => {
        this.handlers.onStatus('open');
        resolve();
      });
      socket.addEventListener('error', () => reject(new Error('No se pudo conectar al servidor')));
      socket.addEventListener('close', () => {
        this.handlers.onStatus('closed');
      });
      socket.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (typeof event.data !== 'string') return;
        const decoded = decodeServerMessage(event.data);
        if (decoded.ok) this.handlers.onMessage(decoded.message);
        else console.warn('[red]', decoded.error);
      });
    });
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(encodeMessage(message));
  }

  close(): void {
    this.socket?.close();
  }
}
