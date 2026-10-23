import {
  DEFAULT_APPEARANCE,
  armorOf,
  Terrain,
  TileMap,
  type Appearance,
  type EntityId,
  type ItemKind,
  type ServerMessage,
} from '@fenix/shared';
import { describe, expect, it } from 'vitest';
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

describe('etapa 54: equipo completo', () => {
  it('las piezas sueltas van a su lugar: cuello, brazos y manos, y suman armadura', () => {
    const f = createField();
    const ana = f.join('Ana');
    const kit = [
      'plate-chest',
      'plate-gorget',
      'plate-arms',
      'plate-gloves',
      'plate-legs',
      'plate-helm',
    ] as const;
    for (const kind of kit) f.app.handle(ana, { type: 'useItem', itemId: f.give(ana, kind) });
    const look = f.world.items.lookOf(ana);
    expect(look).toMatchObject({
      torso: 'plate-chest',
      neck: 'plate-gorget',
      arms: 'plate-arms',
      hands: 'plate-gloves',
      legs: 'plate-legs',
      head: 'plate-helm',
    });
    // El juego completo protege más que el peto solo.
    expect(armorOf(look)).toBeGreaterThan(armorOf({ torso: 'plate-chest' }) + 10);
    // Otro par de guantes reemplaza al que tenía puesto.
    f.app.handle(ana, { type: 'useItem', itemId: f.give(ana, 'leather-gloves') });
    expect(f.world.items.lookOf(ana).hands).toBe('leather-gloves');
    expect(f.world.items.countInBackpack(ana, 'plate-gloves')).toBe(1);
  });
});
