import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import type { ServerMessage } from '@fenix/shared/protocol/messages';
import { legendEnd } from '@fenix/shared/quests/legends';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { Npc } from '../domain/npcs/npc';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
// <módulos>
import { gameWith } from '../test-support/game';
import { chatModule } from './features/chat/chat.module';
import { itemsModule } from './features/items/items.module';
import { loreModule } from './features/lore/lore.module';
// </módulos>

const newGame = gameWith([chatModule, itemsModule, loreModule]);

/** Un pueblo al oeste y, en fila hacia el este, los lugares de «La hija del molinero». */
function createLand() {
  const width = 120;
  const height = 10;
  const map = new TileMap({
    width,
    height,
    terrain: new Array<Terrain>(width * height).fill(Terrain.Grass),
    regions: [
      { name: 'Villa Prueba', x: 0, y: 0, width: 20, height: 10 },
      { name: 'Granja del Arroyo', x: 40, y: 0, width: 14, height: 10, wild: true },
      { name: 'Cementerio Viejo', x: 70, y: 0, width: 14, height: 10, wild: true },
      { name: 'Guarida de Bandoleros', x: 100, y: 0, width: 14, height: 10, wild: true },
    ],
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 4, y: 4 });
  const app = newGame({
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
  const ana = result.playerId;
  const player = world.get(ana);
  if (!player) throw new Error('sin jugador');
  player.teleport({ x: 4, y: 4 });
  const say = (text: string): void => app.handle(ana, { type: 'chat', text, channel: 'say' });
  const heard = (): string =>
    notifier
      .ofType('chat')
      .map((d) => d.message as Extract<ServerMessage, { type: 'chat' }>)
      .filter((m) => m.id !== ana)
      .at(-1)?.text ?? '';
  const system = (): string[] =>
    notifier.ofType('system').map((d) => (d.message as { text: string }).text);
  const journal = () =>
    (notifier.ofType('legends').at(-1)?.message as Extract<ServerMessage, { type: 'legends' }>)
      ?.legends ?? [];
  const run = (ms: number): void => {
    for (let t = 0; t < ms; t += 100) {
      clock.advance(100);
      app.tick(clock.now());
    }
  };
  return { world, app, ana, player, say, heard, system, journal, run };
}

describe('etapa 103: leyendas largas, con pistas, personas escondidas y mejores premios', () => {
  it('«La hija del molinero» entera: preguntar, seguir rastros, encontrar a Marta, vencer y devolver', () => {
    const f = createLand();
    f.player.legends.set('miller-daughter', 0);
    f.world.addNpc(new Npc('molinero', 'farmer', { x: 5, y: 4 }, 'Benito'));
    f.say('¿qué pasó con tu hija?');
    expect(f.heard()).toMatch(/Nicanor/);
    expect(f.player.legends.get('miller-daughter')).toBe(1);
    // El diario dice qué hacer y hacia dónde.
    expect(f.journal()[0]?.hint).toMatch(/pescador/);

    f.player.teleport({ x: 12, y: 4 });
    f.world.addNpc(new Npc('pescador', 'fisherman', { x: 13, y: 4 }, 'Ramón'));
    f.say('¿conocés a Nicanor?');
    expect(f.heard()).toMatch(/Granja del Arroyo/);
    expect(f.heard()).toMatch(/queda hacia el este/);
    expect(f.journal()[0]?.place).toBe('Granja del Arroyo');
    // Si se le vuelve a preguntar, lo repite.
    f.say('¿y Nicanor?');
    expect(f.heard()).toMatch(/Ya te dije/);

    // En la granja, el rastro: una cinta azul.
    f.player.teleport({ x: 45, y: 4 });
    f.run(2500);
    expect(f.world.items.countInBackpack(f.ana, 'blue-ribbon')).toBe(1);
    expect(f.player.legends.get('miller-daughter')).toBe(3);
    expect(f.journal()[0]?.place).toBe('Cementerio Viejo');

    // En el cementerio aparece Marta, escondida.
    f.player.teleport({ x: 76, y: 4 });
    f.run(2500);
    const marta = f.world.allNpcs().find((n) => n.name === 'Marta');
    expect(marta).toBeDefined();
    if (!marta) return;
    f.player.teleport({ x: marta.position.x + 1, y: marta.position.y });
    f.say('Marta, te manda tu padre');
    expect(f.heard()).toMatch(/Guarida de Bandoleros/);
    expect(f.player.legends.get('miller-daughter')).toBe(4);

    // Nicanor espera en la guarida.
    f.player.teleport({ x: 106, y: 4 });
    f.run(2500);
    const boss = f.world.allCreatures().find((c) => c.name === 'Nicanor el falso pescador');
    expect(boss).toBeDefined();
    if (!boss) return;
    boss.combat.takeDamage(10_000);
    f.app.kernel.events.emit('creatureSlain', { killer: f.player, creature: boss });
    expect(f.world.items.countInBackpack(f.ana, 'marta-locket')).toBe(1);

    // De vuelta con el molinero: premio entero.
    const gold = f.world.items.countInBackpack(f.ana, 'gold');
    f.player.teleport({ x: 6, y: 4 });
    f.say('Benito, Marta está bien');
    expect(f.heard()).toMatch(/relicario de su madre/);
    expect(f.player.legends.get('miller-daughter')).toBe(legendEnd('miller-daughter'));
    expect(f.world.items.countInBackpack(f.ana, 'mastery-swordsmanship')).toBe(1);
    expect(f.world.items.countInBackpack(f.ana, 'gold')).toBe(gold + 900);
    expect(f.world.items.countInBackpack(f.ana, 'plate-helm')).toBe(1);
    expect(f.world.items.countInBackpack(f.ana, 'marta-locket')).toBe(0);
    expect(f.journal()[0]?.done).toBe(true);
  });

  it('el diario dice hacia dónde queda el lugar desde el pueblo más cercano', () => {
    const f = createLand();
    f.world.addNpc(new Npc('pescador', 'fisherman', { x: 5, y: 4 }, 'Ramón'));
    f.player.legends.set('miller-daughter', 1);
    f.say('nicanor');
    expect(f.journal()[0]?.hint).toMatch(/Granja del Arroyo queda hacia el este de Villa Prueba/);
  });
});

describe('etapa 103: charla más rica con los vecinos', () => {
  it('cuentan su historia, hablan de temas sueltos y explican de qué se puede hablar', () => {
    const f = createLand();
    f.world.addNpc(new Npc('herrero', 'blacksmith', { x: 5, y: 4 }, 'Rufino'));
    f.say('contame tu historia');
    // Le hablaron: presta atención (se queda quieto mirándola).
    expect(f.world.allNpcs().find((n) => n.name === 'Rufino')?.attention?.playerId).toBe(f.ana);
    const story = f.heard();
    expect(story.length).toBeGreaterThan(20);
    f.say('contame tu historia de nuevo');
    expect(f.heard()).toBe(story);
    f.say('¿qué sabés de los dragones?');
    expect(f.heard()).toMatch(/drag/i);
    f.say('¿de qué temas sabés?');
    expect(f.heard()).toMatch(/rumores/);
  });

  it('si se los insulta se enojan hasta que se les pide perdón', () => {
    const f = createLand();
    f.world.addNpc(new Npc('panadera', 'baker', { x: 5, y: 4 }, 'Dora'));
    f.say('sos una tonta');
    f.say('¿cómo te llamás?');
    expect(f.heard()).not.toMatch(/Dora/);
    f.say('perdón, Dora');
    f.say('¿cómo te llamás?');
    expect(f.heard()).toMatch(/Dora/);
  });

  it('a un asesino lo atienden con miedo', () => {
    const f = createLand();
    f.world.addNpc(new Npc('sastre', 'tailor', { x: 5, y: 4 }, 'Elvira'));
    for (let i = 0; i < 5; i++) f.player.reputation.addMurder(0);
    expect(f.player.reputation.notoriety).toBe('murderer');
    f.say('hola');
    expect(f.heard()).toMatch(/no quiero problemas/);
  });
});
