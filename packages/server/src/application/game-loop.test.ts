import { DEFAULT_APPEARANCE, Direction, Terrain, TileMap, type EntityId } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { Creature, RESPAWN_MS } from '../domain/creatures/creature';
import { EMPTY_CORPSE_MS } from './corpses';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

/** Pasillo de 12×3 de pasto con un santuario en el extremo este. */
function createArena() {
  const map = new TileMap({
    width: 12,
    height: 3,
    terrain: new Array<Terrain>(36).fill(Terrain.Grass),
    statics: [{ kind: 'shrine', x: 11, y: 0 }],
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 1, y: 1 });
  const app = new GameApplication({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids: new SequentialIds(),
    // 0,2: aciertan los golpes y los hechizos, y suben las habilidades.
    random: new FixedRandom(0.2),
    notifier,
  });
  const run = (ms: number): void => {
    for (let elapsed = 0; elapsed < ms; elapsed += 100) {
      clock.advance(100);
      app.tick(clock.now());
    }
  };
  const join = (name: string): EntityId => {
    const result = app.join({ type: 'join', name, appearance: DEFAULT_APPEARANCE });
    if (!result.ok) throw new Error(result.reason);
    app.announceJoin(result.playerId);
    return result.playerId;
  };
  return { map, clock, notifier, world, app, run, join };
}

