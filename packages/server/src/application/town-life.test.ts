import { DEFAULT_APPEARANCE, Terrain, TileMap } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { Npc } from '../domain/npcs/npc';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

function createTown() {
  const map = new TileMap({
    width: 30,
    height: 30,
    terrain: new Array<Terrain>(900).fill(Terrain.Grass),
    statics: [],
    regions: [{ name: 'Pueblo', x: 0, y: 0, width: 30, height: 30 }],
  });
  const world = new World(map, { x: 15, y: 15 });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const app = new GameApplication({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids: new SequentialIds(),
    random: new FixedRandom(0.9),
    notifier,
  });
  const join = (name: string) => {
    const result = app.join({ type: 'join', name, appearance: DEFAULT_APPEARANCE });
    if (!result.ok) throw new Error(result.reason);
    app.announceJoin(result.playerId);
    const player = world.get(result.playerId);
    if (!player) throw new Error('sin jugador');
    return player;
  };
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 100) {
      clock.advance(100);
      app.tick(clock.now());
    }
  };
  return { world, join, run, notifier, clock };
}

describe('la vida en la ciudad', () => {
  it('los vecinos pasean cerca de su casa', () => {
    const { world, join, run } = createTown();
    join('Ana');
    const vecina = new Npc('npc-1', 'townsfolk', { x: 10, y: 10 }, 'Marta');
    world.addNpc(vecina);
    const visited = new Set<string>();
    for (let i = 0; i < 60; i++) {
      run(500);
      visited.add(`${vecina.position.x},${vecina.position.y}`);
      expect(
        Math.max(Math.abs(vecina.position.x - 10), Math.abs(vecina.position.y - 10)),
      ).toBeLessThanOrEqual(7);
    }
    expect(visited.size).toBeGreaterThan(1);
  });

  it('un guardia le grita a un criminal en la ciudad y lo ajusticia', () => {
    const { world, join, run, notifier, clock } = createTown();
    const guardia = new Npc('npc-2', 'guard', { x: 12, y: 12 }, 'guardia');
    world.addNpc(guardia);
    const ana = join('Ana');
    ana.reputation.markCriminal(clock.now());
    run(500);
    expect(
      notifier
        .ofType('system')
        .some((m) => /Alto ahí, criminal/.test((m.message as { text: string }).text)),
    ).toBe(true);
    expect(ana.combat.isDead).toBe(false);
    run(3000);
    expect(ana.combat.isDead).toBe(true);
  });

  it('a un inocente no lo toca', () => {
    const { world, join, run } = createTown();
    world.addNpc(new Npc('npc-3', 'guard', { x: 12, y: 12 }, 'guardia'));
    const ana = join('Ana');
    run(5000);
    expect(ana.combat.isDead).toBe(false);
  });
});
