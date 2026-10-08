import { DEFAULT_APPEARANCE, Terrain, TileMap, type EntityId } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { Npc } from '../domain/npcs/npc';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

/**
 * Taller de 8×4: el jugador aparece en (1,1), con un roble y una roca al
 * lado, forja y yunque cerca, el herrero y la banquera a un paso.
 */
function createWorkshop() {
  const map = new TileMap({
    width: 8,
    height: 4,
    terrain: new Array<Terrain>(32).fill(Terrain.Grass),
    statics: [
      { kind: 'oak', x: 2, y: 1 },
      { kind: 'rock', x: 1, y: 2 },
      { kind: 'forge', x: 0, y: 0 },
      { kind: 'anvil', x: 1, y: 0 },
    ],
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const ids = new SequentialIds();
  const world = new World(map, { x: 1, y: 1 });
  world.addNpc(new Npc('herrero', 'blacksmith', { x: 2, y: 0 }));
  world.addNpc(new Npc('banquera', 'banker', { x: 0, y: 2 }));
  const app = new GameApplication({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids,
    random: new FixedRandom(0.2),
    notifier,
  });
  const result = app.join({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
  if (!result.ok) throw new Error(result.reason);
  app.announceJoin(result.playerId);
  const ana: EntityId = result.playerId;
  const texts = (): string[] =>
    notifier.ofType('system').map((d) => (d.message.type === 'system' ? d.message.text : ''));
  const count = (kind: Parameters<typeof world.items.countInBackpack>[1]): number =>
    world.items.countInBackpack(ana, kind);
  const give = (
    kind: Parameters<typeof world.items.countInBackpack>[1],
    amount: number,
  ): EntityId => {
    const id = ids.next();
    world.items.add(id, kind, amount, { type: 'backpack', ownerId: ana, position: { x: 0, y: 0 } });
    return id;
  };
  return { world, app, clock, notifier, ana, texts, count, give };
}

describe('economía', () => {
  it('compra y vende con el herrero', () => {
    const shop = createWorkshop();
    shop.app.handle(shop.ana, { type: 'buy', vendorId: 'herrero', kind: 'pickaxe', amount: 1 });
    expect(shop.count('gold')).toBe(20);
    expect(shop.count('pickaxe')).toBe(1);
    expect(shop.texts()).toContain('Compraste un pico por 30 monedas.');

    const pickaxe = shop.world.items.backpackOf(shop.ana).find((i) => i.kind === 'pickaxe');
    shop.app.handle(shop.ana, { type: 'sell', vendorId: 'herrero', itemId: pickaxe?.id ?? '' });
    expect(shop.count('gold')).toBe(30);
    expect(shop.count('pickaxe')).toBe(0);
  });

  it('no deja comprar sin plata ni lo que no se vende', () => {
    const shop = createWorkshop();
    shop.notifier.clear();
    shop.app.handle(shop.ana, { type: 'buy', vendorId: 'herrero', kind: 'chainmail', amount: 1 });
    shop.app.handle(shop.ana, { type: 'buy', vendorId: 'herrero', kind: 'apple', amount: 1 });
    expect(shop.texts()).toEqual([
      'No te alcanza: cuesta 250 monedas.',
      'Tomás el herrero no vende eso.',
    ]);
  });

  it('tala un árbol con hacha y sube Leñador', () => {
    const shop = createWorkshop();
    const axe = shop.give('axe', 1);
    shop.app.handle(shop.ana, { type: 'gather', toolId: axe, position: { x: 2, y: 1 } });
    expect(shop.count('logs')).toBeGreaterThan(0);
    expect(shop.texts().some((t) => t.startsWith('Tu habilidad de Leñador subió'))).toBe(true);

    // Hay que esperar entre intentos, y la roca pide pico.
    shop.notifier.clear();
    shop.app.handle(shop.ana, { type: 'gather', toolId: axe, position: { x: 1, y: 2 } });
    expect(shop.texts()).toEqual(['Esperá a terminar lo que estás haciendo.']);
    shop.clock.advance(2000);
    shop.notifier.clear();
    shop.app.handle(shop.ana, { type: 'gather', toolId: axe, position: { x: 1, y: 2 } });
    expect(shop.texts()).toEqual(['Para eso necesitás un pico.']);
  });

  it('funde mineral y fabrica una daga en la herrería', () => {
    const shop = createWorkshop();
    const ore = shop.give('iron-ore', 5);
    shop.app.handle(shop.ana, { type: 'useItem', itemId: ore });
    expect(shop.count('iron-ingot')).toBe(5);
    expect(shop.count('iron-ore')).toBe(0);

    shop.give('smith-hammer', 1);
    const daggers = shop.count('dagger');
    shop.app.handle(shop.ana, { type: 'craft', recipe: 'dagger' });
    expect(shop.count('dagger')).toBe(daggers + 1);
    expect(shop.count('iron-ingot')).toBe(2);
  });

  it('guarda cosas en el banco solo cerca de la banquera', () => {
    const shop = createWorkshop();
    const gold = shop.world.items.backpackOf(shop.ana).find((i) => i.kind === 'gold');
    shop.notifier.clear();
    shop.app.handle(shop.ana, { type: 'moveItem', itemId: gold?.id ?? '', to: { type: 'bank' } });
    expect(shop.texts()).toEqual([]);
    expect(shop.world.items.bankOf(shop.ana).map((i) => i.kind)).toEqual(['gold']);
    const [inventory] = shop.notifier.ofType('inventory').slice(-1);
    expect(inventory?.message.type === 'inventory' && inventory.message.bank.length).toBe(1);

    // Lejos de la banquera no se puede.
    const far = createWorkshop();
    const player = far.world.get(far.ana);
    if (!player) throw new Error('sin jugador');
    // Salir del rincón (suroeste, sur) y alejarse cuatro pasos al este de la banquera.
    [5, 4, 2, 2, 2, 2].forEach((direction, i) => {
      far.clock.advance(400);
      far.app.handle(far.ana, {
        type: 'move',
        direction: direction as 2 | 4 | 5,
        mode: 'walk',
        seq: i + 1,
      });
    });
    expect(player.position).toEqual({ x: 4, y: 3 });
    const farGold = far.world.items.backpackOf(far.ana).find((i) => i.kind === 'gold');
    far.notifier.clear();
    far.app.handle(far.ana, { type: 'moveItem', itemId: farGold?.id ?? '', to: { type: 'bank' } });
    expect(far.texts()).toEqual(['Para usar el banco tenés que estar cerca de la banquera.']);
  });

  it('no se puede atacar a los personajes del pueblo', () => {
    const shop = createWorkshop();
    shop.notifier.clear();
    shop.app.handle(shop.ana, { type: 'attack', targetId: 'herrero' });
    expect(shop.texts()).toEqual(['No podés atacar a Tomás el herrero.']);
  });
});
