import type { ClientMessage } from '@fenix/shared/protocol/messages';
import { encodeMessage } from '@fenix/shared/protocol/codec';
import { createGame } from './application/game';
import { WorldClock } from './domain/world-clock';
import {
  planWorld,
  worldFromBlueprint,
  worldId,
  type WorldBlueprint,
  type WorldBuildOptions,
} from './infrastructure/content/world-builder';
import { packBlueprint, unpackBlueprint } from './infrastructure/persistence/blueprint-codec';

export { packBlueprint, unpackBlueprint, type WorldBlueprint };
import {
  KeyValueCharacterStore,
  type KeyValueStorage,
} from './infrastructure/persistence/key-value-character-store';
import { KeyValueAccountStore } from './infrastructure/persistence/account-stores';
import { KeyValueHouseStore } from './infrastructure/persistence/key-value-house-store';
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
  readonly mapHeight?: number;
  readonly startHour?: number;
  /** Dónde guardar el personaje (el `localStorage` del navegador); sin esto no se guarda. */
  readonly storage?: KeyValueStorage;
  /** Personajes de prueba: entran con todo al máximo. */
  readonly testCharacters?: readonly string[];
  /** El mundo ya generado (guardado de antes): si está, no se genera de nuevo. */
  readonly blueprint?: WorldBlueprint;
}

/** Las medidas y la semilla del mundo del modo solo. */
function soloWorld(options: EmbeddedServerOptions): WorldBuildOptions {
  return {
    size: options.mapSize ?? 1400,
    height: options.mapHeight ?? options.mapSize ?? 2000,
    seed: options.mapSeed ?? 1997,
  };
}

/** Qué mundo arman estas opciones (para saber si el guardado sirve). */
export function soloWorldKey(options: EmbeddedServerOptions = {}): string {
  const world = soloWorld(options);
  return worldId(world, world.size, world.height ?? world.size);
}

/** Genera el mundo del modo solo (lo lento: hay que hacerlo una sola vez y guardarlo). */
export function planSoloWorld(options: EmbeddedServerOptions = {}): WorldBlueprint {
  return planWorld(soloWorld(options));
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
  const world = worldFromBlueprint(options.blueprint ?? planSoloWorld(options), ids);
  const sessions = new SessionRegistry();
  const clock = new SystemClock();
  const app = createGame({
    world,
    worldClock: new WorldClock(clock.now(), options.startHour),
    clock,
    ids,
    random: new SeededRandom(Date.now()),
    notifier: sessions,
    ...(options.storage
      ? {
          characters: new KeyValueCharacterStore(options.storage),
          accounts: new KeyValueAccountStore(options.storage),
          houses: new KeyValueHouseStore(options.storage),
        }
      : {}),
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
