import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import { DYE_FAMILIES, dyeName, isDyeHue } from '@fenix/shared/items/dyes';
import type { PlayerEquipmentMessage } from '@fenix/shared/protocol/messages';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { captureCharacter, parseSavedCharacter } from '../domain/persistence/saved-character';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
// <módulos>
import { gameWith } from '../test-support/game';
import { itemsModule } from './features/items/items.module';
import { dyeingModule } from './features/dyeing/dyeing.module';
// </módulos>

const newGame = gameWith([itemsModule, dyeingModule]);

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
  const app = newGame({
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
  const give = (
    id: string,
    kind: 'dye-tub' | 'dyes' | 'shirt' | 'plate-helm' | 'bag',
    amount = 1,
  ) =>
    world.items.add(id, kind, amount, { type: 'backpack', ownerId: ana, position: { x: 0, y: 0 } });
  return { world, app, notifier, ana, give };
}

describe('tinturas', () => {
  it('con la tina y tinturas se tiñe la ropa puesta, los demás la ven y se guarda', () => {
    const { world, app, notifier, ana, give } = createRoom();
    const tub = give('tina', 'dye-tub');
    give('tinturas', 'dyes', 2);
    const shirt = give('camisa', 'shirt');
    app.handle(ana, { type: 'useItem', itemId: shirt.id });
    expect(shirt.location.type).toBe('equipment');
    // Sin elegir el color en el panel de la tina, no tiñe.
    app.handle(ana, { type: 'dye', itemId: shirt.id, hue: 0xb02a2a });
    expect(shirt.hue).toBeNull();
    app.handle(ana, { type: 'tintTub', tubId: tub.id, hue: 0xb02a2a });
    expect(tub.hue).toBe(0xb02a2a);
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

  it('el panel de la tina tiene cada tono con sus matices y los grises, todos con nombre', () => {
    expect(DYE_FAMILIES.length).toBe(19);
    const all = DYE_FAMILIES.flatMap((f) => f.hues);
    expect(new Set(all).size).toBe(all.length);
    expect(all.every(isDyeHue)).toBe(true);
    expect(dyeName(DYE_FAMILIES[0]?.hues[5] ?? 0)).toBe('rojo muy oscuro');
    // Los colores de antes siguen valiendo.
    expect(isDyeHue(0x7a1424)).toBe(true);
  });

  it('la tina toma el color elegido y con ella se tiñe también una bolsa', () => {
    const { world, app, ana, give } = createRoom();
    const tub = give('tina', 'dye-tub');
    give('tinturas', 'dyes', 1);
    const bag = give('bolsa', 'bag');
    const green = DYE_FAMILIES.find((f) => f.name === 'esmeralda')?.hues[2] ?? 0;
    app.handle(ana, { type: 'tintTub', tubId: tub.id, hue: green });
    expect(tub.hue).toBe(green);
    app.handle(ana, { type: 'dye', itemId: bag.id, hue: green });
    expect(bag.hue).toBe(green);
    expect(world.items.countInBackpack(ana, 'dyes')).toBe(0);
  });
});
