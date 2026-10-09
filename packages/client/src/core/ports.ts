import type { ClientMessage } from '@fenix/shared';

/** Puerto hacia el servidor. La capa `network` lo implementa con WebSocket. */
export interface ServerGateway {
  send(message: ClientMessage): void;
}
