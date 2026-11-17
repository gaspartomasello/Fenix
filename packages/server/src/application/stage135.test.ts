import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import type { ServerMessage } from '@fenix/shared/protocol/messages';
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
import { SECRETS, TRUE_STORIES, WORLD_TOPICS } from './features/lore/world-lore';

const newGame = gameWith([chatModule, itemsModule, loreModule]);

function createTown() {
  const map = new TileMap({
    width: 120,
    height: 10,
    terrain: new Array<Terrain>(1200).fill(Terrain.Grass),
    regions: [
      { name: 'Villa Prueba', x: 0, y: 0, width: 20, height: 10 },
      { name: 'Torre Hueca', x: 60, y: 0, width: 12, height: 10, wild: true },
      { name: 'Chacra del Ombú', x: 30, y: 0, width: 12, height: 10, wild: true, hidden: true },
    ],
  });
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 4, y: 4 });
  world.addNpc(new Npc('vecina', 'townsfolk', { x: 5, y: 4 }, 'Elena'));
  const app = newGame({
    world,
    worldClock: new WorldClock(0),
    clock: new FakeClock(0),
    ids: new SequentialIds(),
    random: new FixedRandom(0.9),
    notifier,
  });
  const result = app.join({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
  if (!result.ok) throw new Error(result.reason);
  app.announceJoin(result.playerId);
  const ana = result.playerId;
  world.get(ana)?.teleport({ x: 4, y: 4 });
  const say = (text: string): string => {
    app.handle(ana, { type: 'chat', text, channel: 'say' });
    return (
      notifier
        .ofType('chat')
        .map((d) => d.message as Extract<ServerMessage, { type: 'chat' }>)
        .filter((m) => m.id !== ana)
        .at(-1)?.text ?? ''
    );
  };
  return { say };
}

describe('etapa 135: los vecinos saben del mundo', () => {
  it('cuentan la historia del mundo, y con «contame más» siguen con el tema', () => {
    const f = createTown();
    const empire = WORLD_TOPICS.find((t) => t.words.test('imperio'))?.replies ?? [];
    const first = f.say('hablame del imperio antiguo');
    expect(empire).toContain(first);
    const second = f.say('contame más');
    expect(empire).toContain(second);
    expect(second).not.toBe(first);
  });

  it('cuentan historias verdaderas de tierras lejanas', () => {
    const f = createTown();
    expect(TRUE_STORIES).toContain(f.say('contame una historia verdadera'));
  });

  it('dicen qué hay cerca (lo que figura en los mapas, no lo escondido)', () => {
    const f = createTown();
    const reply = f.say('¿qué hay cerca?');
    expect(reply).toMatch(/Torre Hueca/);
    expect(reply).not.toMatch(/Chacra del Ombú/);
  });

  it('tienen respuestas para las frases secretas', () => {
    const f = createTown();
    expect(f.say('¿cuál es el sentido de la vida?')).toMatch(/[Cc]uarenta y dos/);
    expect(f.say('¿quién hizo este mundo?')).toMatch(/etapa/);
    // «hola mundo» no es un saludo cualquiera.
    expect(f.say('hola mundo')).toMatch(/recién empieza/);
    expect(SECRETS.length).toBeGreaterThanOrEqual(8);
  });
});
