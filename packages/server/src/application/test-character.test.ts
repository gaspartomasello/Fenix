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
    regions: [{ name: 'Roca Alta', x: 4, y: 4, width: 2, height: 2 }],
  });
  const world = new World(map, { x: 2, y: 2 });
  const notifier = new RecordingNotifier();
  const worldClock = new WorldClock(0);
  const app = new GameApplication({
    world,
    worldClock,
    clock: new FakeClock(0),
    ids: new SequentialIds(),
    random: new FixedRandom(0.5),
    notifier,
    testCharacters: ['Gaspar'],
  });
  const join = (name: string) => {
    const result = app.join({ type: 'join', name, appearance: DEFAULT_APPEARANCE });
    if (!result.ok) throw new Error(result.reason);
    const player = world.get(result.playerId);
    if (!player) throw new Error('sin jugador');
    return player;
  };
  return { world, join, app, notifier, worldClock };
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

  it('solo un personaje de prueba puede cambiar la hora con /hora, y la ven todos', () => {
    const { join, app, notifier, worldClock } = createApp();
    const ana = join('Ana');
    const gaspar = join('Gaspar');
    app.handle(ana.id, { type: 'setHour', hour: 22 });
    expect(worldClock.timeAt(0).dayProgress).toBeCloseTo(8.5 / 24);
    app.handle(gaspar.id, { type: 'setHour', hour: 22 });
    expect(worldClock.timeAt(0).dayProgress).toBeCloseTo(22 / 24);
    expect(notifier.ofType('worldTime').at(-1)?.to).toBe('all');
  });

  it('/ir lleva a un personaje de prueba a un lugar con nombre (sin importar tildes ni mayúsculas)', () => {
    const { world, join, app, notifier } = createApp();
    const gaspar = join('Gaspar');
    app.handle(gaspar.id, { type: 'testTravel', to: 'place', place: 'roca' });
    expect(world.map.regionAt(gaspar.position)?.name).toBe('Roca Alta');

    app.handle(gaspar.id, { type: 'testTravel', to: 'place', place: 'Atlántida' });
    const last = notifier.ofType('system').at(-1)?.message;
    expect(last?.type === 'system' && last.text).toContain('No conozco ningún lugar');

    const ana = join('Ana');
    const before = ana.position;
    app.handle(ana.id, { type: 'testTravel', to: 'place', place: 'Roca Alta' });
    expect(ana.position).toEqual(before);
  });
});
