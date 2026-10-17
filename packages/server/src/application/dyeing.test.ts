import { DEFAULT_APPEARANCE, Terrain, TileMap, type PlayerEquipmentMessage } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { captureCharacter, parseSavedCharacter } from '../domain/persistence/saved-character';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

function createRoom() {
  const map = new TileMap({
    width: 10,
    height: 10,
    terrain: new Array<Terrain>(100).fill(Terrain.Grass),
    statics: [],
    regions: [],
  });
  const world = new World(map, { x: 5, y: 5 });
  const notifier = new RecordingNotifier();
  const app = new GameApplication({
    world,
    worldClock: new WorldClock(0),
    clock: new FakeClock(0),
    ids: new SequentialIds(),
    random: new FixedRandom(0.1),
    notifier,
  });
  const result = app.join({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
  if (!result.ok) throw new Error(result.reason);
  app.announceJoin(result.playerId);
  const ana = result.playerId;
  const give = (id: string, kind: 'dye-tub' | 'dyes' | 'shirt' | 'plate-helm', amount = 1) =>
    world.items.add(id, kind, amount, { type: 'backpack', ownerId: ana, position: { x: 0, y: 0 } });
  return { world, app, notifier, ana, give };
}

describe('tinturas', () => {
  it('con la tina y tinturas se tiñe la ropa puesta, los demás la ven y se guarda', () => {
    const { world, app, notifier, ana, give } = createRoom();
    give('tina', 'dye-tub');
    give('tinturas', 'dyes', 2);
    const shirt = give('camisa', 'shirt');
    app.handle(ana, { type: 'useItem', itemId: shirt.id });
    expect(shirt.location.type).toBe('equipment');
    app.handle(ana, { type: 'dye', itemId: shirt.id, hue: 0xb02a2a });
    expect(shirt.hue).toBe(0xb02a2a);
    expect(world.items.countInBackpack(ana, 'dyes')).toBe(1);
    const look = notifier.ofType('playerEquipment').at(-1)?.message as PlayerEquipmentMessage;
    expect(look.hues?.torso).toBe(0xb02a2a);
    const player = world.get(ana);
    if (!player) throw new Error('sin jugador');
    const saved = parseSavedCharacter(
      JSON.parse(JSON.stringify(captureCharacter(player, world, null))),
    );
    expect(saved?.items.find((i) => i.kind === 'shirt')?.hue).toBe(0xb02a2a);
  });

  it('sin tina, sin tinturas, con metal o con un color inventado no se tiñe', () => {
    const { world, app, ana, give } = createRoom();
    const shirt = give('camisa', 'shirt');
    app.handle(ana, { type: 'dye', itemId: shirt.id, hue: 0xb02a2a });
    expect(shirt.hue).toBeNull();
    give('tina', 'dye-tub');
    app.handle(ana, { type: 'dye', itemId: shirt.id, hue: 0xb02a2a });
    expect(shirt.hue).toBeNull();
    give('tinturas', 'dyes', 3);
    const helm = give('yelmo', 'plate-helm');
    app.handle(ana, { type: 'dye', itemId: helm.id, hue: 0xb02a2a });
    expect(helm.hue).toBeNull();
    app.handle(ana, { type: 'dye', itemId: shirt.id, hue: 0x123456 });
    expect(shirt.hue).toBeNull();
    expect(world.items.countInBackpack(ana, 'dyes')).toBe(3);
  });
});
