import {
  DEFAULT_APPEARANCE,
  Direction,
  MOVE_DURATION_MS,
  Terrain,
  TileMap,
  type EntityId,
} from '@fenix/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { World } from '../domain/world';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

const G = Terrain.Grass;
const W = Terrain.Water;
// 3x3 con agua en la columna derecha.
const map = new TileMap({ width: 3, height: 3, terrain: [G, G, W, G, G, W, G, G, W] });

describe('GameApplication', () => {
  let clock: FakeClock;
  let notifier: RecordingNotifier;
  let app: GameApplication;

  beforeEach(() => {
    clock = new FakeClock();
    notifier = new RecordingNotifier();
    app = new GameApplication({
      world: new World(map, { x: 1, y: 1 }),
      clock,
      ids: new SequentialIds(),
      random: new FixedRandom(),
      notifier,
    });
  });

  function join(name: string): EntityId {
    const result = app.join({ type: 'join', name, appearance: DEFAULT_APPEARANCE });
    if (!result.ok) throw new Error(result.reason);
    app.announceJoin(result.playerId);
    return result.playerId;
  }

  describe('ingreso', () => {
    it('envía el estado inicial al nuevo jugador y lo anuncia al resto', () => {
      const ana = join('Ana');
      notifier.clear();
      const bruno = join('Bruno');

      const [welcome] = notifier.ofType('welcome');
      expect(welcome?.to).toBe(bruno);
      expect(welcome?.message).toMatchObject({ selfId: bruno, map: { width: 3 } });
      if (welcome?.message.type === 'welcome') {
        expect(welcome.message.players.map((p) => p.id).sort()).toEqual([ana, bruno].sort());
      }
      expect(notifier.ofType('playerJoined')[0]).toMatchObject({ to: 'all', except: bruno });
    });

    it('rechaza nombres inválidos o repetidos', () => {
      join('Ana');
      expect(app.join({ type: 'join', name: 'ana', appearance: DEFAULT_APPEARANCE })).toEqual({
        ok: false,
        reason: 'Ese nombre ya está en uso.',
      });
      expect(app.join({ type: 'join', name: 'x', appearance: DEFAULT_APPEARANCE }).ok).toBe(false);
    });
  });

  describe('movimiento', () => {
    it('confirma el paso al jugador y lo difunde al resto', () => {
      const ana = join('Ana');
      notifier.clear();
      app.handle(ana, { type: 'move', direction: Direction.North, mode: 'walk', seq: 1 });

      expect(notifier.ofType('moveAck')).toEqual([
        { to: ana, message: { type: 'moveAck', seq: 1, position: { x: 1, y: 0 } } },
      ]);
      expect(notifier.ofType('playerMoved')[0]).toMatchObject({
        except: ana,
        message: { id: ana, position: { x: 1, y: 0 }, direction: Direction.North },
      });
    });

    it('corrige al cliente cuando el paso es inválido', () => {
      const ana = join('Ana');
      notifier.clear();
      app.handle(ana, { type: 'move', direction: Direction.East, mode: 'walk', seq: 4 });

      expect(notifier.ofType('moveRejected')).toEqual([
        {
          to: ana,
          message: {
            type: 'moveRejected',
            seq: 4,
            position: { x: 1, y: 1 },
            direction: Direction.East,
          },
        },
      ]);
      expect(notifier.ofType('playerMoved')).toHaveLength(0);
    });

    it('rechaza pasos que no esperan su turno', () => {
      const ana = join('Ana');
      app.handle(ana, { type: 'move', direction: Direction.North, mode: 'walk', seq: 1 });
      notifier.clear();
      app.handle(ana, { type: 'move', direction: Direction.South, mode: 'walk', seq: 2 });
      expect(notifier.ofType('moveRejected')).toHaveLength(1);

      clock.advance(MOVE_DURATION_MS.walk);
      notifier.clear();
      app.handle(ana, { type: 'move', direction: Direction.South, mode: 'walk', seq: 3 });
      expect(notifier.ofType('moveAck')).toHaveLength(1);
    });
  });

  describe('chat y salida', () => {
    it('difunde el chat limpio con el nombre del jugador', () => {
      const ana = join('Ana');
      notifier.clear();
      app.handle(ana, { type: 'chat', text: '  Hail!  ' });
      expect(notifier.deliveries).toEqual([
        {
          to: 'all',
          except: undefined,
          message: { type: 'chat', id: ana, name: 'Ana', text: 'Hail!' },
        },
      ]);
    });

    it('ignora mensajes vacíos', () => {
      const ana = join('Ana');
      notifier.clear();
      app.handle(ana, { type: 'chat', text: '   ' });
      expect(notifier.deliveries).toHaveLength(0);
    });

    it('avisa a todos cuando un jugador sale', () => {
      const ana = join('Ana');
      notifier.clear();
      app.leave(ana);
      expect(notifier.ofType('playerLeft')[0]?.message).toEqual({ type: 'playerLeft', id: ana });
      // Salir dos veces no vuelve a avisar.
      notifier.clear();
      app.leave(ana);
      expect(notifier.deliveries).toHaveLength(0);
    });
  });
});
