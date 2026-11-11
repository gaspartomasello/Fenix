import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import type { ServerMessage } from '@fenix/shared/protocol/messages';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
// <módulos>
import { gameWith } from '../test-support/game';
import { combatModule } from './features/combat/combat.module';
import { homeModule } from './features/home/home.module';
import { movementModule } from './features/movement/movement.module';
// </módulos>

const newGame = gameWith([movementModule, combatModule, homeModule]);

/** Dos pueblos con su santuario: la capital al oeste y otro al este. */
function createLand() {
  const map = new TileMap({
    width: 60,
    height: 10,
    terrain: new Array<Terrain>(600).fill(Terrain.Grass),
    statics: [
      { kind: 'shrine', x: 5, y: 5 },
      { kind: 'shrine', x: 50, y: 5 },
    ],
    regions: [
      { name: 'Capital', x: 0, y: 0, width: 12, height: 10 },
      { name: 'Villa Este', x: 44, y: 0, width: 16, height: 10 },
    ],
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 3, y: 3 });
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
  const texts = (): string[] =>
    notifier
      .ofType('system')
      .map((d) => (d.message as Extract<ServerMessage, { type: 'system' }>).text);
  const run = (ms: number): void => {
    for (let t = 0; t < ms; t += 100) {
      clock.advance(100);
      app.tick(clock.now());
    }
  };
  return { world, app, player, texts, run };
}

describe('el hogar: el santuario al que vuelve un fantasma', () => {
  it('se elige un santuario de al lado; al morir se avisa; "home" lleva ahí y resucita', () => {
    const f = createLand();
    f.player.teleport({ x: 30, y: 5 });
    f.app.handle(f.player.id, { type: 'setHome', position: { x: 50, y: 5 } });
    expect(f.texts().at(-1)).toMatch(/Acercate/);
    f.player.teleport({ x: 49, y: 6 });
    f.app.handle(f.player.id, { type: 'setHome', position: { x: 50, y: 5 } });
    expect(f.player.home).toEqual({ x: 50, y: 5 });
    expect(f.texts().at(-1)).toMatch(/Villa Este/);

    // Lejos, se muere.
    f.player.teleport({ x: 25, y: 5 });
    f.app.handle(f.player.id, { type: 'goHome' });
    expect(f.texts().at(-1)).toMatch(/Solo los fantasmas/);
    f.player.combat.takeDamage(10_000);
    f.app.kernel.events.emit('playerDied', { player: f.player });
    expect(f.texts().at(-1)).toMatch(/Escribí «home».*Villa Este/);
    f.app.handle(f.player.id, { type: 'goHome' });
    expect(Math.abs(f.player.position.x - 50)).toBeLessThanOrEqual(3);
    f.run(1000);
    expect(f.player.combat.isDead).toBe(false);
  });

  it('sin elegir, el hogar es el santuario de la capital', () => {
    const f = createLand();
    f.player.teleport({ x: 40, y: 5 });
    f.player.combat.takeDamage(10_000);
    f.app.handle(f.player.id, { type: 'goHome' });
    expect(Math.abs(f.player.position.x - 5)).toBeLessThanOrEqual(3);
  });
});
