import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { Creature } from '../domain/creatures/creature';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

/** Campo abierto de 80×20, con la tirada fija en 0,2 (sale casi todo). */
function createField() {
  const map = new TileMap({
    width: 80,
    height: 20,
    terrain: new Array<Terrain>(1600).fill(Terrain.Grass),
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 4, y: 10 });
  const app = new GameApplication({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids: new SequentialIds(),
    random: new FixedRandom(0.2),
    notifier,
  });
  const join = (name: string): EntityId => {
    const result = app.join({ type: 'join', name, appearance: DEFAULT_APPEARANCE });
    if (!result.ok) throw new Error(result.reason);
    app.announceJoin(result.playerId);
    return result.playerId;
  };
  const to = (id: EntityId) => notifier.deliveries.filter((d) => d.to === id).map((d) => d.message);
  return { world, app, clock, notifier, join, to };
}

describe('rastrear', () => {
  it('encuentra animales y monstruos dentro del alcance, con dirección y distancia', () => {
    const f = createField();
    const ana = f.join('Ana');
    f.world.addCreature(new Creature('conejo', 'rabbit', { x: 14, y: 10 }));
    f.world.addCreature(new Creature('lobo', 'skeleton', { x: 4, y: 4 }));
    f.world.addCreature(new Creature('lejano', 'rabbit', { x: 78, y: 10 }));
    f.notifier.clear();

    f.app.handle(ana, { type: 'track', category: 'animals' });
    const at = f.world.get(ana)?.position ?? { x: 0, y: 0 };
    const animals = f.to(ana).find((m) => m.type === 'tracking');
    // El conejo, al este; el de la otra punta del campo queda fuera del alcance.
    expect(animals).toEqual({
      type: 'tracking',
      category: 'animals',
      found: [{ id: 'conejo', name: 'conejo', direction: 2, distance: 14 - at.x }],
    });

    f.app.handle(ana, { type: 'track', category: 'monsters' });
    const monsters = f
      .to(ana)
      .filter((m) => m.type === 'tracking')
      .at(-1);
    expect(monsters && 'found' in monsters && monsters.found.map((s) => s.id)).toEqual(['lobo']);
  });

  it('sigue un rastro encontrado: avisa dónde está y lo pierde si se aleja', () => {
    const f = createField();
    const ana = f.join('Ana');
    const conejo = new Creature('conejo', 'rabbit', { x: 14, y: 10 });
    f.world.addCreature(conejo);
    // Un rastro que no encontró no se puede seguir.
    f.app.handle(ana, { type: 'followTrack', targetId: 'conejo' });
    expect(f.to(ana).some((m) => m.type === 'trackPoint')).toBe(false);

    f.app.handle(ana, { type: 'track', category: 'animals' });
    f.app.handle(ana, { type: 'followTrack', targetId: 'conejo' });
    expect(f.to(ana)).toContainEqual({
      type: 'trackPoint',
      targetId: 'conejo',
      name: 'conejo',
      x: 14,
      y: 10,
    });

    conejo.position = { x: 79, y: 10 };
    f.clock.advance(1500);
    f.app.tick(f.clock.now());
    expect(f.to(ana)).toContainEqual({ type: 'trackPoint', targetId: 'conejo', lost: true });
  });
});
