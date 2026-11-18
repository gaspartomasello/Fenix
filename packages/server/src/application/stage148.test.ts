import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import type { Position } from '@fenix/shared/geometry/position';
import { HOUSE_DEEDS } from '@fenix/shared/housing/houses';
import { HOUSE_SLOT, houseOrigin, indoorsAt } from '@fenix/shared/housing/structure';
import type { HouseSnapshot } from '@fenix/shared/protocol/messages';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import type { Player } from '../domain/player';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import {
  FakeClock,
  FakeHouseStore,
  FixedRandom,
  RecordingNotifier,
  SequentialIds,
} from '../test-support/fakes';
import { gameWith } from '../test-support/game';
import { containersModule } from './features/containers/containers.module';
import { doorsModule } from './features/doors/doors.module';
import { economyModule } from './features/economy/economy.module';
import { furnitureModule } from './features/furniture/furniture.module';
import { housingModule } from './features/housing/housing.module';
import { itemsModule } from './features/items/items.module';
import { movementModule } from './features/movement/movement.module';

const newGame = gameWith([
  movementModule,
  itemsModule,
  economyModule,
  doorsModule,
  containersModule,
  housingModule,
  furnitureModule,
]);

const CENTER = { x: 40, y: 40 };

/** Un campo con la casa de piedra de Ana levantada. */
function withHouse() {
  const width = 140;
  const height = 80;
  const terrain = new Array<Terrain>(width * height).fill(Terrain.Grass);
  for (let y = 0; y < height; y++)
    for (let x = 80; x < width; x++) terrain[y * width + x] = Terrain.Rock;
  const map = new TileMap({ width, height, terrain });
  const world = new World(map, { x: 30, y: 30 }, 'campo');
  world.houseSlots = Array.from({ length: 4 }, (_, i) => ({
    x: 82 + (i % 2) * HOUSE_SLOT,
    y: 2 + Math.floor(i / 2) * HOUSE_SLOT,
  }));
  const notifier = new RecordingNotifier();
  const store = new FakeHouseStore();
  const app = newGame({
    world,
    worldClock: new WorldClock(0),
    clock: new FakeClock(0),
    ids: new SequentialIds(),
    random: new FixedRandom(0.5),
    notifier,
    houses: store,
  });
  const join = (name: string): Player => {
    const result = app.join({ type: 'join', name, appearance: DEFAULT_APPEARANCE });
    if (!result.ok) throw new Error(result.reason);
    app.announceJoin(result.playerId);
    const player = world.get(result.playerId);
    if (!player) throw new Error('sin jugador');
    return player;
  };
  let next = 0;
  const give = (player: Player, kind: Parameters<typeof world.items.add>[1]) =>
    world.items.add(`obj-${++next}`, kind, 1, {
      type: 'backpack',
      ownerId: player.id,
      position: { x: 0, y: 0 },
    });
  const ana = join('Ana');
  ana.teleport({ x: CENTER.x - 12, y: CENTER.y });
  const deed = give(ana, HOUSE_DEEDS['stone-cottage']);
  app.handle(ana.id, { type: 'placeHouse', deedId: deed.id, position: CENTER });
  const house = (): HouseSnapshot => {
    const found = notifier
      .ofType('houseChanged')
      .map((d) => (d.message.type === 'houseChanged' ? d.message.house : null))
      .filter((h): h is HouseSnapshot => h !== null && h.owner === 'Ana')
      .at(-1);
    if (!found) throw new Error('sin casa');
    return found;
  };
  // Un lugar libre del piso de adentro, lejos de las puertas.
  const origin = houseOrigin('stone-cottage', CENTER);
  const site = { ...house(), slots: house().slots, name: house().name };
  let spot: Position | null = null;
  for (let y = origin.y; y < origin.y + 14 && !spot; y++)
    for (let x = origin.x; x < origin.x + 14 && !spot; x++) {
      const p = { x, y };
      const nearDoor = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx = 0, dy = 0]) => map.doorAt({ x: x + dx, y: y + dy }));
      const item = world.items
        .groundNear(p)
        .some(
          (i) =>
            i.location.type === 'ground' &&
            i.location.position.x === x &&
            i.location.position.y === y,
        );
      if (
        indoorsAt(site, p) &&
        map.isWalkable(p) &&
        !map.hasStaticAt(p) &&
        !nearDoor &&
        !item &&
        indoorsAt(site, { x: x + 1, y })
      )
        spot = p;
    }
  if (!spot) throw new Error('sin lugar libre en la casa');
  const texts = (): string[] =>
    notifier.ofType('system').map((d) => (d.message.type === 'system' ? d.message.text : ''));
  return { world, app, map, store, ana, join, give, house, spot, texts };
}

