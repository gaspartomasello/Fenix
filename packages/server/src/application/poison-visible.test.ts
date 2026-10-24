import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import type { MobileHealthMessage } from '@fenix/shared/protocol/messages';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { gameWith } from '../test-support/game';
import { combatModule } from './features/combat/combat.module';

const newGame = gameWith([combatModule]);

describe('veneno a la vista', () => {
  it('los demás ven la barra verde mientras dura el veneno, y vuelve a su color al pasar', () => {
    const clock = new FakeClock();
    const notifier = new RecordingNotifier();
    const world = new World(
      new TileMap({ width: 6, height: 6, terrain: new Array(36).fill(Terrain.Grass) }),
      { x: 2, y: 2 },
    );
    const app = newGame({
      world,
      worldClock: new WorldClock(clock.now()),
      clock,
      ids: new SequentialIds(),
      random: new FixedRandom(),
      notifier,
    });
    const join = (name: string): string => {
      const result = app.join({ type: 'join', name, appearance: DEFAULT_APPEARANCE });
      if (!result.ok) throw new Error(result.reason);
      app.announceJoin(result.playerId);
      return result.playerId;
    };
    const ana = join('Ana');
    const beto = join('Beto');
    const player = world.get(ana);
    if (!player) throw new Error('sin jugador');
    const seenByBeto = (): MobileHealthMessage[] =>
      notifier
        .ofType('mobileHealth')
        .filter((d) => d.to === beto)
        .map((d) => d.message as MobileHealthMessage)
        .filter((m) => m.id === ana);

    player.combat.applyEffect('poison', 1, 3000, clock.now());
    app.kernel.mobiles.sendEffects(player);
    expect(seenByBeto().at(-1)?.poisoned).toBe(true);
    expect(world.snapshotOf(player).poisoned).toBe(true);

    for (let i = 0; i < 40; i++) {
      clock.advance(250);
      app.tick(clock.now());
    }
    expect(player.combat.effect('poison')).toBeUndefined();
    expect(seenByBeto().at(-1)?.poisoned).toBeUndefined();
    expect(world.snapshotOf(player).poisoned).toBeUndefined();
  });
});
