import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import {
  designCost,
  emptyDesign,
  lotSide,
  withCell,
  type HouseDesign,
} from '@fenix/shared/housing/design';
import { HOUSE_DEEDS, HOUSE_PLANS, type HouseKind } from '@fenix/shared/housing/houses';
import { houseLayout } from '@fenix/shared/housing/layout';
import {
  HOUSE_SLOT,
  houseChests,
  houseDoors,
  houseFront,
  houseOrigin,
  houseSign,
} from '@fenix/shared/housing/structure';
import type { Position } from '@fenix/shared/geometry/position';
import type { HousePanelMessage } from '@fenix/shared/protocol/messages';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { Npc } from '../domain/npcs/npc';
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
// <módulos>
import { gameWith } from '../test-support/game';
import { containersModule } from './features/containers/containers.module';
import { doorsModule } from './features/doors/doors.module';
import { economyModule } from './features/economy/economy.module';
import { housingModule } from './features/housing/housing.module';
import { itemsModule } from './features/items/items.module';
import { movementModule } from './features/movement/movement.module';
// </módulos>

const newGame = gameWith([
  movementModule,
  itemsModule,
  economyModule,
  doorsModule,
  containersModule,
  housingModule,
]);

/** Un campo con un pueblo chico arriba a la izquierda y roca a la derecha para los pisos. */
function createField(store = new FakeHouseStore(), mapId = 'campo') {
  const width = 140;
  const height = 80;
  const terrain = new Array<Terrain>(width * height).fill(Terrain.Grass);
  for (let y = 0; y < height; y++)
    for (let x = 80; x < width; x++) terrain[y * width + x] = Terrain.Rock;
  const map = new TileMap({
    width,
    height,
    terrain,
    regions: [{ name: 'Villa', x: 0, y: 0, width: 12, height: 12 }],
  });
  const world = new World(map, { x: 30, y: 30 }, mapId);
  world.houseSlots = Array.from({ length: 4 }, (_, i) => ({
    x: 82 + (i % 2) * HOUSE_SLOT,
    y: 2 + Math.floor(i / 2) * HOUSE_SLOT,
  }));
  const notifier = new RecordingNotifier();
  const clock = new FakeClock(0);
  const app = newGame({
    world,
    worldClock: new WorldClock(0),
    clock,
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
  let deeds = 0;
  const giveDeed = (owner: Player, kind: HouseKind) =>
    world.items.add(`escritura-${++deeds}`, HOUSE_DEEDS[kind], 1, {
      type: 'backpack',
      ownerId: owner.id,
      position: { x: 0, y: 0 },
    });
  /** Levanta una casa de `owner` centrada en `center` (parado al lado). */
  const build = (owner: Player, kind: HouseKind, center: Position = { x: 40, y: 40 }) => {
    owner.teleport({ x: center.x - 12, y: center.y });
    const deed = giveDeed(owner, kind);
    app.handle(owner.id, { type: 'placeHouse', deedId: deed.id, position: center });
    return { deed, origin: houseOrigin(kind, center) };
  };
  const houseIdOf = (owner: Player): string | undefined =>
    notifier
      .ofType('houseChanged')
      .map((d) => (d.message.type === 'houseChanged' ? d.message.house : null))
      .find((h) => h?.owner === owner.name)?.id;
  const site = (kind: HouseKind, origin: Position) => ({
    id: '',
    kind,
    ...origin,
    slots: [],
    name: '',
  });
  return { world, app, notifier, clock, store, join, giveDeed, build, houseIdOf, site };
}

const lastSystem = (notifier: RecordingNotifier): string => {
  const last = notifier.ofType('system').at(-1)?.message;
  return last?.type === 'system' ? last.text : '';
};

describe('casas de los jugadores', () => {
  it('la escritura levanta la casa en el campo, con sus cofres, y se avisa a todos', () => {
    const { world, notifier, join, build } = createField();
    const ana = join('Ana');
    const { deed, origin } = build(ana, 'stone-cottage');
    expect(world.items.get(deed.id)).toBeUndefined();
    const layout = houseLayout('stone-cottage');
    // Las paredes no se pasan y adentro hay piso de laja.
    expect(world.map.isWalkable(origin)).toBe(false);
    expect(world.map.terrainAt({ x: origin.x + 2, y: origin.y + 2 })).toBe(Terrain.Flagstone);
    const chests = world.items.all().filter((i) => i.kind === 'house-chest');
    expect(chests).toHaveLength(HOUSE_PLANS['stone-cottage'].chests);
    expect(chests[0]?.location).toEqual({
      type: 'ground',
      position: {
        x: origin.x + (layout.chests[0]?.x ?? 0),
        y: origin.y + (layout.chests[0]?.y ?? 0),
      },
    });
    expect(notifier.ofType('houseChanged').some((d) => d.to === 'all')).toBe(true);
    expect(lastSystem(notifier)).toMatch(/Levantaste/);
  });

  it('no se levanta en un pueblo, ni pegada a otra, ni lejos, ni dos por persona', () => {
    const { world, app, notifier, join, build } = createField();
    const ana = join('Ana');
    const beto = join('Beto');
    build(ana, 'wood-shack', { x: 6, y: 6 });
    expect(lastSystem(notifier)).toMatch(/pueblo/);
    build(ana, 'wood-shack', { x: 40, y: 40 });
    expect(lastSystem(notifier)).toMatch(/Levantaste/);
    build(ana, 'wood-shack', { x: 40, y: 60 });
    expect(lastSystem(notifier)).toMatch(/una sola/);
    build(beto, 'wood-shack', { x: 44, y: 40 });
    expect(lastSystem(notifier)).toMatch(/otra casa/);
    // Lejos de donde está parado.
    beto.teleport({ x: 20, y: 70 });
    const deed = world.items.add('lejos', HOUSE_DEEDS['wood-shack'], 1, {
      type: 'backpack',
      ownerId: beto.id,
      position: { x: 0, y: 0 },
    });
    app.handle(beto.id, { type: 'placeHouse', deedId: deed.id, position: { x: 60, y: 30 } });
    expect(lastSystem(notifier)).toMatch(/lejos/);
    expect(world.items.get(deed.id)).toBeDefined();
  });

  it('privada, solo los amigos abren la puerta; pública, todos menos los echados', () => {
    const { world, app, notifier, join, build, houseIdOf, site } = createField();
    const ana = join('Ana');
    const beto = join('Beto');
    const { origin } = build(ana, 'wood-shack');
    const houseId = houseIdOf(ana) ?? '';
    const [door] = houseDoors(site('wood-shack', origin));
    if (!door) throw new Error('sin puerta');
    beto.teleport({ x: door.x, y: door.y + 1 });
    app.handle(beto.id, { type: 'useDoor', position: door });
    expect(world.map.isDoorOpen(door)).toBe(false);
    expect(lastSystem(notifier)).toMatch(/privada/);

    // Ana lo hace amigo: ya abre.
    ana.teleport(houseFront(site('wood-shack', origin)));
    app.handle(ana.id, {
      type: 'houseSecurity',
      houseId,
      change: { kind: 'add', list: 'friends', name: 'Beto' },
    });
    app.handle(beto.id, { type: 'useDoor', position: door });
    expect(world.map.isDoorOpen(door)).toBe(true);
    app.handle(beto.id, { type: 'useDoor', position: door });

    // Echado: ni con la casa pública.
    app.handle(ana.id, {
      type: 'houseSecurity',
      houseId,
      change: { kind: 'add', list: 'banned', name: 'Beto' },
    });
    app.handle(ana.id, { type: 'houseSecurity', houseId, change: { kind: 'public', on: true } });
    app.handle(beto.id, { type: 'useDoor', position: door });
    expect(world.map.isDoorOpen(door)).toBe(false);

    // Una visita cualquiera, con la casa pública, abre.
    const ceci = join('Ceci');
    ceci.teleport({ x: door.x, y: door.y + 1 });
    app.handle(ceci.id, { type: 'useDoor', position: door });
    expect(world.map.isDoorOpen(door)).toBe(true);
  });

  it('a los echados no los dejan entrar, y las visitas se pueden echar', () => {
    const { world, app, notifier, join, build, houseIdOf, site } = createField();
    const ana = join('Ana');
    const beto = join('Beto');
    const { origin } = build(ana, 'wood-shack');
    const houseId = houseIdOf(ana) ?? '';
    const s = site('wood-shack', origin);
    const [door] = houseDoors(s);
    if (!door) throw new Error('sin puerta');
    ana.teleport(houseFront(s));
    app.handle(ana.id, { type: 'houseSecurity', houseId, change: { kind: 'public', on: true } });
    // Una visita entra por la puerta abierta y la dueña la echa.
    world.map.setDoorOpen(door, true);
    beto.teleport({ x: door.x, y: door.y - 1 });
    app.handle(ana.id, { type: 'houseAction', houseId, action: 'eject' });
    expect(beto.position).toEqual(houseFront(s));
    // Echado: no puede volver a pasar por la puerta abierta.
    app.handle(ana.id, {
      type: 'houseSecurity',
      houseId,
      change: { kind: 'add', list: 'banned', name: 'Beto' },
    });
    beto.teleport({ x: door.x, y: door.y + 1 });
    app.handle(beto.id, { type: 'move', direction: 0, mode: 'walk', seq: 1 });
    expect(beto.position).toEqual({ x: door.x, y: door.y + 1 });
    expect(lastSystem(notifier)).toMatch(/No te dejan entrar/);
  });

  it('los cofres y lo que hay adentro son de los amigos de la casa', () => {
    const { world, app, notifier, join, build, site } = createField();
    const ana = join('Ana');
    const beto = join('Beto');
    const { origin } = build(ana, 'stone-cottage');
    const chest = world.items.all().find((i) => i.kind === 'house-chest');
    if (!chest || chest.location.type !== 'ground') throw new Error('sin cofre');
    const inside = { x: origin.x + 3, y: origin.y + 3 };
    // El cofre no se mueve.
    ana.teleport(inside);
    app.handle(ana.id, { type: 'moveItem', itemId: chest.id, to: { type: 'backpack' } });
    expect(chest.location.type).toBe('ground');
    // Una visita que entró no abre el cofre ni levanta lo que hay en el piso.
    const apple = world.items.add('manzana', 'apple', 3, { type: 'ground', position: inside });
    beto.teleport({ x: inside.x + 1, y: inside.y });
    notifier.clear();
    app.handle(beto.id, { type: 'openContainer', containerId: chest.id });
    expect(notifier.ofType('container')).toHaveLength(0);
    app.handle(beto.id, { type: 'moveItem', itemId: apple.id, to: { type: 'backpack' } });
    expect(apple.location.type).toBe('ground');
    expect(lastSystem(notifier)).toMatch(/asegurado/);
    // La dueña sí (al lado del cofre).
    ana.teleport({ x: chest.location.position.x - 1, y: chest.location.position.y + 1 });
    app.handle(ana.id, { type: 'openContainer', containerId: chest.id });
    expect(notifier.ofType('container').some((d) => d.to === ana.id)).toBe(true);
    void site;
  });

  it('demolida (vacía), vuelve la escritura y el lugar queda libre', () => {
    const { world, app, notifier, join, build, houseIdOf, site } = createField();
    const ana = join('Ana');
    const { origin } = build(ana, 'plank-house');
    const houseId = houseIdOf(ana) ?? '';
    const s = site('plank-house', origin);
    ana.teleport({ x: origin.x + 3, y: origin.y + 3 });
    const apple = world.items.add('manzana', 'apple', 1, {
      type: 'ground',
      position: { x: origin.x + 2, y: origin.y + 2 },
    });
    app.handle(ana.id, { type: 'houseAction', houseId, action: 'demolish' });
    expect(lastSystem(notifier)).toMatch(/vaciá/);
    world.items.remove(apple.id);
    app.handle(ana.id, { type: 'houseAction', houseId, action: 'demolish' });
    expect(lastSystem(notifier)).toMatch(/Demoliste/);
    expect(world.map.isWalkable(origin)).toBe(true);
    expect(world.items.backpackOf(ana.id).some((i) => i.kind === HOUSE_DEEDS['plank-house'])).toBe(
      true,
    );
    expect(notifier.ofType('houseRemoved')).toHaveLength(1);
    // Quedó afuera, delante de donde estaba la puerta.
    expect(ana.position).toEqual(houseFront(s));
    expect(world.items.all().some((i) => i.kind === 'house-chest')).toBe(false);
  });

  it('una casa de dos plantas tiene escalera al piso de arriba y a la azotea', () => {
    const { world, join, build, site } = createField();
    const ana = join('Ana');
    const { origin } = build(ana, 'stone-house');
    const layout = houseLayout('stone-house');
    const stairs = layout.stairs;
    if (!stairs) throw new Error('sin escalera');
    const up = world.map.teleportAt({ x: origin.x + stairs.x, y: origin.y + stairs.y });
    expect(up).toBeDefined();
    if (!up) return;
    // Arriba se ve encima de la casa, en el primer piso.
    expect(world.map.displayOf(up).level).toBe(1);
    expect(world.map.regionAt(up)?.name).toBe('Casa de Ana, primer piso');
    void site;
  });

  it('se guarda con lo de adentro y vuelve al reiniciar; en otro mundo, vuelve como escritura', () => {
    const first = createField();
    const ana = first.join('Ana');
    const { origin } = first.build(ana, 'stone-cottage');
    const [chestAt] = houseChests(first.site('stone-cottage', origin));
    const chest = first.world.items.all().find((i) => i.kind === 'house-chest');
    if (!chest || !chestAt) throw new Error('sin cofre');
    first.world.items.add('rubí', 'ruby', 2, {
      type: 'container',
      containerId: chest.id,
      position: { x: 10, y: 10 },
    });
    first.world.items.add('libro', 'book', 1, {
      type: 'ground',
      position: { x: origin.x + 3, y: origin.y + 2 },
    });
    first.app.saveAll();

    const again = createField(first.store);
    expect(again.world.map.isWalkable(origin)).toBe(false);
    const restored = again.world.items.all().find((i) => i.kind === 'house-chest');
    expect(restored).toBeDefined();
    expect(again.world.items.contentsOf(restored?.id ?? '')[0]?.kind).toBe('ruby');
    expect(
      again.world.items
        .all()
        .some(
          (i) =>
            i.kind === 'book' &&
            i.location.type === 'ground' &&
            i.location.position.x === origin.x + 3,
        ),
    ).toBe(true);

    // Otro mundo: la casa no está, y la dueña encuentra la escritura en el banco.
    const other = createField(first.store, 'otro-mundo');
    expect(other.world.map.isWalkable(origin)).toBe(true);
    const back = other.join('Ana');
    expect(
      other.world.items.bankOf(back.id).some((i) => i.kind === HOUSE_DEEDS['stone-cottage']),
    ).toBe(true);
  });

  it('la ventana de la casa: el dueño ve las listas; una visita, solo quién es', () => {
    const { app, notifier, join, build, houseIdOf, site } = createField();
    const ana = join('Ana');
    const beto = join('Beto');
    const { origin } = build(ana, 'log-cabin');
    const houseId = houseIdOf(ana) ?? '';
    const sign = houseSign(site('log-cabin', origin));
    ana.teleport({ x: sign.x, y: sign.y + 1 });
    beto.teleport({ x: sign.x + 1, y: sign.y + 1 });
    notifier.clear();
    app.handle(ana.id, { type: 'houseAction', houseId, action: 'panel' });
    app.handle(beto.id, { type: 'houseAction', houseId, action: 'panel' });
    const panels = notifier.ofType('housePanel').map((d) => d.message as HousePanelMessage);
    expect(panels[0]?.level).toBe('owner');
    expect(panels[0]?.security).toBeDefined();
    expect(panels[1]?.level).toBe('visitor');
    expect(panels[1]?.security).toBeUndefined();
    app.handle(ana.id, {
      type: 'houseSecurity',
      houseId,
      change: { kind: 'rename', name: 'El Refugio' },
    });
    expect(lastSystem(notifier)).toMatch(/El Refugio/);
  });

  it('las escrituras se compran al arquitecto, y las caras se pagan con el oro del banco', () => {
    const { world, app, notifier, join } = createField();
    const ana = join('Ana');
    const architect = new Npc('octavio', 'architect', { x: 31, y: 30 });
    world.addNpc(architect);
    ana.teleport({ x: 30, y: 30 });
    world.items.add('bolsillo', 'gold', 100, {
      type: 'backpack',
      ownerId: ana.id,
      position: { x: 0, y: 0 },
    });
    const carried = world.items.countInBackpack(ana.id, 'gold');
    world.items.add('ahorros', 'gold', 20000, {
      type: 'bank',
      ownerId: ana.id,
      position: { x: 0, y: 0 },
    });
    app.handle(ana.id, {
      type: 'buy',
      vendorId: architect.id,
      kind: HOUSE_DEEDS['wood-shack'],
      amount: 1,
    });
    expect(lastSystem(notifier)).toMatch(/salieron del banco/);
    expect(world.items.backpackOf(ana.id).some((i) => i.kind === HOUSE_DEEDS['wood-shack'])).toBe(
      true,
    );
    const left = world.items.bankOf(ana.id).find((i) => i.kind === 'gold')?.amount;
    expect(left).toBe(20000 - (HOUSE_PLANS['wood-shack'].price - carried));
  });
});

/** Una casa de piedra que ocupa todo el lote chico, con la puerta al sur y un cofre. */
function cottage(): HouseDesign {
  const side = lotSide('lot-small');
  let d = emptyDesign('lot-small');
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const edge = x === 0 || y === 0 || x === side - 1 || y === side - 1;
      if (x < side - 1 && y < side - 1) d = withCell(d, 0, x, y, side, { floor: 'flagstone' });
      if (edge) d = withCell(d, 0, x, y, side, { piece: 'wall-stone' });
    }
  d = withCell(d, 0, 3, side - 1, side, { piece: 'door-wood' });
  return withCell(d, 0, side - 2, 1, side, { piece: 'chest' });
}

describe('casas a medida', () => {
  const setup = () => {
    const field = createField();
    const ana = field.join('Ana');
    const { origin } = field.build(ana, 'lot-small');
    const houseId = field.houseIdOf(ana) ?? '';
    const sign = houseSign({
      ...field.site('lot-small', origin),
      design: emptyDesign('lot-small'),
    });
    ana.teleport({ x: sign.x + 1, y: sign.y });
    const send = (design: HouseDesign, pay: 'gold' | 'materials') =>
      field.app.handle(ana.id, { type: 'houseDesign', houseId, design, pay });
    return { ...field, ana, origin, houseId, send };
  };

  it('el lote se levanta vacío y se construye pagando con oro (de la mochila y del banco)', () => {
    const { world, notifier, ana, origin, send } = setup();
    expect(lastSystem(notifier)).toMatch(/Diseñar la casa/);
    expect(world.map.isWalkable(origin)).toBe(true);
    world.items.add('ahorros', 'gold', 20000, {
      type: 'bank',
      ownerId: ana.id,
      position: { x: 0, y: 0 },
    });
    const before = world.items.countInBackpack(ana.id, 'gold') + 20000;
    const cost = designCost('lot-small', emptyDesign('lot-small'), cottage());
    send(cottage(), 'gold');
    expect(lastSystem(notifier)).toMatch(/La obra está lista/);
    const after =
      world.items.countInBackpack(ana.id, 'gold') +
      (world.items.bankOf(ana.id).find((i) => i.kind === 'gold')?.amount ?? 0);
    expect(after).toBe(before - cost.gold);
    expect(world.map.isWalkable(origin)).toBe(false);
    const chest = world.items.all().find((i) => i.kind === 'house-chest');
    expect(chest?.location).toEqual({
      type: 'ground',
      position: { x: origin.x + lotSide('lot-small') - 2, y: origin.y + 1 },
    });
    const changed = notifier.ofType('houseChanged').at(-1)?.message;
    expect(changed?.type === 'houseChanged' && changed.house.design).toEqual(cottage());
  });

  it('con materiales: de la mochila y de los cofres; sacar devuelve la mitad', () => {
    const { world, notifier, ana, origin, send } = setup();
    send(cottage(), 'materials');
    expect(lastSystem(notifier)).toMatch(/Te faltan materiales/);
    const cost = designCost('lot-small', emptyDesign('lot-small'), cottage());
    for (const [kind, amount] of Object.entries(cost.materials))
      world.items.add(`material-${kind}`, kind as never, amount ?? 0, {
        type: 'backpack',
        ownerId: ana.id,
        position: { x: 0, y: 0 },
      });
    send(cottage(), 'materials');
    expect(lastSystem(notifier)).toMatch(/Usaste .*bloques de piedra/);
    expect(world.items.countInBackpack(ana.id, 'stone-block')).toBe(0);

    // Las piedras para una pared más quedan en el cofre de la casa.
    const chest = world.items.all().find((i) => i.kind === 'house-chest');
    world.items.add('piedras', 'stone-block', 5, {
      type: 'container',
      containerId: chest?.id ?? '',
      position: { x: 0, y: 0 },
    });
    const inner = withCell(cottage(), 0, 3, 3, lotSide('lot-small'), { piece: 'wall-stone' });
    send(inner, 'materials');
    expect(lastSystem(notifier)).toMatch(/La obra está lista/);
    expect(world.items.contentsOf(chest?.id ?? '')).toHaveLength(0);
    expect(world.map.isWalkable({ x: origin.x + 3, y: origin.y + 3 })).toBe(false);

    // Sacarla devuelve la mitad de las piedras, sin cobrar nada.
    send(cottage(), 'gold');
    expect(lastSystem(notifier)).toMatch(/devolvieron 2 bloques de piedra/);
    expect(world.items.countInBackpack(ana.id, 'stone-block')).toBe(2);
  });

  it('solo el dueño, con un diseño que se pueda construir y el cofre vacío para sacarlo', () => {
    const { world, notifier, join, ana, houseId, send, app } = setup();
    const beto = join('Beto');
    beto.teleport(ana.position);
    app.handle(beto.id, { type: 'houseDesign', houseId, design: cottage(), pay: 'gold' });
    expect(lastSystem(notifier)).toMatch(/Solo el dueño/);
    const closed = withCell(cottage(), 0, 3, lotSide('lot-small') - 1, lotSide('lot-small'), {
      piece: 'wall-stone',
    });
    send(closed, 'gold');
    expect(lastSystem(notifier)).toMatch(/cofre/);
    send(emptyDesign('lot-huge'), 'gold');
    expect(lastSystem(notifier)).toMatch(/no es para este lote/);

    world.items.add('oro', 'gold', 50000, {
      type: 'bank',
      ownerId: ana.id,
      position: { x: 0, y: 0 },
    });
    send(cottage(), 'gold');
    const chest = world.items.all().find((i) => i.kind === 'house-chest');
    world.items.add('joya', 'gold', 1, {
      type: 'container',
      containerId: chest?.id ?? '',
      position: { x: 0, y: 0 },
    });
    const noChest = withCell(cottage(), 0, lotSide('lot-small') - 2, 1, lotSide('lot-small'), {
      piece: null,
    });
    send(noChest, 'gold');
    expect(lastSystem(notifier)).toMatch(/Vaciá el cofre/);
  });

  it('el diseño se guarda con la casa y al demoler vuelven la escritura y la mitad de la obra', () => {
    const store = new FakeHouseStore();
    const first = createField(store);
    const ana = first.join('Ana');
    const { origin } = first.build(ana, 'lot-small');
    const houseId = first.houseIdOf(ana) ?? '';
    const sign = houseSign({
      ...first.site('lot-small', origin),
      design: emptyDesign('lot-small'),
    });
    ana.teleport({ x: sign.x + 1, y: sign.y });
    first.world.items.add('oro', 'gold', 50000, {
      type: 'bank',
      ownerId: ana.id,
      position: { x: 0, y: 0 },
    });
    first.app.handle(ana.id, { type: 'houseDesign', houseId, design: cottage(), pay: 'gold' });
    first.app.saveAll();

    const second = createField(store);
    expect(second.world.map.isWalkable(origin)).toBe(false);
    const back = second.join('Ana');
    back.teleport({ x: sign.x + 1, y: sign.y });
    second.app.handle(back.id, { type: 'houseAction', houseId, action: 'demolish' });
    second.app.handle(back.id, { type: 'houseAction', houseId, action: 'demolish' });
    expect(lastSystem(second.notifier)).toMatch(/De la obra te devolvieron/);
    expect(second.world.map.isWalkable(origin)).toBe(true);
    expect(
      second.world.items.backpackOf(back.id).some((i) => i.kind === HOUSE_DEEDS['lot-small']),
    ).toBe(true);
    expect(second.world.items.countInBackpack(back.id, 'stone-block')).toBeGreaterThan(0);
  });
});
