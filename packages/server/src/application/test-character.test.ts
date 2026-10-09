import { DEFAULT_APPEARANCE, Terrain, TileMap } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

function createApp() {
  const map = new TileMap({
    width: 6,
    height: 6,
    terrain: new Array<Terrain>(36).fill(Terrain.Grass),
    statics: [],
  });
  const world = new World(map, { x: 2, y: 2 });
  const app = new GameApplication({
    world,
    worldClock: new WorldClock(0),
    clock: new FakeClock(0),
    ids: new SequentialIds(),
    random: new FixedRandom(0.5),
    notifier: new RecordingNotifier(),
    testCharacters: ['Gaspar'],
  });
  const join = (name: string) => {
    const result = app.join({ type: 'join', name, appearance: DEFAULT_APPEARANCE });
    if (!result.ok) throw new Error(result.reason);
    const player = world.get(result.playerId);
    if (!player) throw new Error('sin jugador');
    return player;
  };
  return { world, join };
}

describe('personaje de prueba', () => {
  it('Gaspar entra con todo al máximo, oro y reactivos de sobra', () => {
    const { world, join } = createApp();
    const gaspar = join('gaspar');
    expect(gaspar.skills.get('magery')).toBe(1000);
    expect(gaspar.skills.get('cooking')).toBe(1000);
    expect(gaspar.combat.baseAttributes).toEqual({
      strength: 100,
      dexterity: 100,
      intelligence: 100,
    });
    expect(gaspar.combat.current.mana).toBe(100);
    expect(world.items.countInBackpack(gaspar.id, 'gold')).toBe(999_999);
    expect(world.items.countInBackpack(gaspar.id, 'nightshade')).toBe(1000);
  });

  it('los demás entran normales', () => {
    const { world, join } = createApp();
    const ana = join('Ana');
    expect(ana.skills.get('magery')).toBe(300);
    expect(world.items.countInBackpack(ana.id, 'gold')).toBe(50);
  });
});
