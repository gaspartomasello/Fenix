import type { AddressInfo } from 'node:net';
import {
  DEFAULT_APPEARANCE,
  Direction,
  decodeServerMessage,
  encodeMessage,
  type ClientMessage,
  type ServerMessage,
} from '@fenix/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { GameApplication } from '../../application/game-application';
import { World } from '../../domain/world';
import { WorldClock } from '../../domain/world-clock';
import { generateIslandMap } from '../content/procedural-map';
import { createHttpServer } from '../http/static-server';
import { SeededRandom } from '../system/seeded-random';
import { SystemClock } from '../system/system-clock';
import { UuidGenerator } from '../system/uuid-generator';
import { GameSocketServer, WEBSOCKET_PATH } from './game-socket-server';
import { SessionRegistry } from './session-registry';

/** Cliente de prueba que acumula mensajes y permite esperar uno en particular. */
class TestClient {
  private readonly inbox: ServerMessage[] = [];
  private waiters: (() => void)[] = [];

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (data) => {
      const decoded = decodeServerMessage(data.toString());
      if (decoded.ok) this.inbox.push(decoded.message);
      this.waiters.forEach((wake) => wake());
    });
  }

  static connect(url: string): Promise<TestClient> {
    const socket = new WebSocket(url);
    return new Promise((resolve, reject) => {
      socket.once('open', () => resolve(new TestClient(socket)));
      socket.once('error', reject);
    });
  }

  send(message: ClientMessage): void {
    this.socket.send(encodeMessage(message));
  }

  async next<T extends ServerMessage['type']>(
    type: T,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const deadline = Date.now() + 2000;
    for (;;) {
      const index = this.inbox.findIndex((m) => m.type === type);
      if (index >= 0) {
        return this.inbox.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>;
      }
      if (Date.now() > deadline) throw new Error(`No llegó un mensaje "${type}"`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 50);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
      this.waiters = [];
    }
  }

  close(): void {
    this.socket.close();
  }
}

describe('GameSocketServer (integración)', () => {
  let url: string;
  let shutdown: () => Promise<void>;

  beforeEach(async () => {
    const { map, spawnPoint } = generateIslandMap({ width: 48, height: 48, seed: 7 });
    const sessions = new SessionRegistry();
    const app = new GameApplication({
      world: new World(map, spawnPoint),
      worldClock: new WorldClock(0),
      clock: new SystemClock(),
      ids: new UuidGenerator(),
      random: new SeededRandom(1),
      notifier: sessions,
    });
    const http = createHttpServer(null);
    const sockets = new GameSocketServer(http, app, sessions);
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    url = `ws://127.0.0.1:${(http.address() as AddressInfo).port}${WEBSOCKET_PATH}`;
    shutdown = async () => {
      await sockets.close();
      await new Promise((resolve) => http.close(resolve));
    };
  });

  afterEach(async () => {
    await shutdown();
  });

  it('dos jugadores se ven, se mueven y chatean en tiempo real', async () => {
    const ana = await TestClient.connect(url);
    ana.send({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
    const anaWelcome = await ana.next('welcome');
    expect(anaWelcome.players).toHaveLength(1);

    const bruno = await TestClient.connect(url);
    bruno.send({ type: 'join', name: 'Bruno', appearance: DEFAULT_APPEARANCE });
    const brunoWelcome = await bruno.next('welcome');
    expect(brunoWelcome.players).toHaveLength(2);
    expect((await ana.next('playerAppeared')).player.name).toBe('Bruno');

    ana.send({ type: 'move', direction: Direction.North, mode: 'walk', seq: 1 });
    expect((await ana.next('moveAck')).seq).toBe(1);
    const moved = await bruno.next('playerMoved');
    expect(moved.id).toBe(anaWelcome.selfId);

    bruno.send({ type: 'chat', text: 'Hail, Ana!' });
    expect((await ana.next('chat')).text).toBe('Hail, Ana!');

    bruno.close();
    expect((await ana.next('playerDisappeared')).id).toBe(brunoWelcome.selfId);
    ana.close();
  });

  it('rechaza el ingreso con un nombre inválido', async () => {
    const client = await TestClient.connect(url);
    client.send({ type: 'join', name: '!!', appearance: DEFAULT_APPEARANCE });
    expect((await client.next('joinRejected')).reason).toMatch(/letras/);
    client.close();
  });
});
