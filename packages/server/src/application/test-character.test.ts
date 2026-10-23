import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { equipTestCharacter } from '../domain/testing/test-character';
import { createGame } from './game';

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
  const app = createGame({
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
  it('Gaspar entra con todo al máximo y reactivos de sobra en su bolsa, sin oro', () => {
    const { world, join } = createApp();
    const gaspar = join('gaspar');
    expect(gaspar.skills.get('magery')).toBe(1000);
    expect(gaspar.skills.get('cooking')).toBe(1000);
    expect(gaspar.combat.baseAttributes).toEqual({
      strength: 120,
      dexterity: 120,
      intelligence: 120,
    });
    expect(gaspar.combat.current.mana).toBe(120);
    expect(world.items.countInBackpack(gaspar.id, 'gold')).toBe(0);
    expect(world.items.countInBackpack(gaspar.id, 'nightshade')).toBe(1000);
    const bag = world.items.backpackOf(gaspar.id).find((i) => i.kind === 'bag');
    expect(world.items.contentsOf(bag?.id ?? '').some((i) => i.kind === 'nightshade')).toBe(true);
    // Entra vestido (camisa y pantalón), no en ropa interior.
    expect(world.items.lookOf(gaspar.id)).toMatchObject({ torso: 'shirt', legs: 'trousers' });
  });

  it('a Gaspar se le saca el oro una sola vez: lo que gane después lo conserva', () => {
    const { world, join } = createApp();
    const gaspar = join('Gaspar');
    gaspar.testKit = 1;
    world.items.add('oro-viejo', 'gold', 60_000, {
      type: 'bank',
      ownerId: gaspar.id,
      position: { x: 0, y: 0 },
    });
    equipTestCharacter(gaspar, world, () => 'id-nuevo');
    expect(world.items.bankOf(gaspar.id).some((i) => i.kind === 'gold')).toBe(false);
    world.items.add('oro-ganado', 'gold', 30, {
      type: 'backpack',
      ownerId: gaspar.id,
      position: { x: 0, y: 0 },
    });
    equipTestCharacter(gaspar, world, () => 'id-otro');
    expect(world.items.countInBackpack(gaspar.id, 'gold')).toBe(30);
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

  it('/invul vuelve invulnerable a un personaje de prueba: amarillo y sin daño', () => {
    const { world, join, app, notifier } = createApp();
    const gaspar = join('Gaspar');
    expect(world.snapshotOf(gaspar).notoriety).toBe('innocent');
    app.handle(gaspar.id, { type: 'toggleInvulnerable' });
    expect(world.snapshotOf(gaspar).notoriety).toBe('invulnerable');
    expect(notifier.ofType('mobileStatus').at(-1)?.message).toMatchObject({
      notoriety: 'invulnerable',
    });
    expect(gaspar.combat.takeDamage(500)).toBe(false);
    expect(gaspar.combat.health).toBe(1);
    app.handle(gaspar.id, { type: 'toggleInvulnerable' });
    expect(world.snapshotOf(gaspar).notoriety).toBe('innocent');

    const ana = join('Ana');
    app.handle(ana.id, { type: 'toggleInvulnerable' });
    expect(world.snapshotOf(ana).notoriety).toBe('innocent');
  });
});