describe('ciclo del juego: combate', () => {
  it('una criatura agresiva se acerca y ataca al jugador', () => {
    const arena = createArena();
    const ana = arena.join('Ana');
    const rat = new Creature('rata', 'rat', { x: 5, y: 1 });
    arena.world.addCreature(rat);
    arena.notifier.clear();

    arena.run(4000);
    const player = arena.world.get(ana);
    expect(Math.abs(rat.position.x - (player?.position.x ?? 0))).toBeLessThanOrEqual(1);
    expect(arena.notifier.ofType('swing').some((d) => d.to === ana)).toBe(true);
    expect(player?.combat.current.hits).toBeLessThan(75);
    expect(arena.notifier.ofType('vitals').some((d) => d.to === ana)).toBe(true);
  });

  it('el jugador mata a su objetivo, revisa el cuerpo y la criatura reaparece', () => {
    const arena = createArena();
    const ana = arena.join('Ana');
    const rat = new Creature('rata', 'rat', { x: 2, y: 1 });
    arena.world.addCreature(rat);

    arena.app.handle(ana, { type: 'attack', targetId: 'rata' });
    expect(arena.notifier.ofType('combatTarget').at(-1)?.message).toEqual({
      type: 'combatTarget',
      targetId: 'rata',
    });

    // Con los puños y Tácticas bajas hacen falta unos 7 golpes.
    arena.run(15000);
    expect(rat.combat.isDead || rat.gone).toBe(true);
    const texts = arena.notifier
      .ofType('system')
      .map((d) => (d.message.type === 'system' ? d.message.text : ''));
    expect(texts).toContain('Mataste una rata gigante.');
    expect(texts.some((t) => t.startsWith('El cuerpo de la rata gigante tiene:'))).toBe(true);
    // El botín no cae al suelo: queda dentro del cuerpo.
    expect(arena.world.items.groundNear({ x: 2, y: 1 }).map((i) => i.kind)).not.toContain('gold');
    expect(arena.world.items.corpseOf('rata').map((i) => i.kind)).toContain('gold');

    arena.app.handle(ana, { type: 'openCorpse', corpseId: 'rata' });
    const opened = arena.notifier.ofType('corpse').at(-1)?.message;
    if (opened?.type !== 'corpse') throw new Error('no se abrió el cuerpo');
    expect(opened.name).toBe('rata gigante');
    expect(opened.items.map((i) => i.kind)).toContain('gold');

    arena.app.handle(ana, { type: 'lootAll', corpseId: 'rata' });
    expect(arena.world.items.corpseOf('rata')).toHaveLength(0);
    expect(arena.world.items.countInBackpack(ana, 'gold')).toBeGreaterThan(0);
    const emptied = arena.notifier.ofType('corpse').at(-1)?.message;
    expect(emptied?.type === 'corpse' && emptied.items).toEqual([]);

    // Vacío, el cuerpo se deshace al rato y se cierra la ventana.
    arena.run(EMPTY_CORPSE_MS + 200);
    expect(rat.gone).toBe(true);
    expect(arena.notifier.ofType('corpseClosed')).toHaveLength(1);
    expect(
      arena.notifier
        .ofType('mobileDisappeared')
        .some((d) => d.message.type === 'mobileDisappeared' && d.message.id === 'rata'),
    ).toBe(true);

    arena.notifier.clear();
    arena.run(RESPAWN_MS + 200);
    expect(rat.gone).toBe(false);
    expect(rat.combat.isDead).toBe(false);
    expect(arena.notifier.ofType('mobileAppeared').length).toBeGreaterThan(0);
  });

  it('al morir queda como fantasma y resucita al llegar al santuario', () => {
    const arena = createArena();
    const ana = arena.join('Ana');
    const player = arena.world.get(ana);
    if (!player) throw new Error('sin jugador');
    const rat = new Creature('rata', 'rat', { x: 2, y: 1 });
    arena.world.addCreature(rat);
    player.combat.takeDamage(player.combat.current.hits - 1);

    arena.run(3000);
    expect(player.combat.isDead).toBe(true);
    expect(
      arena.notifier
        .ofType('system')
        .some((d) => d.message.type === 'system' && d.message.text.startsWith('Moriste')),
    ).toBe(true);

    // Los fantasmas no pelean ni tocan objetos.
    arena.notifier.clear();
    arena.app.handle(ana, { type: 'attack', targetId: 'rata' });
    expect(arena.notifier.ofType('system')[0]?.message).toEqual({
      type: 'system',
      text: 'Los fantasmas no pueden pelear.',
    });

    // Caminar hasta el santuario (x = 11).
    for (let i = 0; i < 8; i++) {
      arena.clock.advance(400);
      arena.app.handle(ana, { type: 'move', direction: Direction.East, mode: 'walk', seq: i + 1 });
      arena.app.tick(arena.clock.now());
    }
    expect(player.combat.isDead).toBe(false);
    expect(player.combat.current.hits).toBeGreaterThan(0);
    expect(
      arena.notifier
        .ofType('system')
        .some((d) => d.message.type === 'system' && d.message.text === '¡Volviste a la vida!'),
    ).toBe(true);
  });

  it('las criaturas no entran a los pueblos', () => {
    const arena = createArena();
    const safe = new TileMap({
      width: 12,
      height: 3,
      terrain: new Array<Terrain>(36).fill(Terrain.Grass),
      regions: [{ name: 'Pueblo', x: 0, y: 0, width: 4, height: 3 }],
    });
    const world = new World(safe, { x: 1, y: 1 });
    const app = new GameApplication({
      world,
      worldClock: new WorldClock(0),
      clock: arena.clock,
      ids: new SequentialIds(),
      random: new FixedRandom(),
      notifier: arena.notifier,
    });
    const joined = app.join({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
    if (joined.ok) app.announceJoin(joined.playerId);
    const rat = new Creature('rata', 'rat', { x: 6, y: 1 });
    world.addCreature(rat);
    for (let t = 0; t < 6000; t += 100) {
      arena.clock.advance(100);
      app.tick(arena.clock.now());
    }
    expect(rat.position.x).toBeGreaterThanOrEqual(4);
  });

  it('lanza una flecha mágica: gasta maná y reactivos, daña y sube Magia', () => {
    const arena = createArena();
    const ana = arena.join('Ana');
    const player = arena.world.get(ana);
    if (!player) throw new Error('sin jugador');
    const rat = new Creature('rata', 'rat', { x: 6, y: 1 });
    arena.world.addCreature(rat);
    const ash = arena.world.items.countInBackpack(ana, 'sulfurous-ash');
    const magery = player.skills.get('magery');
    arena.notifier.clear();

    arena.app.handle(ana, { type: 'castSpell', spell: 'magic-arrow', targetId: 'rata' });
    expect(player.combat.current.mana).toBe(30 - 4);
    expect(arena.world.items.countInBackpack(ana, 'sulfurous-ash')).toBe(ash - 1);
    expect(arena.notifier.ofType('castStart').length).toBeGreaterThan(0);

    arena.run(1000);
    const [effect] = arena.notifier.ofType('spellEffect');
    expect(effect?.message).toMatchObject({
      type: 'spellEffect',
      spell: 'magic-arrow',
      targetId: 'rata',
    });
    expect(rat.combat.current.hits).toBeLessThan(14);
    expect(player.skills.get('magery')).toBe(magery + 1);
  });

  it('se cura a sí mismo', () => {
    const arena = createArena();
    const ana = arena.join('Ana');
    const player = arena.world.get(ana);
    player?.combat.takeDamage(30);
    arena.app.handle(ana, { type: 'castSpell', spell: 'heal' });
    arena.run(1000);
    expect(player?.combat.current.hits).toBeGreaterThan(45);
  });

  it('explica por qué no se puede lanzar', () => {
    const arena = createArena();
    const ana = arena.join('Ana');
    const player = arena.world.get(ana);
    if (!player) throw new Error('sin jugador');
    const texts = (): string[] =>
      arena.notifier
        .ofType('system')
        .map((d) => (d.message.type === 'system' ? d.message.text : ''));

    arena.notifier.clear();
    arena.app.handle(ana, { type: 'castSpell', spell: 'greater-heal' });
    expect(texts()).toEqual(['Tu Magia no alcanza para Gran curación.']);

    arena.notifier.clear();
    arena.app.handle(ana, { type: 'castSpell', spell: 'magic-arrow' });
    expect(texts()).toEqual(['Elegí a quién lanzarle el hechizo.']);

    arena.notifier.clear();
    player.combat.spendMana(100);
    arena.app.handle(ana, { type: 'castSpell', spell: 'heal' });
    expect(texts()).toEqual(['No tenés suficiente maná.']);
  });

  it('correr gasta energía', () => {
    const arena = createArena();
    const ana = arena.join('Ana');
    const player = arena.world.get(ana);
    for (let i = 0; i < 8; i++) {
      arena.clock.advance(200);
      arena.app.handle(ana, {
        type: 'move',
        direction: i < 4 ? Direction.East : Direction.West,
        mode: 'run',
        seq: i + 1,
      });
    }
    expect(player?.combat.current.stamina).toBe(38);
  });
});
