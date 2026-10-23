import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import { CREATURES } from '@fenix/shared/creatures/creature-catalog';
import { SPELLS } from '@fenix/shared/magic/spell-catalog';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { Creature } from '../domain/creatures/creature';
import { startCreatureCast } from '../domain/creatures/creature-magic';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

function createArena() {
  const map = new TileMap({
    width: 14,
    height: 5,
    terrain: new Array<Terrain>(70).fill(Terrain.Grass),
    statics: [],
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
  const result = app.join({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
  if (!result.ok) throw new Error(result.reason);
  app.announceJoin(result.playerId);
  const ana = world.get(result.playerId);
  if (!ana) throw new Error('sin jugador');
  return { world, app, clock, notifier, ana };
}

describe('criaturas que lanzan hechizos', () => {
  it('tienen el maná de su inteligencia y, sin maná, no lanzan más', () => {
    const { world, ana } = createArena();
    const mage = new Creature('mago', 'skeleton-mage', { x: 6, y: 2 });
    world.addCreature(mage);
    expect(mage.combat.current.maxMana).toBe(CREATURES['skeleton-mage'].intelligence);
    expect(CREATURES.lich.intelligence ?? 0).toBeGreaterThan(
      CREATURES['skeleton-mage'].intelligence ?? 0,
    );
    let casts = 0;
    let now = 0;
    for (let i = 0; i < 40; i++) {
      now += 20_000;
      mage.pendingCast = null;
      if (startCreatureCast(mage, ana, now, () => 0.99)) casts++;
    }
    // Con 0,99 elige siempre el último hechizo (bola de fuego): le alcanza para unas pocas.
    const cost = SPELLS.fireball.mana;
    expect(casts).toBe(Math.floor((CREATURES['skeleton-mage'].intelligence ?? 0) / cost));
    expect(mage.combat.current.mana).toBeLessThan(cost);
  });

  it('un golpe le corta el hechizo al mago esquelético', () => {
    const { world, app, clock, notifier, ana } = createArena();
    ana.teleport({ x: 5, y: 2 });
    const mage = new Creature('mago', 'skeleton-mage', { x: 6, y: 2 });
    world.addCreature(mage);
    mage.pendingCast = { spell: 'fireball', targetId: ana.id, resolveAt: clock.now() + 60_000 };
    app.handle(ana.id, { type: 'attack', targetId: mage.id });
    for (let t = 0; t < 4000 && mage.pendingCast; t += 100) {
      clock.advance(100);
      app.tick(clock.now());
    }
    expect(mage.pendingCast).toBeNull();
    expect(
      notifier
        .ofType('system')
        .some((d) => JSON.stringify(d.message).includes('pierde la concentración')),
    ).toBe(true);
  });
});
