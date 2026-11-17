import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import type { ServerMessage } from '@fenix/shared/protocol/messages';
import { WANDERERS } from '@fenix/shared/social/wanderers';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
// <módulos>
import { gameWith } from '../test-support/game';
import { chatModule } from './features/chat/chat.module';
import { itemsModule } from './features/items/items.module';
import { loreModule } from './features/lore/lore.module';
import { wanderersModule } from './features/wanderers/wanderers.module';
// </módulos>

const newGame = gameWith([chatModule, itemsModule, loreModule, wanderersModule]);

function createLand() {
  const map = new TileMap({
    width: 200,
    height: 20,
    terrain: new Array<Terrain>(4000).fill(Terrain.Grass),
    regions: [
      { name: 'Villa Prueba', x: 0, y: 0, width: 20, height: 20 },
      { name: 'Cruce del Lobo', x: 60, y: 5, width: 9, height: 9, wild: true },
      { name: 'Encrucijada de las Ánimas', x: 120, y: 5, width: 9, height: 9, wild: true },
      { name: 'Chacra del Ombú', x: 90, y: 0, width: 15, height: 15, wild: true, hidden: true },
    ],
  });
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 4, y: 4 });
  const app = newGame({
    world,
    worldClock: new WorldClock(0),
    clock: new FakeClock(0),
    ids: new SequentialIds(),
    random: new FixedRandom(0.1),
    notifier,
  });
  const result = app.join({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
  if (!result.ok) throw new Error(result.reason);
  app.announceJoin(result.playerId);
  const ana = result.playerId;
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
  return { world, ana, say };
}

describe('etapa 136: los caminantes de nombre azul', () => {
  it('están en las encrucijadas, fuera de las zonas seguras, cada uno con su nombre', () => {
    const f = createLand();
    const wanderers = f.world.allNpcs().filter((n) => n.role === 'wanderer');
    expect(wanderers).toHaveLength(2);
    for (const w of wanderers) {
      expect(f.world.map.safeZoneAt(w.position)).toBeUndefined();
      expect(f.world.map.regionAt(w.position)?.name).toMatch(/^(Cruce|Encrucijada) /);
      expect(WANDERERS.some((x) => x.name === w.name)).toBe(true);
    }
    expect(new Set(WANDERERS.map((w) => w.name)).size).toBe(WANDERERS.length);
  });

  it('se presentan, cuentan su historia, sus temas y lo escondido que hay cerca', () => {
    const f = createLand();
    const npc = f.world.allNpcs().find((n) => n.role === 'wanderer');
    const wanderer = WANDERERS.find((w) => w.name === npc?.name);
    if (!npc || !wanderer) throw new Error('sin caminante');
    f.world.get(f.ana)?.teleport({ x: npc.position.x + 1, y: npc.position.y });
    expect(f.say('hola')).toBe(wanderer.intro);
    // La segunda vez saluda como cualquiera: ya se presentó.
    expect(f.say('hola')).not.toBe(wanderer.intro);
    expect(f.say('contame tu historia')).toBe(wanderer.story);
    expect(f.say('¿qué hay cerca?')).toMatch(/Chacra del Ombú/);
  });

  it('cada caminante tiene presentación, historia y al menos dos temas propios', () => {
    expect(WANDERERS.length).toBeGreaterThanOrEqual(12);
    for (const w of WANDERERS) {
      expect(w.intro.length, w.name).toBeGreaterThan(20);
      expect(w.story.length, w.name).toBeGreaterThan(40);
      expect(w.topics.length, w.name).toBeGreaterThanOrEqual(2);
    }
  });
});
