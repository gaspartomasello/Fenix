import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import type { ItemKind } from '@fenix/shared/items/item-catalog';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { gameWith } from '../test-support/game';
import { combatModule } from './features/combat/combat.module';
import { itemsModule } from './features/items/items.module';
import { movementModule } from './features/movement/movement.module';
import { washingModule } from './features/washing/washing.module';

const newGame = gameWith([movementModule, itemsModule, combatModule, washingModule]);

/** Campo de 20×5 de pasto: un río al este y un bebedero de caballos al oeste. */
function createField() {
  const terrain = new Array<Terrain>(100).fill(Terrain.Grass);
  for (let y = 0; y < 5; y++) terrain[y * 20 + 19] = Terrain.Water;
  const map = new TileMap({
    width: 20,
    height: 5,
    terrain,
    statics: [{ kind: 'water-trough', x: 1, y: 4 }],
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 9, y: 2 });
  const app = newGame({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids: new SequentialIds(),
    random: new FixedRandom(0.2),
    notifier,
  });
  const result = app.join({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
  if (!result.ok) throw new Error(result.reason);
  app.announceJoin(result.playerId);
  const ana = result.playerId;
  const player = world.get(ana);
  if (!player) throw new Error('sin jugador');
  let next = 0;
  const give = (kind: ItemKind, amount = 1): EntityId => {
    const id = `obj${++next}`;
    world.items.add(id, kind, amount, { type: 'backpack', ownerId: ana, position: { x: 0, y: 0 } });
    return id;
  };
  const run = (ms: number): void => {
    for (let elapsed = 0; elapsed < ms; elapsed += 100) {
      clock.advance(100);
      app.tick(clock.now());
    }
  };
  const count = (kind: ItemKind): number => world.items.countInBackpack(ana, kind);
  const texts = (): string[] =>
    notifier.ofType('system').map((d) => (d.message.type === 'system' ? d.message.text : ''));
  return { app, ana, player, give, run, count, texts };
}

describe('etapa 142: vendas ensangrentadas que se lavan en el agua', () => {
  it('al terminar de vendar queda una venda ensangrentada en la mochila', () => {
    const f = createField();
    const bandages = f.count('bandage');
    const bandage = f.give('bandage', 3);
    f.player.combat.takeDamage(40);
    f.app.handle(f.ana, { type: 'useOn', itemId: bandage, targetId: f.ana });
    expect(f.count('bloody-bandage')).toBe(0);
    f.run(8000);
    expect(f.count('bandage')).toBe(bandages + 2);
    expect(f.count('bloody-bandage')).toBe(1);
  });

  it('lejos del agua no se pueden lavar', () => {
    const f = createField();
    const bloody = f.give('bloody-bandage', 4);
    f.app.handle(f.ana, { type: 'useItem', itemId: bloody });
    expect(f.texts().at(-1)).toContain('Necesitás agua cerca');
    expect(f.count('bloody-bandage')).toBe(4);
  });

  it('junto a un río se lavan todas y vuelven a ser vendas', () => {
    const f = createField();
    const bandages = f.count('bandage');
    const bloody = f.give('bloody-bandage', 4);
    f.player.teleport({ x: 17, y: 2 });
    f.app.handle(f.ana, { type: 'useItem', itemId: bloody });
    expect(f.count('bloody-bandage')).toBe(0);
    expect(f.count('bandage')).toBe(bandages + 4);
  });

  it('también en un bebedero de caballos', () => {
    const f = createField();
    const bloody = f.give('bloody-bandage', 1);
    f.player.teleport({ x: 2, y: 3 });
    f.app.handle(f.ana, { type: 'useItem', itemId: bloody });
    expect(f.count('bloody-bandage')).toBe(0);
    expect(f.texts().at(-1) ?? '').not.toContain('Necesitás');
  });
});
