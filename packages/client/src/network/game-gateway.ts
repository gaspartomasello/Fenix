import type { ServerMessage } from '@fenix/shared/protocol/messages';
import type { ServerGateway } from '../core/ports';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export interface GatewayHandlers {
  readonly onMessage: (message: ServerMessage) => void;
  readonly onStatus: (status: ConnectionStatus) => void;
  /** Un aviso mientras se conecta (por ejemplo, que se está creando el mundo). */
  readonly onProgress?: (text: string) => void;
}

/** Conexión con un servidor de juego, sea por red o embebido en la página. */
export interface GameGateway extends ServerGateway {
  connect(): Promise<void>;
  close(): void;
}
