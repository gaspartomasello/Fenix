import { DEFAULT_APPEARANCE, Direction, Terrain, TileMap, type EntityId } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

function createField() {
  const map = new TileMap({
    width: 30,
    height: 10,
    terrain: new Array<Terrain>(300).fill(Terrain.Grass),
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 4, y: 4 });
  const app = new GameApplication({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids: new SequentialIds(),
    random: new FixedRandom(0.5),
    notifier,
  });
  const result = app.join({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
  if (!result.ok) throw new Error(result.reason);
  app.announceJoin(result.playerId);
  const ana: EntityId = result.playerId;
  const player = world.get(ana);
  if (!player) throw new Error('sin jugador');
  const to = () => notifier.deliveries.filter((d) => d.to === ana).map((d) => d.message);
  let seq = 0;
  const step = (mode: 'walk' | 'run') => {
    clock.advance(1000);
    app.handle(ana, { type: 'move', direction: Direction.East, mode, seq: ++seq });
  };
  /** Le carga lingotes en la mochila (de a 60 por pila) y avisa el inventario. */
  const load = (ingots: number) => {
    for (let left = ingots; left > 0; left -= 60)
      world.items.add(`lingotes-${left}`, 'iron-ingot', Math.min(60, left), {
        type: 'backpack',
        ownerId: ana,
        position: { x: 0, y: 0 },
      });
    // Cualquier cambio de inventario recalcula el peso: comer una manzana alcanza.
    world.items.add('manzana', 'apple', 1, {
      type: 'backpack',
      ownerId: ana,
      position: { x: 0, y: 0 },
    });
    app.handle(ana, { type: 'useItem', itemId: 'manzana' });
  };
  return { app, world, player, to, step, load, clock };
}

describe('etapa 63: peso y carga', () => {
  it('el inventario dice cuánto pesa lo que lleva', () => {
    const f = createField();
    f.load(100);
    const inventory = f
      .to()
      .filter((m) => m.type === 'inventory')
      .at(-1);
    expect(inventory && 'weight' in inventory ? inventory.weight : 0).toBeGreaterThanOrEqual(50);
  });

  it('con sobrepeso no corre y cada paso le gasta energía; muy cargado no se mueve', () => {
    const f = createField();
    const max = 40 + Math.floor(f.player.combat.attributes.strength * 3.5);
    // Un poco por encima del máximo (lingotes de media piedra).
    f.load(Math.ceil(((max + 15) * 2) / 60) * 60);
    expect(f.player.carried).toBeGreaterThan(max);
    const stamina = f.player.combat.current.stamina;
    const start = f.player.position.x;
    f.step('run');
    expect(f.player.position.x).toBe(start + 1);
    expect(f.player.combat.current.stamina).toBeLessThan(stamina);

    // Muchísimo más: ni caminando.
    f.load(400);
    const before = f.player.position.x;
    f.step('walk');
    expect(f.player.position.x).toBe(before);
    expect(f.to()).toContainEqual({
      type: 'system',
      text: 'Llevás demasiado peso: no podés moverte.',
    });
  });
});
