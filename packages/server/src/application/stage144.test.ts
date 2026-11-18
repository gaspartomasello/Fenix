import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { Creature } from '../domain/creatures/creature';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { gameWith } from '../test-support/game';
import { combatModule } from './features/combat/combat.module';
import { itemsModule } from './features/items/items.module';
import { movementModule } from './features/movement/movement.module';

const newGame = gameWith([movementModule, itemsModule, combatModule]);

/** Cuántas veces le pega Ana a un trol (que no se muere) en 20 segundos. */
function swingsIn20s(dexterity: number, tired = false): number {
  const map = new TileMap({
    width: 8,
    height: 3,
    terrain: new Array<Terrain>(24).fill(Terrain.Grass),
  });
  const clock = new FakeClock(0);
  const world = new World(map, { x: 2, y: 1 });
  const app = newGame({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids: new SequentialIds(),
    random: new FixedRandom(0.99),
    notifier: new RecordingNotifier(),
  });
  const joined = app.join({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
  if (!joined.ok) throw new Error(joined.reason);
  const ana = world.get(joined.playerId);
  if (!ana) throw new Error('sin jugador');
  ana.combat.setBaseAttributes({ ...ana.combat.baseAttributes, dexterity });
  ana.combat.restoreStamina(1000);
  ana.combat.invulnerable = true;
  if (tired) ana.combat.spendStamina(ana.combat.current.maxStamina - 1);
  const ogre = new Creature('ogro', 'troll', { x: 3, y: 1 });
  world.addCreature(ogre);
  app.handle(ana.id, { type: 'attack', targetId: 'ogro' });
  let swings = 0;
  let last = ana.combat.nextSwingAt;
  for (let t = 0; t < 20000; t += 100) {
    clock.advance(100);
    app.tick(clock.now());
    ogre.combat.heal(1000);
    if (tired) ana.combat.spendStamina(ana.combat.current.stamina - 1);
    if (ana.combat.nextSwingAt !== last) {
      swings++;
      last = ana.combat.nextSwingAt;
    }
  }
  return swings;
}

describe('etapa 144: la destreza acelera los golpes y el cansancio los frena', () => {
  it('con más destreza se pega más seguido', () => {
    expect(swingsIn20s(100)).toBeGreaterThan(swingsIn20s(40));
    expect(swingsIn20s(40)).toBeGreaterThan(swingsIn20s(10));
  });

  it('sin energía se pega más lento, como en OSI', () => {
    expect(swingsIn20s(100, true)).toBeLessThan(swingsIn20s(100));
  });
});
