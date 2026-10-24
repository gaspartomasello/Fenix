import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
// <módulos>
import { gameWith } from '../test-support/game';
// </módulos>

const newGame = gameWith([]);

/** Una calle y, lejos en el mapa, el primer piso de una casa que se ve en la calle. */
function createTown() {
  const map = new TileMap({
    width: 120,
    height: 30,
    terrain: new Array<Terrain>(3600).fill(Terrain.Grass),
    regions: [
      {
        name: 'Pueblo: una casa, primer piso',
        x: 100,
        y: 2,
        width: 8,
        height: 8,
        floor: 1,
        anchor: { x: -95, y: 3 },
      },
    ],
  });
  const world = new World(map, { x: 5, y: 5 });
  const app = newGame({
    world,
    worldClock: new WorldClock(0),
    clock: new FakeClock(0),
    ids: new SequentialIds(),
    random: new FixedRandom(0.5),
    notifier: new RecordingNotifier(),
  });
  const join = (name: string) => {
    const result = app.join({ type: 'join', name, appearance: DEFAULT_APPEARANCE });
    if (!result.ok) throw new Error(result.reason);
    app.announceJoin(result.playerId);
    const player = world.get(result.playerId);
    if (!player) throw new Error('sin jugador');
    return player;
  };
  return { world, join };
}

describe('pisos altos a la vista', () => {
  it('desde el balcón se ve la calle y desde la calle se ve el balcón', () => {
    const { world, join } = createTown();
    const ana = join('Ana');
    const beto = join('Beto');
    // Ana en el primer piso (se ve en 8, 8); Beto en la calle, al lado.
    ana.teleport({ x: 103, y: 5 });
    beto.teleport({ x: 10, y: 10 });
    expect(world.mobilesNear(ana.position).some((m) => m.id === beto.id)).toBe(true);
    expect(world.mobilesNear(beto.position).some((m) => m.id === ana.id)).toBe(true);
    // Lejos en la calle, ya no.
    beto.teleport({ x: 60, y: 10 });
    expect(world.mobilesNear(ana.position).some((m) => m.id === beto.id)).toBe(false);
  });
});
