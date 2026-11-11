import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import { MAX_STACK } from '@fenix/shared/items/item-catalog';
import type { EntityId, ItemDestination } from '@fenix/shared/protocol/messages';
import { staticContainerId } from '@fenix/shared/world/statics';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { emptyChanges } from '../domain/items/items';
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

/**
 * Mover una parte de una pila no puede crear ni borrar objetos: con cualquier
 * cantidad (0, negativa, con decimales, enorme…) y cualquier destino (válido o
 * no), el oro del mundo es siempre el mismo y ninguna pila queda en 0 o menos.
 */
function createRoom() {
  const map = new TileMap({
    width: 10,
    height: 10,
    terrain: new Array<Terrain>(100).fill(Terrain.Grass),
    statics: [{ kind: 'chest', x: 5, y: 4 }],
    regions: [],
  });
  const world = new World(map, { x: 5, y: 5 });
  const ids = new SequentialIds();
  const notifier = new RecordingNotifier();
  const app = newGame({
    world,
    worldClock: new WorldClock(0),
    clock: new FakeClock(0),
    ids,
    random: new FixedRandom(0.1),
    notifier,
  });
  const joined = app.join({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
  if (!joined.ok) throw new Error(joined.reason);
  app.announceJoin(joined.playerId);
  const ana = joined.playerId;
  world.get(ana)?.teleport({ x: 5, y: 5 });
  const chest = staticContainerId({ x: 5, y: 4 });
  // Abrir el cofre lo llena (con su oro) y deja usarlo.
  app.handle(ana, { type: 'openContainer', containerId: chest });
  const changes = emptyChanges();
  world.items.addToBackpack(ana, 'gold', 40, () => ids.next(), changes);
  world.items.addToBackpack(ana, 'bag', 1, () => ids.next(), changes);
  const bag = world.items.backpackOf(ana).find((i) => i.kind === 'bag');
  if (!bag) throw new Error('sin bolsa');
  world.items.add(ids.next(), 'gold', 25, { type: 'ground', position: { x: 5, y: 6 } });

  /** Todo el oro del mundo, y que ninguna pila sea rara. */
  const gold = (): number => {
    let total = 0;
    for (const item of world.items.all()) {
      expect(Number.isSafeInteger(item.amount)).toBe(true);
      expect(item.amount).toBeGreaterThan(0);
      expect(item.amount).toBeLessThanOrEqual(MAX_STACK);
      if (item.kind === 'gold') total += item.amount;
    }
    return total;
  };
  /** Dónde está cada pila de oro y cuánto tiene (para ver que algo no cambió). */
  const layout = (): string =>
    world.items
      .all()
      .filter((i) => i.kind === 'gold')
      .map((i) => `${i.id}:${i.amount}:${JSON.stringify(i.location)}`)
      .sort()
      .join('|');
  const move = (itemId: EntityId, to: ItemDestination, amount: number | undefined): void =>
    app.handle(ana, {
      type: 'moveItem',
      itemId,
      to,
      ...(amount === undefined ? {} : { amount }),
    });
  return { world, ana, chest, bag, gold, layout, move, notifier };
}

const BAD_AMOUNTS = [0, -1, -40, 0.5, 1.5, Number.NaN, Infinity, -Infinity, 2 ** 60];
const DESTINATIONS = (chest: string, bagId: string): ItemDestination[] => [
  { type: 'backpack' },
  { type: 'backpack', position: { x: 90, y: 40 } },
  { type: 'bank' },
  { type: 'ground', position: { x: 5, y: 6 } },
  { type: 'ground', position: { x: 0, y: 0 } },
  { type: 'container', containerId: chest },
  { type: 'container', containerId: bagId },
  { type: 'container', containerId: 'static:0:0' },
  { type: 'equipment', slot: 'head' },
];

describe('separar pilas no duplica ni borra objetos', () => {
  it('con cantidades que no sirven (0, negativas, decimales, NaN, enormes) no se mueve nada', () => {
    const room = createRoom();
    const total = room.gold();
    for (const amount of BAD_AMOUNTS)
      for (const to of DESTINATIONS(room.chest, room.bag.id)) {
        const stack = room.world.items.backpackOf(room.ana).find((i) => i.kind === 'gold');
        if (!stack) throw new Error('sin oro en la mochila');
        const before = room.layout();
        room.move(stack.id, to, amount);
        expect(room.layout(), `cantidad ${amount} a ${JSON.stringify(to)}`).toBe(before);
        expect(room.gold()).toBe(total);
      }
  });

  it('con cantidades válidas, a cualquier destino (sirva o no), el oro del mundo es el mismo', () => {
    const room = createRoom();
    const total = room.gold();
    for (const amount of [1, 2, 7, 39, 40, 41, 1000, undefined])
      for (const to of DESTINATIONS(room.chest, room.bag.id)) {
        // De la mochila, del cofre, de la bolsa y del suelo.
        const sources = [
          room.world.items.backpackOf(room.ana).find((i) => i.kind === 'gold'),
          room.world.items.contentsOf(room.chest).find((i) => i.kind === 'gold'),
          room.world.items.contentsOf(room.bag.id).find((i) => i.kind === 'gold'),
          room.world.items.groundNear({ x: 5, y: 5 }).find((i) => i.kind === 'gold'),
        ];
        for (const source of sources) {
          if (!source) continue;
          room.move(source.id, to, amount);
          expect(room.gold(), `${amount} de ${source.location.type} a ${to.type}`).toBe(total);
        }
      }
  });

  it('una parte de lo que está en el suelo no se separa: se avisa y queda como estaba', () => {
    const room = createRoom();
    const pile = room.world.items.groundNear({ x: 5, y: 5 }).find((i) => i.kind === 'gold');
    if (!pile) throw new Error('sin oro en el suelo');
    const before = room.layout();
    room.notifier.clear();
    room.move(pile.id, { type: 'backpack' }, 5);
    expect(room.layout()).toBe(before);
    expect(
      room.notifier
        .ofType('system')
        .some((d) => d.message.type === 'system' && d.message.text === 'Eso se mueve entero.'),
    ).toBe(true);
  });

  it('mover 0 avisa que la cantidad no sirve', () => {
    const room = createRoom();
    const stack = room.world.items.backpackOf(room.ana).find((i) => i.kind === 'gold');
    if (!stack) throw new Error('sin oro');
    room.notifier.clear();
    room.move(stack.id, { type: 'bank' }, 0);
    expect(
      room.notifier
        .ofType('system')
        .some((d) => d.message.type === 'system' && d.message.text === 'Esa cantidad no sirve.'),
    ).toBe(true);
  });

  it('soltar una pila sobre otra del mismo tipo las suma, como en UO', () => {
    const room = createRoom();
    const total = room.gold();
    const stack = room.world.items.backpackOf(room.ana).find((i) => i.kind === 'gold');
    if (!stack || stack.location.type !== 'backpack') throw new Error('sin oro');
    const original = stack.amount;
    // Separar 10 a otro lugar de la mochila: quedan dos pilas.
    room.move(stack.id, { type: 'backpack', position: { x: 180, y: 100 } }, 10);
    const piles = () => room.world.items.backpackOf(room.ana).filter((i) => i.kind === 'gold');
    expect(piles()).toHaveLength(2);
    const small = piles().find((p) => p.id !== stack.id);
    if (!small) throw new Error('sin la pila chica');
    // Soltarla encima de la otra: se juntan.
    room.move(small.id, { type: 'backpack', position: stack.location.position }, undefined);
    expect(piles()).toHaveLength(1);
    expect(piles()[0]?.amount).toBe(original);
    expect(room.gold()).toBe(total);
  });

  it('en un cofre también se suman', () => {
    const room = createRoom();
    const total = room.gold();
    const inChest = room.world.items.contentsOf(room.chest).find((i) => i.kind === 'gold');
    const mine = room.world.items.backpackOf(room.ana).find((i) => i.kind === 'gold');
    if (!inChest || !mine || inChest.location.type !== 'container') throw new Error('sin oro');
    const before = inChest.amount;
    room.move(
      mine.id,
      { type: 'container', containerId: room.chest, position: inChest.location.position },
      5,
    );
    expect(room.world.items.get(inChest.id)?.amount).toBe(before + 5);
    expect(room.gold()).toBe(total);
  });
});
