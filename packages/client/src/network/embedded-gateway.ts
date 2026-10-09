import type { EmbeddedConnection, KeyValueStorage } from '@fenix/server/embedded';
import { decodeServerMessage, type ClientMessage } from '@fenix/shared';
import type { GameGateway, GatewayHandlers } from './game-gateway';

/**
 * Modo solo: el servidor corre dentro de la página. Los mensajes viajan de
 * forma asíncrona y serializados, igual que por WebSocket, así el resto del
 * cliente no nota la diferencia.
 */
export class EmbeddedGateway implements GameGateway {
  private connection: EmbeddedConnection | null = null;

  constructor(private readonly handlers: GatewayHandlers) {}

  async connect(): Promise<void> {
    this.handlers.onStatus('connecting');
    // Carga diferida: el código del servidor solo se descarga en modo solo.
    const { createEmbeddedServer } = await import('@fenix/server/embedded');
    // En el modo solo, Gaspar entra como personaje de prueba (todo al máximo).
    const server = createEmbeddedServer({ storage: browserStorage, testCharacters: ['Gaspar'] });
    // Guardar al cerrar o esconder la pestaña (en el celular puede no volver).
    const save = (): void => server.saveAll();
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save();
    });
    this.connection = server.connect((data) => {
      setTimeout(() => {
        const decoded = decodeServerMessage(data);
        if (decoded.ok) this.handlers.onMessage(decoded.message);
      }, 0);
    });
    this.handlers.onStatus('open');
  }

  send(message: ClientMessage): void {
    const connection = this.connection;
    if (connection) setTimeout(() => connection.send(message), 0);
  }

  close(): void {
    this.connection?.close();
    this.connection = null;
    this.handlers.onStatus('closed');
  }
}

/** `localStorage` accedido en cada uso: si el navegador lo bloquea, el almacén lo tolera. */
const browserStorage: KeyValueStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
