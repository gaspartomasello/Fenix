import {
  DEFAULT_APPEARANCE,
  Direction,
  MOVE_DURATION_MS,
  Terrain,
  TileMap,
  VIEW_RANGE,
  type EntityId,
} from '@fenix/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

const G = Terrain.Grass;
const W = Terrain.Water;
// 3x3 con agua en la columna derecha.
const smallMap = new TileMap({ width: 3, height: 3, terrain: [G, G, W, G, G, W, G, G, W] });

function createApp(map: TileMap, spawn = { x: 1, y: 1 }) {
  const clock = new FakeClock();
  const notifier = new RecordingNotifier();
  const world = new World(map, spawn);
  const app = new GameApplication({
    world,
    worldClock: new WorldClock(clock.now()),
    clock,
    ids: new SequentialIds(),
    random: new FixedRandom(),
    notifier,
  });
  const join = (name: string): EntityId => {
    const result = app.join({ type: 'join', name, appearance: DEFAULT_APPEARANCE });
    if (!result.ok) throw new Error(result.reason);
    app.announceJoin(result.playerId);
    return result.playerId;
  };
  return { app, clock, notifier, world, join };
}

describe('GameApplication', () => {
  let ctx: ReturnType<typeof createApp>;

  beforeEach(() => {
    ctx = createApp(smallMap);
  });

  describe('ingreso', () => {
    it('envía el estado inicial con la hora del mundo y lo muestra a quienes están cerca', () => {
      const ana = ctx.join('Ana');
      ctx.notifier.clear();
      const bruno = ctx.join('Bruno');

      const [welcome] = ctx.notifier.ofType('welcome');
      expect(welcome?.to).toBe(bruno);
      if (welcome?.message.type !== 'welcome') throw new Error('sin welcome');
      expect(welcome.message.players.map((p) => p.id).sort()).toEqual([ana, bruno].sort());
      expect(welcome.message.time.dayProgress).toBeGreaterThanOrEqual(0);
      expect(ctx.notifier.ofType('playerAppeared')).toEqual([
        {
          to: ana,
          message: { type: 'playerAppeared', player: expect.objectContaining({ id: bruno }) },
        },
      ]);
    });

    it('rechaza nombres inválidos o repetidos', () => {
      ctx.join('Ana');
      expect(ctx.app.join({ type: 'join', name: 'ana', appearance: DEFAULT_APPEARANCE })).toEqual({
        ok: false,
        reason: 'Ese nombre ya está en uso.',
      });
      expect(ctx.app.join({ type: 'join', name: 'x', appearance: DEFAULT_APPEARANCE }).ok).toBe(
        false,
      );
    });
  });

  describe('movimiento', () => {
    it('confirma el paso al jugador y lo difunde a quienes lo ven', () => {
      const ana = ctx.join('Ana');
      const bruno = ctx.join('Bruno');
      ctx.notifier.clear();
      ctx.app.handle(ana, { type: 'move', direction: Direction.North, mode: 'walk', seq: 1 });

      expect(ctx.notifier.ofType('moveAck')).toEqual([
        { to: ana, message: { type: 'moveAck', seq: 1, position: { x: 1, y: 0 } } },
      ]);
      expect(ctx.notifier.ofType('playerMoved')).toEqual([
        {
          to: bruno,
          message: expect.objectContaining({ id: ana, position: { x: 1, y: 0 } }),
        },
      ]);
    });

    it('corrige al cliente cuando el paso es inválido', () => {
      const ana = ctx.join('Ana');
      ctx.notifier.clear();
      ctx.app.handle(ana, { type: 'move', direction: Direction.East, mode: 'walk', seq: 4 });

      expect(ctx.notifier.ofType('moveRejected')).toEqual([
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
      expect(ctx.notifier.ofType('playerMoved')).toHaveLength(0);
    });

    it('rechaza pasos que no esperan su turno', () => {
      const ana = ctx.join('Ana');
      ctx.app.handle(ana, { type: 'move', direction: Direction.North, mode: 'walk', seq: 1 });
      ctx.notifier.clear();
      ctx.app.handle(ana, { type: 'move', direction: Direction.South, mode: 'walk', seq: 2 });
      expect(ctx.notifier.ofType('moveRejected')).toHaveLength(1);

      ctx.clock.advance(MOVE_DURATION_MS.walk);
      ctx.notifier.clear();
      ctx.app.handle(ana, { type: 'move', direction: Direction.South, mode: 'walk', seq: 3 });
      expect(ctx.notifier.ofType('moveAck')).toHaveLength(1);
    });
  });

  describe('rango de visión', () => {
    // Pasillo largo: Bruno queda justo al borde del rango de Ana.
    const corridor = new TileMap({
      width: VIEW_RANGE + 4,
      height: 1,
      terrain: new Array(VIEW_RANGE + 4).fill(G),
    });

    it('al alejarse, cada uno ve desaparecer al otro; al acercarse, aparecer', () => {
      const far = createApp(corridor, { x: 0, y: 0 });
      const ana = far.join('Ana');
      const bruno = far.join('Bruno');
      // Ubicar a Bruno a VIEW_RANGE tiles de Ana caminando.
      for (let i = 0; i < VIEW_RANGE; i++) {
        far.clock.advance(MOVE_DURATION_MS.walk);
        far.app.handle(bruno, {
          type: 'move',
          direction: Direction.East,
          mode: 'walk',
          seq: i + 1,
        });
      }
      far.notifier.clear();

      far.clock.advance(MOVE_DURATION_MS.walk);
      far.app.handle(bruno, { type: 'move', direction: Direction.East, mode: 'walk', seq: 100 });
      expect(far.notifier.ofType('playerDisappeared')).toEqual([
        { to: ana, message: { type: 'playerDisappeared', id: bruno } },
        { to: bruno, message: { type: 'playerDisappeared', id: ana } },
      ]);
      expect(far.notifier.ofType('playerMoved')).toHaveLength(0);

      far.notifier.clear();
      far.clock.advance(MOVE_DURATION_MS.walk);
      far.app.handle(bruno, { type: 'move', direction: Direction.West, mode: 'walk', seq: 101 });
      expect(
        far.notifier
          .ofType('playerAppeared')
          .map((d) => d.to)
          .sort(),
      ).toEqual([ana, bruno].sort());
    });

    it('solo oyen el chat quienes están cerca', () => {
      const far = createApp(corridor, { x: 0, y: 0 });
      const ana = far.join('Ana');
      const bruno = far.join('Bruno');
      for (let i = 0; i <= VIEW_RANGE; i++) {
        far.clock.advance(MOVE_DURATION_MS.walk);
        far.app.handle(bruno, {
          type: 'move',
          direction: Direction.East,
          mode: 'walk',
          seq: i + 1,
        });
      }
      far.notifier.clear();
      far.app.handle(ana, { type: 'chat', text: '¿Hola?' });
      expect(far.notifier.ofType('chat').map((d) => d.to)).toEqual([ana]);
    });
  });

  describe('chat y salida', () => {
    it('difunde el chat limpio con el nombre del jugador', () => {
      const ana = ctx.join('Ana');
      ctx.notifier.clear();
      ctx.app.handle(ana, { type: 'chat', text: '  Hail!  ' });
      expect(ctx.notifier.deliveries).toEqual([
        { to: ana, message: { type: 'chat', id: ana, name: 'Ana', text: 'Hail!' } },
      ]);
    });

    it('ignora mensajes vacíos', () => {
      const ana = ctx.join('Ana');
      ctx.notifier.clear();
      ctx.app.handle(ana, { type: 'chat', text: '   ' });
      expect(ctx.notifier.deliveries).toHaveLength(0);
    });

    it('avisa a quienes lo veían cuando un jugador sale', () => {
      const ana = ctx.join('Ana');
      const bruno = ctx.join('Bruno');
      ctx.notifier.clear();
      ctx.app.leave(ana);
      expect(ctx.notifier.ofType('playerDisappeared')).toEqual([
        { to: bruno, message: { type: 'playerDisappeared', id: ana } },
      ]);
      ctx.notifier.clear();
      ctx.app.leave(ana);
      expect(ctx.notifier.deliveries).toHaveLength(0);
    });
  });
});
