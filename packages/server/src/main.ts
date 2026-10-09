import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameApplication } from './application/game-application';
import { WorldClock } from './domain/world-clock';
import { loadConfig } from './infrastructure/config';
import { createWorld } from './infrastructure/content/world-builder';
import { createHttpServer } from './infrastructure/http/static-server';
import { GameSocketServer } from './infrastructure/network/game-socket-server';
import { SessionRegistry } from './infrastructure/network/session-registry';
import { JsonFileCharacterStore } from './infrastructure/persistence/json-file-character-store';
import { ScryptPasswordHasher } from './infrastructure/system/scrypt-password-hasher';
import { SeededRandom } from './infrastructure/system/seeded-random';
import { SystemClock } from './infrastructure/system/system-clock';
import { startTicker } from './infrastructure/system/ticker';
import { UuidGenerator } from './infrastructure/system/uuid-generator';

/** Raíz de composición: el único lugar que conoce todas las piezas concretas. */
function main(): void {
  // src/main.ts y dist/main.js están al mismo nivel: el cliente queda en ../../client/dist.
  const config = loadConfig(fileURLToPath(new URL('../../client/dist', import.meta.url)));
  const ids = new UuidGenerator();
  const world = createWorld({ size: config.mapSize, seed: config.mapSeed }, ids);
  const sessions = new SessionRegistry();
  const clock = new SystemClock();
  const characters = new JsonFileCharacterStore(join(config.dataDir, 'personajes.json'));
  const app = new GameApplication({
    world,
    worldClock: new WorldClock(clock.now(), config.startHour),
    clock,
    ids,
    random: new SeededRandom(Date.now()),
    notifier: sessions,
    characters,
    passwords: new ScryptPasswordHasher(),
    testCharacters: config.testCharacters,
  });

  const stopTicker = startTicker(
    (now) => app.tick(now),
    () => clock.now(),
  );
  const httpServer = createHttpServer(config.clientDist);
  const sockets = new GameSocketServer(httpServer, app, sessions);

  httpServer.listen(config.port, config.host, () => {
    console.info(`[fenix] servidor escuchando en http://${config.host}:${config.port}`);
  });

  const shutdown = (): void => {
    console.info('[fenix] apagando…');
    stopTicker();
    app.saveAll();
    characters.flush();
    void sockets.close().then(() => httpServer.close(() => process.exit(0)));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
