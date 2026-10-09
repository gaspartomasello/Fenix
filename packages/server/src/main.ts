import { fileURLToPath } from 'node:url';
import { GameApplication } from './application/game-application';
import { World } from './domain/world';
import { loadConfig } from './infrastructure/config';
import { generateIslandMap } from './infrastructure/content/procedural-map';
import { createHttpServer } from './infrastructure/http/static-server';
import { GameSocketServer } from './infrastructure/network/game-socket-server';
import { SessionRegistry } from './infrastructure/network/session-registry';
import { SeededRandom } from './infrastructure/system/seeded-random';
import { SystemClock } from './infrastructure/system/system-clock';
import { UuidGenerator } from './infrastructure/system/uuid-generator';

/** Raíz de composición: el único lugar que conoce todas las piezas concretas. */
function main(): void {
  // src/main.ts y dist/main.js están al mismo nivel: el cliente queda en ../../client/dist.
  const config = loadConfig(fileURLToPath(new URL('../../client/dist', import.meta.url)));
  const { map, spawnPoint } = generateIslandMap({
    width: config.mapSize,
    height: config.mapSize,
    seed: config.mapSeed,
  });

  const world = new World(map, spawnPoint);
  const sessions = new SessionRegistry();
  const app = new GameApplication({
    world,
    clock: new SystemClock(),
    ids: new UuidGenerator(),
    random: new SeededRandom(Date.now()),
    notifier: sessions,
  });

  const httpServer = createHttpServer(config.clientDist);
  const sockets = new GameSocketServer(httpServer, app, sessions);

  httpServer.listen(config.port, config.host, () => {
    console.info(`[fenix] servidor escuchando en http://${config.host}:${config.port}`);
  });

  const shutdown = (): void => {
    console.info('[fenix] apagando…');
    void sockets.close().then(() => httpServer.close(() => process.exit(0)));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
