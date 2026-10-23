import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import type { ServerMessage } from '@fenix/shared/protocol/messages';
import { LEGEND_DONE, LEGEND_FOUND, LEGEND_SEEKING } from '@fenix/shared/quests/legends';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { Npc } from '../domain/npcs/npc';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

/** Un pueblo chico al oeste y la Capilla Olvidada al este. */
function createLand() {
  const width = 40;
  const height = 8;
  const map = new TileMap({
    width,
    height,
    terrain: new Array<Terrain>(width * height).fill(Terrain.Grass),
    regions: [
      { name: 'Villa Prueba', x: 0, y: 0, width: 12, height: 8 },
      { name: 'Capilla Olvidada', x: 26, y: 0, width: 14, height: 8, wild: true },
    ],
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 4, y: 4 });
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
  const ana = result.playerId;
  world.get(ana)?.teleport({ x: 4, y: 4 });
  const say = (text: string): void => app.handle(ana, { type: 'chat', text, channel: 'say' });
  /** Lo último que dijo alguien que no es Ana. */
  const heard = (): string => {
    const chats = notifier
      .ofType('chat')
      .map((d) => d.message as Extract<ServerMessage, { type: 'chat' }>)
      .filter((m) => m.id !== ana);
    return chats.at(-1)?.text ?? '';
  };
  const run = (ms: number): void => {
    for (let t = 0; t < ms; t += 100) {
      clock.advance(100);
      app.tick(clock.now());
    }
  };
  return { world, app, ana, say, heard, run, notifier };
}

describe('etapa 56: hablar con los vecinos y las leyendas', () => {
  it('los vecinos contestan a lo que se les dice: nombre, oficio, pueblo y dónde queda un lugar', () => {
    const f = createLand();
    f.world.addNpc(new Npc('escriba', 'scribe', { x: 5, y: 4 }, 'Tobías el escriba'));
    f.say('hola');
    expect(f.heard()).not.toBe('');
    f.say('¿cómo te llamás?');
    expect(f.heard()).toMatch(/Tobías el escriba/);
    f.say('¿de qué trabajás? ¿cuál es tu oficio?');
    expect(f.heard()).toMatch(/libros/);
    f.say('¿qué pueblo es este?');
    expect(f.heard()).toMatch(/Villa Prueba/);
    f.say('¿dónde queda la Capilla Olvidada?');
    expect(f.heard()).toMatch(/Capilla Olvidada queda hacia el este/);
    // Al volver a saludar, se acuerda del nombre.
    f.say('hola de nuevo');
    expect(f.heard()).toMatch(/Ana/);
  });

  it('una leyenda entera: rumor, pregunta al que sabe, jefe en su lugar, reliquia y pergamino de maestría', () => {
    const f = createLand();
    const player = f.world.get(f.ana);
    if (!player) throw new Error('sin jugador');
    // Un mendigo que sabe el rumor del grimorio (cada vecino sabe uno, según su nombre).
    const legends = (f.app as unknown as { legends: { rumorOf(n: Npc): { id: string } | null } })
      .legends;
    const teller = [
      'Lorenzo',
      'Anselmo',
      'Remedios',
      'Baltasar',
      'Tuerto',
      'Manco',
      'Ciego',
      'Viejo',
    ]
      .map((name) => new Npc('mendigo', 'beggar', { x: 5, y: 4 }, name))
      .find((n) => legends.rumorOf(n)?.id === 'silent-grimoire');
    if (!teller) throw new Error('ningún mendigo sabe el rumor');
    f.world.addNpc(teller);
    f.say('¿sabés algún rumor?');
    expect(player.legends.get('silent-grimoire')).toBe(0);
    expect(f.heard()).toMatch(/Capilla Olvidada/);
    // El escriba sabe más, si se le pregunta por la palabra justa.
    player.teleport({ x: 8, y: 4 });
    f.world.addNpc(new Npc('escriba', 'scribe', { x: 9, y: 4 }, 'Tobías el escriba'));
    f.say('contame del grimorio');
    expect(player.legends.get('silent-grimoire')).toBe(LEGEND_SEEKING);
    const legend = 'silent-grimoire';
    player.teleport({ x: 30, y: 4 });
    f.run(2500);
    const boss = f.world.allCreatures().find((c) => c.name === 'Fray Osvaldo el Hueco');
    expect(boss).toBeDefined();
    if (!boss) return;
    boss.combat.takeDamage(10_000);
    f.app['loop'].onCreatureSlain(player, boss);
    expect(player.legends.get(legend)).toBe(LEGEND_FOUND);
    expect(f.world.items.countInBackpack(f.ana, 'silent-grimoire')).toBe(1);
    player.teleport({ x: 8, y: 4 });
    f.say('te traje el grimorio');
    expect(player.legends.get(legend)).toBe(LEGEND_DONE);
    expect(f.world.items.countInBackpack(f.ana, 'mastery-magery')).toBe(1);
    // El pergamino sube 5 puntos la Magia.
    const before = player.skills.get('magery');
    const scroll = f.world.items.backpackOf(f.ana).find((i) => i.kind === 'mastery-magery');
    f.app.handle(f.ana, { type: 'useItem', itemId: scroll?.id ?? '' });
    expect(player.skills.get('magery')).toBe(Math.min(1000, before + 50));
  });
});
