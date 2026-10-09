import type { ClientMessage } from '@fenix/shared';
import { encodeMessage } from '@fenix/shared';
import { GameApplication } from './application/game-application';
import { World } from './domain/world';
import { generateIslandMap } from './infrastructure/content/procedural-map';
import { ClientSession } from './infrastructure/network/client-session';
import { SessionRegistry } from './infrastructure/network/session-registry';
import { SeededRandom } from './infrastructure/system/seeded-random';
import { SystemClock } from './infrastructure/system/system-clock';
import { UuidGenerator } from './infrastructure/system/uuid-generator';

/**
 * Raíz de composición alternativa: el mismo servidor, sin red, para correr
 * dentro del navegador (modo solo). Solo usa módulos sin dependencias de Node.
 */

export interface EmbeddedServerOptions {
  readonly mapSeed?: number;
  readonly mapSize?: number;
}

export interface EmbeddedConnection {
  send(message: ClientMessage): void;
  close(): void;
}

export interface EmbeddedServer {
  /** Conecta un cliente; `deliver` recibe cada mensaje del servidor serializado. */
  connect(deliver: (data: string) => void): EmbeddedConnection;
}

export function createEmbeddedServer(options: EmbeddedServerOptions = {}): EmbeddedServer {
  const size = options.mapSize ?? 96;
  const { map, spawnPoint } = generateIslandMap({
    width: size,
    height: size,
    seed: options.mapSeed ?? 1997,
  });
  const sessions = new SessionRegistry();
  const app = new GameApplication({
    world: new World(map, spawnPoint),
    clock: new SystemClock(),
    ids: new UuidGenerator(),
    random: new SeededRandom(Date.now()),
    notifier: sessions,
  });

  return {
    connect(deliver) {
      const session = new ClientSession(app, sessions, { send: deliver });
      return {
        // Se serializa igual que por red, así el mensaje pasa la misma validación.
        send: (message) => session.receive(encodeMessage(message)),
        close: () => session.close(),
      };
    },
  };
}
