import type { ClientMessage } from '@fenix/shared';
import { encodeMessage } from '@fenix/shared';
import { GameApplication } from './application/game-application';
import { WorldClock } from './domain/world-clock';
import { createWorld } from './infrastructure/content/world-builder';
import {
  KeyValueCharacterStore,
  type KeyValueStorage,
} from './infrastructure/persistence/key-value-character-store';
import { ClientSession } from './infrastructure/network/client-session';
import { SessionRegistry } from './infrastructure/network/session-registry';
import { SeededRandom } from './infrastructure/system/seeded-random';
import { SystemClock } from './infrastructure/system/system-clock';
import { startTicker } from './infrastructure/system/ticker';
import { UuidGenerator } from './infrastructure/system/uuid-generator';

/**
 * Raíz de composición alternativa: el mismo servidor, sin red, para correr
 * dentro del navegador (modo solo). Solo usa módulos sin dependencias de Node.
 */

export interface EmbeddedServerOptions {
  readonly mapSeed?: number;
  readonly mapSize?: number;
  readonly startHour?: number;
  /** Dónde guardar el personaje (el `localStorage` del navegador); sin esto no se guarda. */
  readonly storage?: KeyValueStorage;
  /** Personajes de prueba: entran con todo al máximo. */
  readonly testCharacters?: readonly string[];
}

export type { KeyValueStorage };

export interface EmbeddedConnection {
  send(message: ClientMessage): void;
  close(): void;
}

export interface EmbeddedServer {
  /** Conecta un cliente; `deliver` recibe cada mensaje del servidor serializado. */
  connect(deliver: (data: string) => void): EmbeddedConnection;
  /** Guarda ya (por ejemplo, al cerrar o esconder la pestaña). */
  saveAll(): void;
}

export function createEmbeddedServer(options: EmbeddedServerOptions = {}): EmbeddedServer {
  const ids = new UuidGenerator();
  const world = createWorld({ size: options.mapSize ?? 128, seed: options.mapSeed ?? 1997 }, ids);
  const sessions = new SessionRegistry();
  const clock = new SystemClock();
  const app = new GameApplication({
    world,
    worldClock: new WorldClock(clock.now(), options.startHour),
    clock,
    ids,
    random: new SeededRandom(Date.now()),
    notifier: sessions,
    ...(options.storage ? { characters: new KeyValueCharacterStore(options.storage) } : {}),
    ...(options.testCharacters ? { testCharacters: options.testCharacters } : {}),
  });

  startTicker(
    (now) => app.tick(now),
    () => clock.now(),
  );

  return {
    connect(deliver) {
      const session = new ClientSession(app, sessions, { send: deliver });
      return {
        // Se serializa igual que por red, así el mensaje pasa la misma validación.
        send: (message) => session.receive(encodeMessage(message)),
        close: () => session.close(),
      };
    },
    saveAll: () => app.saveAll(),
  };
}
