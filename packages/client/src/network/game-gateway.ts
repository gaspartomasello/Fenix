import type { ServerMessage } from '@fenix/shared';
import type { ServerGateway } from '../core/ports';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export interface GatewayHandlers {
  readonly onMessage: (message: ServerMessage) => void;
  readonly onStatus: (status: ConnectionStatus) => void;
}

/** Conexión con un servidor de juego, sea por red o embebido en la página. */
export interface GameGateway extends ServerGateway {
  connect(): Promise<void>;
  close(): void;
}
