import { DEFAULT_APPEARANCE, Terrain, TileMap, type EntityId } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import {
  FakeCharacterStore,
  FakeClock,
  FixedRandom,
  RecordingNotifier,
  SequentialIds,
} from '../test-support/fakes';
import { AUTOSAVE_MS } from './character-persistence';
import { GameApplication } from './game-application';
import type { CharacterStore, PasswordHasher } from './ports';

/** Hasher trivial para que los tests sean rápidos. */
const plainHasher: PasswordHasher = {
  hash: (password) => `plano:${password}`,
  verify: (password, hash) => hash === `plano:${password}`,
};

function createServer(characters: CharacterStore, passwords?: PasswordHasher) {
  const map = new TileMap({
    width: 12,
    height: 12,
    terrain: new Array<Terrain>(144).fill(Terrain.Grass),
  });
  const clock = new FakeClock(0);
  const world = new World(map, { x: 1, y: 1 });
  const app = new GameApplication({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids: new SequentialIds(),
    random: new FixedRandom(0.2),
    notifier: new RecordingNotifier(),
    characters,
    ...(passwords ? { passwords } : {}),
  });
  const join = (name: string, password?: string) =>
    app.join({
      type: 'join',
      name,
      appearance: DEFAULT_APPEARANCE,
      ...(password === undefined ? {} : { password }),
    });
  const enter = (name: string, password?: string): EntityId => {
    const result = join(name, password);
    if (!result.ok) throw new Error(result.reason);
    app.announceJoin(result.playerId);
    return result.playerId;
  };
  return { app, world, clock, join, enter };
}

describe('guardado de personajes', () => {
  it('al volver conserva lugar, habilidades, atributos, objetos, reputación y gremio', () => {
    const store = new FakeCharacterStore();
    const first = createServer(store);
    const ana = first.enter('Ana');
    first.app.handle(ana, { type: 'move', direction: 2, mode: 'walk', seq: 1 });
    first.app.handle(ana, { type: 'social', command: 'guild-create', name: 'Orden', tag: 'ORD' });
    const player = first.world.get(ana);
    if (!player) throw new Error('sin Ana');
    player.reputation.award(120, 80);
    player.combat.takeDamage(10);
    player.combat.raiseAttribute('intelligence');
    const position = player.position;
    const backpack = first.world.items
      .backpackOf(ana)
      .map((i) => i.kind)
      .sort();
    first.app.leave(ana);

    // Otro arranque del servidor con el mismo almacén.
    const second = createServer(store);
    const again = second.enter('ana');
    const restored = second.world.get(again);
    expect(restored?.name).toBe('Ana');
    expect(restored?.position).toEqual(position);
    expect(restored?.combat.current.hits).toBe(player.combat.current.hits);
    expect(restored?.reputation.fame).toBe(120);
    expect(restored?.combat.baseAttributes.intelligence).toBe(31);
    expect(second.world.guilds.of('Ana')?.tag).toBe('ORD');
    expect(
      second.world.items
        .backpackOf(again)
        .map((i) => i.kind)
        .sort(),
    ).toEqual(backpack);
  });

  it('guarda solo a intervalos mientras se juega', () => {
    const store = new FakeCharacterStore();
    const server = createServer(store);
    server.enter('Ana');
    expect(store.saves).toEqual(['Ana']);
    server.app.tick(100);
    server.app.tick(AUTOSAVE_MS + 200);
    expect(store.saves).toEqual(['Ana', 'Ana']);
  });

  it('pide la contraseña correcta en el servidor en línea', () => {
    const store = new FakeCharacterStore();
    const server = createServer(store, plainHasher);
    expect(server.join('Ana')).toEqual({ ok: false, reason: 'Escribí la contraseña.' });
    expect(server.join('Ana', 'corta').ok).toBe(false);
    const ana = server.enter('Ana', 'secreta1');
    expect(store.find('ana')?.passwordHash).toBe('plano:secreta1');
    server.app.leave(ana);

    expect(server.join('Ana', 'otra-clave')).toEqual({
      ok: false,
      reason: 'Contraseña incorrecta.',
    });
    expect(server.join('Ana', 'secreta1').ok).toBe(true);
    expect(server.join('ANA', 'secreta1')).toEqual({
      ok: false,
      reason: 'Ese personaje ya está en el mundo.',
    });
  });
});
