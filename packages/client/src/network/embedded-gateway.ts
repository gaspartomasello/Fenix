import type { EmbeddedConnection, KeyValueStorage } from '@fenix/server/embedded';
import { decodeServerMessage } from '@fenix/shared/protocol/codec';
import type { ClientMessage } from '@fenix/shared/protocol/messages';
import { loadWorld, saveWorld } from '../platform/world-cache';
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
    const { createEmbeddedServer, planSoloWorld, soloWorldKey, packBlueprint, unpackBlueprint } =
      await import('@fenix/server/embedded');
    // El mundo se genera una sola vez y queda guardado en el navegador; las
    // siguientes veces se lee de ahí (mucho más rápido).
    const key = `${soloWorldKey()}|${__FENIX_BUILD__}`;
    this.handlers.onProgress?.('Cargando el mundo…');
    let blueprint = unpackBlueprint(await loadWorld(key));
    if (!blueprint) {
      this.handlers.onProgress?.('Creando el mundo por primera vez: puede tardar un poco…');
      // Un respiro para que el aviso se vea antes del trabajo pesado.
      await new Promise((resolve) => setTimeout(resolve, 50));
      blueprint = planSoloWorld();
      void saveWorld(key, packBlueprint(blueprint));
    }
    // En el modo solo, Gaspar entra como personaje de prueba (todo al máximo).
    // `?hora=22` en la dirección arranca el mundo a esa hora (para probar la noche).
    const hour = Number(new URLSearchParams(window.location.search).get('hora'));
    const server = createEmbeddedServer({
      blueprint,
      storage: browserStorage,
      testCharacters: ['Gaspar'],
      ...(Number.isFinite(hour) && hour > 0 && hour < 24 ? { startHour: hour } : {}),
    });
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
