import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import type { TreasureMapMessage } from '@fenix/shared/protocol/messages';
import { TREASURE_CHEST_MS, treasureHint } from '@fenix/shared/treasure/treasure';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { captureCharacter, parseSavedCharacter } from '../domain/persistence/saved-character';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

function createRoom() {
  const map = new TileMap({
    width: 30,
    height: 30,
    terrain: new Array<Terrain>(900).fill(Terrain.Grass),
    statics: [],
    regions: [],
  });
  const world = new World(map, { x: 5, y: 5 });
  const notifier = new RecordingNotifier();
  const clock = new FakeClock(0);
  const app = new GameApplication({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids: new SequentialIds(),
    // Con 0,1 la marca cae en (3, 3) y la pala acierta enseguida.
    random: new FixedRandom(0.1),
    notifier,
  });
  const result = app.join({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
  if (!result.ok) throw new Error(result.reason);
  app.announceJoin(result.playerId);
  const ana = result.playerId;
  const give = (id: string, kind: 'treasure-map' | 'shovel') =>
    world.items.add(id, kind, 1, { type: 'backpack', ownerId: ana, position: { x: 0, y: 0 } });
  const player = world.get(ana);
  if (!player) throw new Error('sin jugador');
  return { world, app, notifier, clock, ana, player, give };
}

describe('búsqueda de tesoros', () => {
  it('leer un mapa marca dónde está el tesoro y lo muestra', () => {
    const { app, notifier, ana, give } = createRoom();
    const map = give('mapa', 'treasure-map');
    app.handle(ana, { type: 'useItem', itemId: map.id });
    expect(map.treasure).toEqual({ x: 3, y: 3, level: 1 });
    const shown = notifier.ofType('treasureMap').at(-1)?.message as TreasureMapMessage;
    expect(shown.mark).toEqual({ x: 3, y: 3, level: 1 });
    expect(shown.name).toBe('mapa del tesoro gastado');
  });

  it('cavando lejos no sale nada; cerca de la cruz aparece el cofre con oro y sus guardianes', () => {
    const { world, app, clock, ana, player, give } = createRoom();
    const map = give('mapa', 'treasure-map');
    map.treasure = { x: 3, y: 3, level: 1 };
    const shovel = give('pala', 'shovel');
    player.teleport({ x: 12, y: 12 });
    app.handle(ana, { type: 'dig', toolId: shovel.id, position: { x: 13, y: 12 } });
    expect(world.items.get(map.id)).toBeDefined();

    clock.advance(5000);
    player.teleport({ x: 4, y: 3 });
    const before = world.allCreatures().length;
    app.handle(ana, { type: 'dig', toolId: shovel.id, position: { x: 4, y: 4 } });
    expect(world.items.get(map.id)).toBeUndefined();
    const chest = world.items.all().find((i) => i.kind === 'treasure-chest');
    expect(chest?.location).toEqual({ type: 'ground', position: { x: 3, y: 3 } });
    const inside = world.items.contentsOf(chest?.id ?? '');
    expect(inside.find((i) => i.kind === 'gold')?.amount).toBeGreaterThan(0);
    const guardians = world.allCreatures().slice(before);
    expect(guardians.map((g) => g.definition.kind)).toEqual(['skeleton', 'skeleton']);
    expect(guardians.every((g) => g.temporary)).toBe(true);

    // Al rato el cofre (y lo que quedó adentro) se deshace.
    clock.advance(TREASURE_CHEST_MS + 1);
    app.tick(clock.now());
    expect(world.items.get(chest?.id ?? '')).toBeUndefined();
    expect(inside.every((i) => !world.items.get(i.id))).toBe(true);
  });

  it('sin pala, sin el mapa encima o sin minería suficiente no se desentierra', () => {
    const { world, app, clock, ana, player, give } = createRoom();
    const shovel = give('pala', 'shovel');
    player.teleport({ x: 4, y: 3 });
    app.handle(ana, { type: 'dig', toolId: shovel.id, position: { x: 3, y: 3 } });
    expect(world.items.all().some((i) => i.kind === 'treasure-chest')).toBe(false);

    const map = give('mapa', 'treasure-map');
    map.treasure = { x: 3, y: 3, level: 4 };
    player.skills.set('mining', 200);
    clock.advance(5000);
    app.handle(ana, { type: 'dig', toolId: shovel.id, position: { x: 3, y: 3 } });
    expect(world.items.all().some((i) => i.kind === 'treasure-chest')).toBe(false);
    expect(world.items.get(map.id)).toBeDefined();
  });

  it('la marca del mapa se guarda con el personaje', () => {
    const { world, player, give } = createRoom();
    const map = give('mapa', 'treasure-map');
    map.treasure = { x: 7, y: 9, level: 3 };
    const saved = parseSavedCharacter(
      JSON.parse(JSON.stringify(captureCharacter(player, world, null))),
    );
    expect(saved?.items.find((i) => i.kind === 'treasure-map')?.treasure).toEqual({
      x: 7,
      y: 9,
      level: 3,
    });
  });

  it('la pista dice hacia dónde queda respecto del lugar más cercano', () => {
    const town = { name: 'Puerto Ceniza', x: 100, y: 100 };
    expect(treasureHint({ x: 102, y: 101 }, town)).toBe('cerca de Puerto Ceniza');
    // En el mapa girado, sumar x e y por igual es ir hacia abajo: al sur.
    expect(treasureHint({ x: 130, y: 130 }, town)).toBe('al sur de Puerto Ceniza');
    expect(treasureHint({ x: 130, y: 70 }, town)).toBe('al este de Puerto Ceniza');
  });
});
