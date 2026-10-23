import {
  DEFAULT_APPEARANCE,
  Terrain,
  TileMap,
  type EntityId,
  type ServerMessage,
} from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { Creature } from '../domain/creatures/creature';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

/**
 * Un patio de 14 × 8 partido por una pared en x = 7 (con una puerta en y = 2)
 * y, en la esquina de abajo a la derecha, el primer piso de una torre.
 */
function createYard() {
  const map = new TileMap({
    width: 14,
    height: 8,
    terrain: new Array<Terrain>(112).fill(Terrain.Grass),
    statics: [
      ...[0, 1, 3, 4, 5].map((y) => ({ kind: 'wall-y' as const, x: 7, y })),
      { kind: 'door-y', x: 7, y: 2 },
    ],
    regions: [{ name: 'Torre: primer piso', x: 10, y: 6, width: 4, height: 2, floor: 1 }],
  });
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
  const result = app.join({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
  if (!result.ok) throw new Error(result.reason);
  app.announceJoin(result.playerId);
  const ana = world.get(result.playerId);
  if (!ana) throw new Error('sin jugador');
  ana.teleport({ x: 3, y: 4 });
  ana.skills.set('magery', 1000);
  for (const [kind, amount] of [
    ['spellbook', 1],
    ['black-pearl', 20],
    ['nightshade', 20],
  ] as const)
    world.items.add(`obj-${kind}`, kind, amount, {
      type: 'backpack',
      ownerId: ana.id,
      position: { x: 0, y: 0 },
    });
  const texts = (to: EntityId): string[] =>
    notifier
      .ofType('system')
      .filter((d) => d.to === to)
      .map((d) => (d.message as Extract<ServerMessage, { type: 'system' }>).text);
  return { map, world, app, run, ana, texts };
}

describe('línea de visión en el juego', () => {
  it('un muro tapa al objetivo: el hechizo falla (y gasta el maná); con la puerta abierta, sale', () => {
    const { world, app, run, ana, texts, map } = createYard();
    const rat = new Creature('rata', 'rat', { x: 10, y: 2 });
    world.addCreature(rat);
    const full = rat.combat.current.hits;
    // Detrás de la pared (fila 4).
    rat.position = { x: 10, y: 4 };
    const mana = ana.combat.current.mana;
    app.handle(ana.id, { type: 'castSpell', spell: 'magic-arrow', targetId: rat.id });
    run(3000);
    expect(texts(ana.id).some((t) => t.includes('no está a la vista'))).toBe(true);
    expect(rat.combat.current.hits).toBe(full);
    expect(ana.combat.current.mana).toBeLessThan(mana);

    // Por la puerta abierta, en la misma fila, sí se ve.
    map.setDoorOpen({ x: 7, y: 2 }, true);
    ana.teleport({ x: 3, y: 2 });
    rat.position = { x: 10, y: 2 };
    app.handle(ana.id, { type: 'castSpell', spell: 'magic-arrow', targetId: rat.id });
    run(3000);
    expect(rat.combat.current.hits).toBeLessThan(full);
  });

  it('a alguien que está en otro piso no se le puede apuntar', () => {
    const { world, app, ana, texts } = createYard();
    const rat = new Creature('rata', 'rat', { x: 11, y: 7 });
    world.addCreature(rat);
    ana.teleport({ x: 9, y: 6 });
    app.handle(ana.id, { type: 'castSpell', spell: 'magic-arrow', targetId: rat.id });
    expect(texts(ana.id).at(-1)).toBe('Está en otro piso: desde acá no se puede apuntar.');
  });
});