describe('etapa 148: amueblar la casa', () => {
  it('el dueño pone un mueble adentro: queda puesto, ocupa su lugar y se ve en la casa', () => {
    const f = withHouse();
    const chair = f.give(f.ana, 'furniture-chair');
    f.ana.teleport({ x: f.spot.x + 1, y: f.spot.y });
    f.app.handle(f.ana.id, { type: 'placeFurniture', itemId: chair.id, position: f.spot });
    expect(f.world.items.get(chair.id)).toBeUndefined();
    expect(f.house().furniture).toEqual([{ kind: 'chair-s', ...f.spot }]);
    expect(f.map.hasStaticAt(f.spot)).toBe(true);
    expect(f.texts().at(-1)).toBe('Pusiste una silla.');
  });

  it('se gira, y solo el dueño (o un copropietario) lo toca', () => {
    const f = withHouse();
    const chair = f.give(f.ana, 'furniture-chair');
    f.ana.teleport({ x: f.spot.x + 1, y: f.spot.y });
    f.app.handle(f.ana.id, { type: 'placeFurniture', itemId: chair.id, position: f.spot });
    f.app.handle(f.ana.id, { type: 'furnitureAction', position: f.spot, action: 'turn' });
    expect(f.house().furniture?.[0]?.kind).toBe('chair-w');
    const beto = f.join('Beto');
    beto.teleport({ x: f.spot.x + 1, y: f.spot.y });
    f.app.handle(beto.id, { type: 'furnitureAction', position: f.spot, action: 'pickUp' });
    expect(f.texts().at(-1)).toContain('Solo el dueño o un copropietario');
    expect(f.house().furniture).toHaveLength(1);
  });

  it('el dueño lo vuelve a guardar en la mochila', () => {
    const f = withHouse();
    const bed = f.give(f.ana, 'furniture-bed');
    f.ana.teleport({ x: f.spot.x + 1, y: f.spot.y });
    f.app.handle(f.ana.id, { type: 'placeFurniture', itemId: bed.id, position: f.spot });
    f.app.handle(f.ana.id, { type: 'furnitureAction', position: f.spot, action: 'turn' });
    f.app.handle(f.ana.id, { type: 'furnitureAction', position: f.spot, action: 'pickUp' });
    expect(f.house().furniture ?? []).toHaveLength(0);
    expect(f.world.items.countInBackpack(f.ana.id, 'furniture-bed')).toBe(1);
    expect(f.map.hasStaticAt(f.spot)).toBe(false);
  });

  it('afuera de la casa, o en una casa ajena, no se puede', () => {
    const f = withHouse();
    const chair = f.give(f.ana, 'furniture-chair');
    f.ana.teleport({ x: 10, y: 10 });
    f.app.handle(f.ana.id, {
      type: 'placeFurniture',
      itemId: chair.id,
      position: { x: 11, y: 10 },
    });
    expect(f.texts().at(-1)).toBe('Los muebles se ponen adentro de tu casa.');
    const beto = f.join('Beto');
    const stool = f.give(beto, 'furniture-stool');
    beto.teleport({ x: f.spot.x + 1, y: f.spot.y });
    f.app.handle(beto.id, { type: 'placeFurniture', itemId: stool.id, position: f.spot });
    expect(f.texts().at(-1)).toContain('Solo el dueño o un copropietario');
    expect(f.world.items.get(stool.id)).toBeDefined();
  });

  it('los muebles se guardan con la casa', () => {
    const f = withHouse();
    const bed = f.give(f.ana, 'furniture-bed');
    f.ana.teleport({ x: f.spot.x + 1, y: f.spot.y });
    f.app.handle(f.ana.id, { type: 'placeFurniture', itemId: bed.id, position: f.spot });
    f.app.saveAll();
    expect(f.store.raw).toContain('"bed-x"');
  });

  it('etapa 150: el cofre puesto guarda cosas, se gira con lo de adentro y se guarda vacío', () => {
    const f = withHouse();
    const chest = f.give(f.ana, 'furniture-chest');
    f.ana.teleport({ x: f.spot.x + 1, y: f.spot.y });
    f.app.handle(f.ana.id, { type: 'placeFurniture', itemId: chest.id, position: f.spot });
    const placed = () =>
      f.world.items
        .groundNear(f.spot)
        .find(
          (i) =>
            (i.kind === 'placed-chest-x' || i.kind === 'placed-chest-y') &&
            i.location.type === 'ground' &&
            i.location.position.x === f.spot.x &&
            i.location.position.y === f.spot.y,
        );
    const first = placed();
    expect(first?.kind).toBe('placed-chest-x');
    if (!first) throw new Error('sin cofre');
    // Se abre como cualquier cofre y guarda cosas.
    f.app.handle(f.ana.id, { type: 'useItem', itemId: first.id });
    expect(f.texts().at(-1) ?? '').not.toContain('Solo');
    f.world.items.add('oro', 'gold', 300, {
      type: 'container',
      containerId: first.id,
      position: { x: 0, y: 0 },
    });
    // Girado, es el mismo cofre mirando al otro lado, con el oro adentro.
    f.app.handle(f.ana.id, { type: 'furnitureAction', position: f.spot, action: 'turn' });
    const turned = placed();
    expect(turned?.kind).toBe('placed-chest-y');
    if (!turned) throw new Error('sin cofre');
    expect(f.world.items.contentsOf(turned.id).map((i) => i.kind)).toEqual(['gold']);
    // Con cosas adentro no se guarda; se guarda con la casa.
    f.app.handle(f.ana.id, { type: 'furnitureAction', position: f.spot, action: 'pickUp' });
    expect(f.texts().at(-1)).toBe('Vacialo antes de guardarlo en la mochila.');
    f.app.saveAll();
    expect(f.store.raw).toContain('"placed-chest-y"');
    expect(f.store.raw).toContain('"gold"');
    // Vacío, vuelve a la mochila.
    f.world.items.remove('oro');
    f.app.handle(f.ana.id, { type: 'furnitureAction', position: f.spot, action: 'pickUp' });
    expect(placed()).toBeUndefined();
    expect(f.world.items.countInBackpack(f.ana.id, 'furniture-chest')).toBe(1);
  });

  it('etapa 150: un extraño no abre el cofre de una casa privada', () => {
    const f = withHouse();
    const chest = f.give(f.ana, 'furniture-chest');
    f.ana.teleport({ x: f.spot.x + 1, y: f.spot.y });
    f.app.handle(f.ana.id, { type: 'placeFurniture', itemId: chest.id, position: f.spot });
    const placed = f.world.items.groundNear(f.spot).find((i) => i.kind === 'placed-chest-x');
    if (!placed) throw new Error('sin cofre');
    const beto = f.join('Beto');
    beto.teleport({ x: f.spot.x + 1, y: f.spot.y });
    f.app.handle(beto.id, { type: 'useItem', itemId: placed.id });
    expect(f.texts().at(-1)).toContain('solo los amigos de la casa');
  });
});
