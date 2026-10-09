import { EmbeddedGateway } from './embedded-gateway';
import type { GameGateway, GatewayHandlers } from './game-gateway';
import { WebSocketGateway } from './websocket-gateway';

/** Modo de juego, fijado al compilar (`vite --mode solo`). */
export const IS_SOLO = import.meta.env.MODE === 'solo';

export function createGateway(handlers: GatewayHandlers): GameGateway {
  return IS_SOLO
    ? new EmbeddedGateway(handlers)
    : new WebSocketGateway(WebSocketGateway.defaultUrl(), handlers);
}
