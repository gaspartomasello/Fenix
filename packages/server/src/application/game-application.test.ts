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
import { STARTING_KIT } from '../domain/items/starting-kit';
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
      expect(welcome.message.mobiles.map((p) => p.id).sort()).toEqual([ana, bruno].sort());
      expect(welcome.message.time.dayProgress).toBeGreaterThanOrEqual(0);
      expect(ctx.notifier.ofType('mobileAppeared')).toEqual([
        {
          to: ana,
          message: { type: 'mobileAppeared', mobile: expect.objectContaining({ id: bruno }) },
        },
      ]);
    });

    it('rechaza nombres inválidos o repetidos', () => {
      ctx.join('Ana');
      expect(ctx.app.join({ type: 'join', name: 'ana', appearance: DEFAULT_APPEARANCE })).toEqual({
        ok: false,
        reason: 'Ese personaje ya está en el mundo.',
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
      expect(ctx.notifier.ofType('mobileMoved')).toEqual([
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
      expect(ctx.notifier.ofType('mobileMoved')).toHaveLength(0);
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

    it('al pisar un teletransporte (la boca de una cueva) aparece del otro lado', () => {
      const terrain = new Array<Terrain>(5 * 3).fill(G);
      const map = new TileMap({
        width: 5,
        height: 3,
        terrain,
        teleporters: [{ x: 1, y: 0, to: { x: 4, y: 2 } }],
      });
      const cave = createApp(map);
      const ana = cave.join('Ana');
      cave.notifier.clear();
      cave.app.handle(ana, { type: 'move', direction: Direction.North, mode: 'walk', seq: 1 });

      expect(cave.world.get(ana)?.position).toEqual({ x: 4, y: 2 });
      expect(cave.notifier.ofType('mobileTeleported')).toEqual([
        {
          to: ana,
          message: { type: 'mobileTeleported', id: ana, position: { x: 4, y: 2 } },
        },
      ]);
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
      expect(far.notifier.ofType('mobileDisappeared')).toEqual([
        { to: ana, message: { type: 'mobileDisappeared', id: bruno } },
        { to: bruno, message: { type: 'mobileDisappeared', id: ana } },
      ]);
      expect(far.notifier.ofType('mobileMoved')).toHaveLength(0);

      far.notifier.clear();
      far.clock.advance(MOVE_DURATION_MS.walk);
      far.app.handle(bruno, { type: 'move', direction: Direction.West, mode: 'walk', seq: 101 });
      expect(
        far.notifier
          .ofType('mobileAppeared')
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

  describe('objetos', () => {
    it('al entrar recibe su mochila con el kit inicial y los objetos cercanos del suelo', () => {
      ctx.world.items.add('floor', 'apple', 2, { type: 'ground', position: { x: 0, y: 0 } });
      ctx.notifier.clear();
      const ana = ctx.join('Ana');
      const [inventory] = ctx.notifier.ofType('inventory');
      if (inventory?.message.type !== 'inventory') throw new Error('sin inventario');
      expect(inventory.to).toBe(ana);
      expect(inventory.message.backpack.map((i) => i.kind)).toEqual(
        STARTING_KIT.map((i) => i.kind),
      );
      expect(ctx.notifier.ofType('groundItems')).toEqual([
        {
          to: ana,
          message: {
            type: 'groundItems',
            added: [expect.objectContaining({ id: 'floor' })],
            removed: [],
          },
        },
      ]);
    });

    it('al equiparse algo, quienes lo ven reciben su nuevo aspecto', () => {
      const ana = ctx.join('Ana');
      const bruno = ctx.join('Bruno');
      const dagger = ctx.world.items.backpackOf(ana).find((i) => i.kind === 'dagger');
      ctx.notifier.clear();
      ctx.app.handle(ana, { type: 'useItem', itemId: dagger?.id ?? '' });
      expect(
        ctx.notifier
          .ofType('playerEquipment')
          .map((d) => d.to)
          .sort(),
      ).toEqual([ana, bruno].sort());
      expect(ctx.notifier.ofType('inventory').map((d) => d.to)).toEqual([ana]);
    });

    it('avisa por qué no se pudo mover un objeto', () => {
      const ana = ctx.join('Ana');
      ctx.notifier.clear();
      ctx.app.handle(ana, { type: 'moveItem', itemId: 'nada', to: { type: 'backpack' } });
      expect(ctx.notifier.ofType('system')).toEqual([
        { to: ana, message: { type: 'system', text: 'Ese objeto ya no está.' } },
      ]);
    });
  });

  describe('chat y salida', () => {
    it('difunde el chat limpio con el nombre del jugador', () => {
      const ana = ctx.join('Ana');
      ctx.notifier.clear();
      ctx.app.handle(ana, { type: 'chat', text: '  Hail!  ' });
      expect(ctx.notifier.deliveries).toEqual([
        { to: ana, message: { type: 'chat', id: ana, name: 'Ana', text: 'Hail!', channel: 'say' } },
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
      expect(ctx.notifier.ofType('mobileDisappeared')).toEqual([
        { to: bruno, message: { type: 'mobileDisappeared', id: ana } },
      ]);
      ctx.notifier.clear();
      ctx.app.leave(ana);
      expect(ctx.notifier.deliveries).toHaveLength(0);
    });
  });
});
