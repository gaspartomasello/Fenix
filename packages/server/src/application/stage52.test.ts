import { DEFAULT_APPEARANCE, type Appearance } from '@fenix/shared/character/appearance';
import type { ItemKind } from '@fenix/shared/items/item-catalog';
import type { EntityId, ServerMessage } from '@fenix/shared/protocol/messages';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { Creature } from '../domain/creatures/creature';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

/** Campo de 12×5 de pasto con una columna de agua al este. */
function createField() {
  const terrain = new Array<Terrain>(60).fill(Terrain.Grass);
  for (let y = 0; y < 5; y++) terrain[y * 12 + 11] = Terrain.Water;
  const map = new TileMap({ width: 12, height: 5, terrain, statics: [] });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 2, y: 2 });
  const app = new GameApplication({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids: new SequentialIds(),
    random: new FixedRandom(0.2),
    notifier,
  });
  const run = (ms: number): void => {
    for (let elapsed = 0; elapsed < ms; elapsed += 100) {
      clock.advance(100);
      app.tick(clock.now());
    }
  };
  const join = (name: string, appearance: Appearance = DEFAULT_APPEARANCE): EntityId => {
    const result = app.join({ type: 'join', name, appearance });
    if (!result.ok) throw new Error(result.reason);
    app.announceJoin(result.playerId);
    return result.playerId;
  };
  let next = 0;
  const give = (owner: EntityId, kind: ItemKind, amount = 1): EntityId => {
    const id = `obj${++next}`;
    world.items.add(id, kind, amount, {
      type: 'backpack',
      ownerId: owner,
      position: { x: 0, y: 0 },
    });
    return id;
  };
  const texts = (): string[] =>
    notifier.ofType('system').map((d) => (d.message.type === 'system' ? d.message.text : ''));
  const last = <T extends ServerMessage['type']>(type: T, to: EntityId) =>
    notifier
      .ofType(type)
      .filter((d) => d.to === to)
      .at(-1)?.message as Extract<ServerMessage, { type: T }> | undefined;
  return { world, app, run, join, give, texts, last };
}

describe('etapa 52: armas nuevas y peto de mujer', () => {
  it('el peto de placas de mujer solo lo viste una mujer', () => {
    const f = createField();
    const tomas = f.join('Tomas');
    const plate = f.give(tomas, 'female-plate');
    f.app.handle(tomas, { type: 'useItem', itemId: plate });
    expect(f.texts()).toContain('Ese peto está hecho para una mujer.');
    expect(f.world.items.lookOf(tomas).torso).toBeUndefined();

    const ana = f.join('Ana', { ...DEFAULT_APPEARANCE, gender: 'female' });
    const hers = f.give(ana, 'female-plate');
    f.app.handle(ana, { type: 'useItem', itemId: hers });
    expect(f.world.items.lookOf(ana).torso).toBe('female-plate');
  });

  it('la ballesta dispara virotes, no flechas', () => {
    const f = createField();
    const ana = f.join('Ana');
    const crossbow = f.give(ana, 'crossbow');
    f.app.handle(ana, { type: 'useItem', itemId: crossbow });
    expect(f.world.items.lookOf(ana)).toEqual({ rightHand: 'crossbow' });
    f.give(ana, 'arrow', 5);

    const rat = new Creature('rata', 'rat', { x: 8, y: 2 });
    f.world.addCreature(rat);
    rat.combat.applyEffect('paralyzed', 0, 60_000, 0);
    f.app.handle(ana, { type: 'attack', targetId: 'rata' });
    f.run(500);
    expect(f.texts()).toContain('No te quedan virotes.');

    f.give(ana, 'bolt', 3);
    f.app.handle(ana, { type: 'attack', targetId: 'rata' });
    f.run(500);
    expect(f.world.items.countInBackpack(ana, 'bolt')).toBe(2);
    expect(f.world.items.countInBackpack(ana, 'arrow')).toBe(5);
    expect(f.last('swing', ana)?.ranged).toBe(true);
  });
});
