import {
  DEFAULT_APPEARANCE,
  Direction,
  MOUNTED_MOVE_DURATION_MS,
  MOUNTS,
  Terrain,
  TileMap,
  type EntityId,
} from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { Creature } from '../domain/creatures/creature';
import { Npc } from '../domain/npcs/npc';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import {
  FakeCharacterStore,
  FakeClock,
  FixedRandom,
  RecordingNotifier,
  SequentialIds,
} from '../test-support/fakes';
import { GameApplication } from './game-application';

/** Campo de 12×6 con el caballerizo al lado de donde aparece el jugador. */
function createStable(store = new FakeCharacterStore()) {
  const map = new TileMap({
    width: 12,
    height: 6,
    terrain: new Array<Terrain>(72).fill(Terrain.Grass),
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const ids = new SequentialIds();
  const world = new World(map, { x: 2, y: 2 });
  world.addNpc(new Npc('bautista', 'stablemaster', { x: 3, y: 1 }));
  const app = new GameApplication({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids,
    random: new FixedRandom(0.2),
    notifier,
    characters: store,
  });
  const join = (name: string): EntityId => {
    const result = app.join({ type: 'join', name, appearance: DEFAULT_APPEARANCE });
    if (!result.ok) throw new Error(result.reason);
    app.announceJoin(result.playerId);
    return result.playerId;
  };
  const ana = join('Ana');
  const gold = (amount: number): void => {
    world.items.add(ids.next(), 'gold', amount, {
      type: 'backpack',
      ownerId: ana,
      position: { x: 0, y: 0 },
    });
  };
  const texts = (): string[] =>
    notifier.ofType('system').map((d) => (d.message.type === 'system' ? d.message.text : ''));
  return { world, app, clock, notifier, ana, gold, texts, store, join };
}

describe('monturas', () => {
  it('se compra en la caballeriza y la montura sigue a su dueño sin pelear', () => {
    const f = createStable();
    f.app.handle(f.ana, { type: 'buyMount', vendorId: 'bautista', mount: 'horse-black' });
    expect(f.texts().at(-1)).toContain('No te alcanza');
    expect(f.world.petOf(f.ana)).toBeUndefined();

    f.gold(MOUNTS['horse-black'].price);
    const before = f.world.items.countInBackpack(f.ana, 'gold');
    f.app.handle(f.ana, { type: 'buyMount', vendorId: 'bautista', mount: 'horse-black' });
    const pet = f.world.petOf(f.ana);
    expect(pet?.body).toBe('horse-black');
    expect(f.world.items.countInBackpack(f.ana, 'gold')).toBe(before - MOUNTS['horse-black'].price);
    expect(f.notifier.ofType('mobileAppeared').at(-1)?.message).toMatchObject({
      mobile: { body: 'horse-black', ownerId: f.ana },
    });
    // Una sola por jugador.
    f.gold(2000);
    f.app.handle(f.ana, { type: 'buyMount', vendorId: 'bautista', mount: 'llama' });
    expect(f.texts().at(-1)).toContain('Ya tenés una montura');

    // Un lobo que pasa no la ataca, y ella tampoco pelea.
    f.world.addCreature(new Creature('lobo', 'wolf', { x: 8, y: 4 }));
    f.app.tick(100);
    expect(pet?.combat.targetId).toBeNull();
  });

  it('montado se anda al doble de rápido y al desmontar la montura vuelve al lado', () => {
    const f = createStable();
    f.gold(1000);
    f.app.handle(f.ana, { type: 'buyMount', vendorId: 'bautista', mount: 'horse-chestnut' });
    const pet = f.world.petOf(f.ana);
    if (!pet) throw new Error('sin montura');

    f.app.handle(f.ana, { type: 'mount', petId: pet.id });
    const player = f.world.get(f.ana);
    expect(player?.mount).toBe('horse-chestnut');
    expect(f.world.petOf(f.ana)).toBeUndefined();
    expect(f.notifier.ofType('mountChanged').at(-1)?.message).toEqual({
      type: 'mountChanged',
      id: f.ana,
      mount: 'horse-chestnut',
    });
    expect(f.world.snapshotOf(player as never).mount).toBe('horse-chestnut');

    // Al paso montado se puede dar un paso cada 200 ms (a pie, cada 400).
    f.notifier.clear();
    f.app.handle(f.ana, { type: 'move', direction: Direction.East, mode: 'walk', seq: 1 });
    f.clock.advance(MOUNTED_MOVE_DURATION_MS.walk);
    f.app.handle(f.ana, { type: 'move', direction: Direction.East, mode: 'walk', seq: 2 });
    expect(f.notifier.ofType('moveAck')).toHaveLength(2);
    // Galopar no gasta la energía del jinete.
    const stamina = player?.combat.current.stamina;
    for (let i = 0; i < 6; i++) {
      f.clock.advance(MOUNTED_MOVE_DURATION_MS.run);
      f.app.handle(f.ana, { type: 'move', direction: Direction.South, mode: 'run', seq: 3 + i });
    }
    expect(player?.combat.current.stamina).toBe(stamina);

    f.app.handle(f.ana, { type: 'dismount' });
    expect(player?.mount).toBeNull();
    const back = f.world.petOf(f.ana);
    expect(back?.body).toBe('horse-chestnut');
    expect(Math.max(Math.abs((back?.position.x ?? 99) - (player?.position.x ?? 0)), 1)).toBe(1);
  });

  it('no se sube a una montura ajena ni lejana, y se cae al morir', () => {
    const f = createStable();
    f.gold(1000);
    f.app.handle(f.ana, { type: 'buyMount', vendorId: 'bautista', mount: 'llama' });
    const pet = f.world.petOf(f.ana);
    if (!pet) throw new Error('sin montura');
    const bruno = f.join('Bruno');
    f.app.handle(bruno, { type: 'mount', petId: pet.id });
    expect(f.world.get(bruno)?.mount).toBeNull();

    const player = f.world.get(f.ana);
    const at = player?.position ?? { x: 0, y: 0 };
    pet.position = { x: at.x + 6, y: at.y };
    f.app.handle(f.ana, { type: 'mount', petId: pet.id });
    expect(f.texts().at(-1)).toContain('Acercate a tu montura');
    pet.position = { x: at.x + 1, y: at.y };
    f.app.handle(f.ana, { type: 'mount', petId: pet.id });
    expect(player?.mount).toBe('llama');

    // Muere montado: queda a pie y la llama aparece al lado.
    player?.combat.applyEffect('poison', 5, 60_000, 0);
    player?.combat.takeDamage((player?.combat.current.hits ?? 1) - 1);
    for (let t = 2000; t <= 20_000 && !player?.combat.isDead; t += 2000) f.app.tick(t);
    expect(player?.combat.isDead).toBe(true);
    expect(player?.mount).toBeNull();
    expect(f.world.petOf(f.ana)?.body).toBe('llama');
  });

  it('la montura se guarda con el personaje: montado o suelta a su lado', () => {
    const store = new FakeCharacterStore();
    const f = createStable(store);
    f.gold(2000);
    f.app.handle(f.ana, { type: 'buyMount', vendorId: 'bautista', mount: 'runner' });
    f.app.leave(f.ana);
    expect(store.find('Ana')?.mount).toEqual({ kind: 'runner', riding: false });
    // Al irse, la montura suelta también se va del mundo.
    expect(f.world.allCreatures().filter((c) => c.isPet)).toHaveLength(0);

    const again = f.join('Ana');
    const pet = f.world.petOf(again);
    expect(pet?.body).toBe('runner');
    f.app.handle(again, { type: 'mount', petId: pet?.id ?? '' });
    f.app.leave(again);
    expect(store.find('Ana')?.mount).toEqual({ kind: 'runner', riding: true });
    const third = f.join('Ana');
    expect(f.world.get(third)?.mount).toBe('runner');
  });
});
