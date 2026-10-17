import { DEFAULT_APPEARANCE, Terrain, TileMap, type GmCommand } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

function createApp() {
  const map = new TileMap({
    width: 20,
    height: 20,
    terrain: new Array<Terrain>(400).fill(Terrain.Grass),
    statics: [],
    regions: [],
  });
  const world = new World(map, { x: 10, y: 10 });
  const notifier = new RecordingNotifier();
  const clock = new FakeClock(0);
  const app = new GameApplication({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids: new SequentialIds(),
    random: new FixedRandom(0.5),
    notifier,
    admins: ['Moderador'],
  });
  const join = (name: string) => {
    const result = app.join({ type: 'join', name, appearance: DEFAULT_APPEARANCE });
    if (!result.ok) throw new Error(result.reason);
    app.announceJoin(result.playerId);
    const player = world.get(result.playerId);
    if (!player) throw new Error('sin jugador');
    return player;
  };
  const gm = (id: string, command: GmCommand) => app.handle(id, { type: 'gm', command });
  const said = (id: string) =>
    notifier
      .ofType('system')
      .filter((m) => m.to === id)
      .map((m) => (m.message as { text: string }).text);
  return { world, join, app, notifier, clock, gm, said };
}

describe('administrador del juego', () => {
  it('quien no es administrador no puede usar los comandos', () => {
    const { join, gm, said, world } = createApp();
    const ana = join('Ana');
    gm(ana.id, { kind: 'summon', creature: 'lobo', amount: 1, tame: false });
    expect(world.allCreatures()).toHaveLength(0);
    expect(said(ana.id).at(-1)).toMatch(/Solo un administrador/);
  });

  it('hace aparecer criaturas por nombre (sin tildes ni mayúsculas) y no reaparecen al morir', () => {
    const { join, gm, world, app, clock } = createApp();
    const mod = join('Moderador');
    gm(mod.id, { kind: 'summon', creature: 'DRAGON rojo', amount: 3, tame: false });
    const dragons = world.allCreatures().filter((c) => c.body === 'dragon');
    expect(dragons).toHaveLength(3);
    const [first] = dragons;
    if (!first) return;
    gm(mod.id, { kind: 'slay', targetId: first.id });
    expect(first.combat.isDead).toBe(true);
    for (let t = 0; t < 120; t++) {
      clock.advance(1000);
      app.tick(clock.now());
    }
    expect(world.allCreatures().some((c) => c.id === first.id)).toBe(false);
  });

  it('invocar: la criatura sigue al administrador; limpiar las saca', () => {
    const { join, gm, world } = createApp();
    const mod = join('Moderador');
    gm(mod.id, { kind: 'summon', creature: 'lobo', amount: 2, tame: true });
    expect(world.summonsOf(mod.id)).toHaveLength(2);
    gm(mod.id, { kind: 'clear', radius: 10 });
    expect(world.allCreatures().filter((c) => !c.gone)).toHaveLength(0);
  });

  it('crea objetos y monturas, cura, resucita y trae gente', () => {
    const { join, gm, world } = createApp();
    const mod = join('Moderador');
    const ana = join('Ana');
    const gold = world.items.countInBackpack(mod.id, 'gold');
    gm(mod.id, { kind: 'item', item: 'monedas de oro', amount: 500 });
    expect(world.items.countInBackpack(mod.id, 'gold')).toBe(gold + 500);
    gm(mod.id, { kind: 'mount', mount: 'elefante' });
    expect(world.petOf(mod.id)?.body).toBe('elephant');
    ana.combat.takeDamage(ana.combat.current.hits);
    gm(mod.id, { kind: 'resurrect', name: 'ana' });
    expect(ana.combat.isDead).toBe(false);
    ana.combat.takeDamage(10);
    gm(mod.id, { kind: 'heal', name: 'Ana' });
    expect(ana.combat.current.hits).toBe(ana.combat.current.maxHits);
    ana.teleport({ x: 2, y: 2 });
    gm(mod.id, { kind: 'bring', name: 'Ana' });
    expect(
      Math.max(
        Math.abs(ana.position.x - mod.position.x),
        Math.abs(ana.position.y - mod.position.y),
      ),
    ).toBe(1);
  });
});
