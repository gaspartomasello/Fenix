import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import type { ServerMessage } from '@fenix/shared/protocol/messages';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { Npc } from '../domain/npcs/npc';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import type { RandomSource } from './ports';
import { FakeClock, RecordingNotifier, SequentialIds } from '../test-support/fakes';
// <módulos>
import { gameWith } from '../test-support/game';
import { chatModule } from './features/chat/chat.module';
import { combatModule } from './features/combat/combat.module';
import { corpsesModule } from './features/corpses/corpses.module';
import { encountersModule } from './features/encounters/encounters.module';
import { itemsModule } from './features/items/items.module';
import { loreModule } from './features/lore/lore.module';
import { talesModule } from './features/tales/tales.module';
// </módulos>

const newGame = gameWith([
  chatModule,
  itemsModule,
  combatModule,
  corpsesModule,
  loreModule,
  talesModule,
  encountersModule,
]);

/** Números al azar que se le van dando de a uno (y después, siempre `rest`). */
class QueuedRandom implements RandomSource {
  readonly queue: number[] = [];
  constructor(private readonly rest = 0.5) {}
  next(): number {
    return this.queue.shift() ?? this.rest;
  }
}

/** Un camino de este a oeste, con una chacra escondida al este. */
function createLand() {
  const width = 140;
  const height = 30;
  const terrain = new Array<Terrain>(width * height).fill(Terrain.Grass);
  for (let x = 0; x < width; x++) terrain[15 * width + x] = Terrain.Path;
  const map = new TileMap({
    width,
    height,
    terrain,
    regions: [
      { name: 'Chacra del Ombú', x: 100, y: 2, width: 19, height: 19, wild: true, hidden: true },
    ],
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const random = new QueuedRandom();
  const world = new World(map, { x: 20, y: 15 });
  world.addNpc(new Npc('granjero', 'farmer', { x: 110, y: 10 }, 'Teófilo el chacarero'));
  const worldClock = new WorldClock(0, 12);
  const app = newGame({
    world,
    worldClock,
    clock,
    ids: new SequentialIds(),
    random,
    notifier,
  });
  const result = app.join({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
  if (!result.ok) throw new Error(result.reason);
  app.announceJoin(result.playerId);
  const ana = result.playerId;
  const player = world.get(ana);
  if (!player) throw new Error('sin jugador');
  player.safety = false;
  const say = (text: string): void => app.handle(ana, { type: 'chat', text, channel: 'say' });
  const heard = (): string =>
    notifier
      .ofType('chat')
      .map((d) => d.message as Extract<ServerMessage, { type: 'chat' }>)
      .filter((m) => m.id !== ana)
      .at(-1)?.text ?? '';
  const gold = (): number => world.items.countInBackpack(ana, 'gold');
  const kill = (name?: string): void => {
    for (const c of world.allCreatures())
      if (c.temporary && !c.combat.isDead && (!name || c.name === name)) {
        c.combat.takeDamage(10_000);
        app.kernel.events.emit('creatureSlain', { killer: player, creature: c });
      }
  };
  return { world, app, ana, player, say, heard, gold, kill, clock, random, notifier, worldClock };
}

describe('etapa 124: los relatos de los lugares', () => {
  it('el chacarero cuenta su problema, aparecen los lobos y al volver paga', () => {
    const f = createLand();
    f.player.teleport({ x: 110, y: 11 });
    f.say('hola');
    expect(f.heard()).toMatch(/problema/);
    f.say('¿necesitás ayuda?');
    expect(f.heard()).toMatch(/lobos/);
    const wolves = f.world.allCreatures().filter((c) => c.temporary);
    expect(wolves).toHaveLength(3);
    expect(wolves.some((w) => w.name === 'el lobo tuerto')).toBe(true);
    // Mientras quedan, lo recuerda.
    f.say('ayuda');
    expect(f.heard()).toMatch(/quedan 3/);
    f.kill();
    expect(f.notifier.ofType('system').at(-1)?.message).toMatchObject({
      text: expect.stringMatching(/Teófilo/),
    });
    const before = f.gold();
    f.say('ya está');
    expect(f.gold()).toBe(before + 70);
    expect(f.world.items.countInBackpack(f.ana, 'ham')).toBeGreaterThanOrEqual(2);
    // Después, por un rato, todo tranquilo.
    f.say('ayuda');
    expect(f.heard()).toMatch(/tranquilo/);
  });
});

describe('etapa 124: encuentros en los caminos', () => {
  /** Da pasos hasta que pase algo (con el descanso cumplido y la suerte a favor). */
  const walk = (f: ReturnType<typeof createLand>, roll: number): void => {
    f.player.teleport({ x: 40, y: 15 });
    f.app.kernel.events.emit('stepped', { player: f.player });
    f.clock.advance(10 * 60 * 1000);
    // A pleno día (de noche, a veces son lobos).
    f.worldClock.setHour(12, f.clock.now());
    f.random.queue.push(0.001, roll);
    f.app.kernel.events.emit('stepped', { player: f.player });
  };

  it('fuera de los caminos no pasa nada', () => {
    const f = createLand();
    f.player.teleport({ x: 40, y: 5 });
    f.app.kernel.events.emit('stepped', { player: f.player });
    f.clock.advance(10 * 60 * 1000);
    f.random.queue.push(0.001, 0.1);
    f.app.kernel.events.emit('stepped', { player: f.player });
    expect(f.world.allCreatures().filter((c) => c.temporary)).toHaveLength(0);
  });

  it('una emboscada de salteadores', () => {
    const f = createLand();
    walk(f, 0.3);
    const bandits = f.world.allCreatures().filter((c) => c.temporary);
    expect(bandits).toHaveLength(3);
    expect(bandits.map((b) => b.definition.kind)).toEqual(['brigand', 'brigand', 'brigand']);
    expect(f.heard()).toMatch(/bolsa|peaje|bolsillo/);
  });

  it('una buhonera en apuros paga a quien la salva', () => {
    const f = createLand();
    walk(f, 0.7);
    const peddler = f.world.allCreatures().find((c) => c.definition.kind === 'peddler');
    expect(peddler).toBeDefined();
    expect(f.heard()).toMatch(/Socorro/);
    const before = f.gold();
    for (const c of f.world.allCreatures())
      if (c.temporary && c.definition.kind === 'brigand') {
        c.combat.takeDamage(10_000);
        f.app.kernel.events.emit('creatureSlain', { killer: f.player, creature: c });
      }
    expect(f.gold()).toBeGreaterThan(before);
    expect(f.heard()).toMatch(/Gracias/);
  });

  it('un caminante cuenta dónde queda un lugar que no está en los mapas', () => {
    const f = createLand();
    walk(f, 0.9);
    expect(f.heard()).toMatch(/Chacra del Ombú/);
    expect(f.heard()).toMatch(/hacia el este/);
  });

  it('de noche, a veces son lobos', () => {
    const f = createLand();
    f.player.teleport({ x: 40, y: 15 });
    f.app.kernel.events.emit('stepped', { player: f.player });
    f.clock.advance(10 * 60 * 1000);
    f.worldClock.setHour(0, f.clock.now());
    f.random.queue.push(0.001, 0.1);
    f.app.kernel.events.emit('stepped', { player: f.player });
    expect(
      f.world
        .allCreatures()
        .filter((c) => c.temporary)
        .map((c) => c.definition.kind),
    ).toEqual(['wolf', 'wolf', 'wolf']);
  });

  it('los que aparecen se van al rato', () => {
    const f = createLand();
    walk(f, 0.3);
    expect(f.world.allCreatures().filter((c) => c.temporary && !c.gone)).toHaveLength(3);
    for (let t = 0; t < 6 * 60 * 1000; t += 1000) {
      f.clock.advance(1000);
      f.app.tick(f.clock.now());
    }
    expect(
      f.world.allCreatures().filter((c) => c.temporary && !c.gone && !c.combat.isDead),
    ).toHaveLength(0);
  });
});
