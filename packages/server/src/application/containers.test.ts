import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import { staticContainerId } from '@fenix/shared/world/statics';
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
import { economyModule } from './features/economy/economy.module';
import { containersModule } from './features/containers/containers.module';
// </módulos>

const newGame = gameWith([itemsModule, economyModule, containersModule]);

function createRoom() {
  const map = new TileMap({
    width: 10,
    height: 10,
    terrain: new Array<Terrain>(100).fill(Terrain.Grass),
    statics: [{ kind: 'chest', x: 5, y: 4 }],
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
  const join = (name: string) => {
    const result = app.join({ type: 'join', name, appearance: DEFAULT_APPEARANCE });
    if (!result.ok) throw new Error(result.reason);
    app.announceJoin(result.playerId);
    return result.playerId;
  };
  return { world, app, notifier, join };
}

describe('recipientes', () => {
  it('un cofre del mundo se abre, trae cosas, y se pueden sacar y guardar', () => {
    const { world, app, notifier, join } = createRoom();
    const ana = join('Ana');
    world.get(ana)?.teleport({ x: 5, y: 5 });
    const chest = staticContainerId({ x: 5, y: 4 });
    app.handle(ana, { type: 'openContainer', containerId: chest });
    const opened = notifier.ofType('container').at(-1)?.message as unknown as {
      items: unknown[];
      name: string;
    };
    expect(opened.name).toBe('cofre');
    expect(opened.items.length).toBeGreaterThan(0);
    const gold = world.items.contentsOf(chest).find((i) => i.kind === 'gold');
    expect(gold).toBeDefined();
    if (!gold) return;
    const before = world.items.countInBackpack(ana, 'gold');
    app.handle(ana, { type: 'moveItem', itemId: gold.id, to: { type: 'backpack' } });
    expect(world.items.countInBackpack(ana, 'gold')).toBe(before + gold.amount);
    const apple = world.items.backpackOf(ana).find((i) => i.kind !== 'gold');
    if (!apple) return;
    app.handle(ana, {
      type: 'moveItem',
      itemId: apple.id,
      to: { type: 'container', containerId: chest },
    });
    expect(world.items.contentsOf(chest).some((i) => i.id === apple.id)).toBe(true);
  });

  it('una bolsa guarda cosas, no entra en sí misma, y se guarda con el personaje', () => {
    const { world, app, join } = createRoom();
    const ana = join('Ana');
    const bag = world.items.add('bolsa-1', 'bag', 1, {
      type: 'backpack',
      ownerId: ana,
      position: { x: 0, y: 0 },
    });
    const pouch = world.items.add('bolsa-2', 'pouch', 1, {
      type: 'backpack',
      ownerId: ana,
      position: { x: 30, y: 0 },
    });
    const gold = world.items.backpackOf(ana).find((i) => i.kind === 'gold');
    if (!gold) throw new Error('sin oro');
    app.handle(ana, {
      type: 'moveItem',
      itemId: pouch.id,
      to: { type: 'container', containerId: bag.id },
    });
    app.handle(ana, {
      type: 'moveItem',
      itemId: gold.id,
      to: { type: 'container', containerId: pouch.id },
    });
    expect(
      world.items
        .descendantsOf(bag.id)
        .map((i) => i.kind)
        .sort(),
    ).toEqual(['gold', 'pouch']);
    app.handle(ana, {
      type: 'moveItem',
      itemId: bag.id,
      to: { type: 'container', containerId: pouch.id },
    });
    expect(bag.location.type).toBe('backpack');
    const player = world.get(ana);
    if (!player) throw new Error('sin jugador');
    const saved = parseSavedCharacter(
      JSON.parse(JSON.stringify(captureCharacter(player, world, null))),
    );
    const savedBag = saved?.items.find((i) => i.kind === 'bag');
    expect(savedBag?.contents?.[0]?.kind).toBe('pouch');
    expect(savedBag?.contents?.[0]?.contents?.[0]?.kind).toBe('gold');
  });
});
