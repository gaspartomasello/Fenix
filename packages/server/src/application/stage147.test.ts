import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import { RECIPES } from '@fenix/shared/economy/crafting';
import { FURNITURE_KINDS, ITEMS, type ItemKind } from '@fenix/shared/items/item-catalog';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { gameWith } from '../test-support/game';
import { economyModule } from './features/economy/economy.module';
import { itemsModule } from './features/items/items.module';
import { movementModule } from './features/movement/movement.module';

const newGame = gameWith([movementModule, itemsModule, economyModule]);

function workshop() {
  const map = new TileMap({
    width: 6,
    height: 4,
    terrain: new Array<Terrain>(24).fill(Terrain.Grass),
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 2, y: 2 });
  const app = newGame({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids: new SequentialIds(),
    random: new FixedRandom(0.1),
    notifier,
  });
  const joined = app.join({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
  if (!joined.ok) throw new Error(joined.reason);
  const ana = world.get(joined.playerId);
  if (!ana) throw new Error('sin jugador');
  let next = 0;
  const give = (kind: ItemKind, amount: number): void => {
    world.items.add(`obj${++next}`, kind, amount, {
      type: 'backpack',
      ownerId: ana.id,
      position: { x: 0, y: 0 },
    });
  };
  const count = (kind: ItemKind): number => world.items.countInBackpack(ana.id, kind);
  const texts = (): string[] =>
    notifier.ofType('system').map((d) => (d.message.type === 'system' ? d.message.text : ''));
  return { app, ana, give, count, texts, clock };
}

describe('etapa 147: carpintería fabrica muebles, con la habilidad del juego', () => {
  it('cada mueble tiene su receta de carpintería y su pieza', () => {
    for (const kind of FURNITURE_KINDS) {
      expect(ITEMS[kind].furniture).toBeDefined();
      const recipe = RECIPES.find((r) => r.result === kind);
      expect(recipe?.skill).toBe('carpentry');
      expect(recipe?.minSkill).toBeGreaterThan(0);
    }
  });

  it('sin la habilidad mínima no sale; con ella, sí, y gasta las tablas', () => {
    const f = workshop();
    f.give('saw', 1);
    f.give('boards', 40);
    f.ana.skills.set('carpentry', 200);
    f.app.handle(f.ana.id, { type: 'craft', recipe: 'furniture-chair' });
    expect(f.texts().at(-1)).toContain('no alcanza');
    expect(f.count('furniture-chair')).toBe(0);
    f.ana.skills.set('carpentry', 300);
    f.clock.advance(5000);
    f.app.handle(f.ana.id, { type: 'craft', recipe: 'furniture-chair' });
    expect(f.count('furniture-chair')).toBe(1);
    expect(f.count('boards')).toBe(27);
  });

  it('las camas piden casi el máximo de carpintería (94,7)', () => {
    const bed = RECIPES.find((r) => r.result === 'furniture-double-bed');
    expect(bed?.minSkill).toBe(947);
  });
});
