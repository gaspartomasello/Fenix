import {
  decodeServerMessage,
  encodeMessage,
  type ClientMessage,
  type ServerMessage,
} from '@fenix/shared';
import type { ServerGateway } from '../core/ports';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export interface WebSocketGatewayHandlers {
  readonly onMessage: (message: ServerMessage) => void;
  readonly onStatus: (status: ConnectionStatus) => void;
}

/** Implementación del puerto `ServerGateway` sobre WebSocket. */
export class WebSocketGateway implements ServerGateway {
  private socket: WebSocket | null = null;

  constructor(
    private readonly url: string,
    private readonly handlers: WebSocketGatewayHandlers,
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
