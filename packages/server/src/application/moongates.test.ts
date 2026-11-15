import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import { Direction } from '@fenix/shared/geometry/direction';
import type { ServerMessage } from '@fenix/shared/protocol/messages';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
// <módulos>
import { gameWith } from '../test-support/game';
import { moongatesModule } from './features/moongates/moongates.module';
import { movementModule } from './features/movement/movement.module';
// </módulos>

const newGame = gameWith([movementModule, moongatesModule]);

/** Dos ciudades con portal en las afueras: Puerto Ceniza al oeste y Roca Alta al este. */
function createLand() {
  const map = new TileMap({
    width: 120,
    height: 20,
    terrain: new Array<Terrain>(2400).fill(Terrain.Grass),
    regions: [
      { name: 'Puerto Ceniza', x: 0, y: 0, width: 20, height: 20 },
      { name: 'Roca Alta', x: 100, y: 0, width: 20, height: 20 },
    ],
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 5, y: 5 });
  world.items.add('portal-oeste', 'moongate', 1, { type: 'ground', position: { x: 40, y: 10 } });
  world.items.add('portal-este', 'moongate', 1, { type: 'ground', position: { x: 80, y: 10 } });
  const app = newGame({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids: new SequentialIds(),
    random: new FixedRandom(0.5),
    notifier,
  });
  const result = app.join({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
  if (!result.ok) throw new Error(result.reason);
  app.announceJoin(result.playerId);
  const player = world.get(result.playerId);
  if (!player) throw new Error('sin jugador');
  return { app, player, notifier, clock };
}

describe('portales lunares', () => {
  it('al pisar el portal se ofrecen las otras ciudades; al elegir, se aparece al lado de su portal', () => {
    const f = createLand();
    f.player.teleport({ x: 40, y: 11 });
    f.clock.advance(1000);
    f.app.handle(f.player.id, { type: 'move', direction: Direction.North, mode: 'walk', seq: 1 });
    expect(f.player.position).toEqual({ x: 40, y: 10 });
    const menu = f.notifier.ofType('moongateMenu').at(-1)?.message as
      Extract<ServerMessage, { type: 'moongateMenu' }> | undefined;
    expect(menu?.here).toBe('Puerto Ceniza');
    expect(menu?.destinations).toEqual(['Roca Alta']);
    f.app.handle(f.player.id, { type: 'moongateTravel', destination: 'Roca Alta' });
    expect(Math.abs(f.player.position.x - 80)).toBeLessThanOrEqual(2);
    expect(f.player.position).not.toEqual({ x: 80, y: 10 });
  });

  it('lejos del portal no se puede viajar', () => {
    const f = createLand();
    f.player.teleport({ x: 30, y: 10 });
    f.app.handle(f.player.id, { type: 'moongateTravel', destination: 'Roca Alta' });
    expect(f.player.position).toEqual({ x: 30, y: 10 });
  });
});
