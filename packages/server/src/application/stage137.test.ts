import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import type { ServerMessage } from '@fenix/shared/protocol/messages';
import {
  LEGENDS,
  LEGEND_IDS,
  legendEnd,
  legendHint,
  legendMax,
} from '@fenix/shared/quests/legends';
import { WANDERERS } from '@fenix/shared/social/wanderers';
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
import { wanderersModule } from './features/wanderers/wanderers.module';
// </módulos>

const newGame = gameWith([chatModule, itemsModule, loreModule, wanderersModule]);

/** Un pueblo, el cruce donde espera Abril, la guarida y la casa del ermitaño. */
function createLand() {
  const map = new TileMap({
    width: 160,
    height: 10,
    terrain: new Array<Terrain>(1600).fill(Terrain.Grass),
    regions: [
      { name: 'Villa Prueba', x: 0, y: 0, width: 20, height: 10 },
      { name: 'Guarida de Bandoleros', x: 60, y: 0, width: 14, height: 10, wild: true },
      { name: 'Casa del Ermitaño', x: 100, y: 0, width: 14, height: 10, wild: true },
    ],
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 4, y: 4 });
  world.addNpc(new Npc('granjero', 'farmer', { x: 6, y: 4 }, 'Eusebio el granjero'));
  world.addNpc(new Npc('abril', 'wanderer', { x: 30, y: 4 }, 'la Niña Abril'));
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
  const run = (ms: number): void => {
    for (let t = 0; t < ms; t += 100) {
      clock.advance(100);
      app.tick(clock.now());
    }
  };
  const journal = () =>
    (notifier.ofType('legends').at(-1)?.message as Extract<ServerMessage, { type: 'legends' }>)
      ?.legends ?? [];
  /** Juega «La pluma roja» hasta tener el anillo en la mochila. */
  const untilRing = (): void => {
    player.teleport({ x: 31, y: 4 });
    expect(say('¿dónde está tu papá?')).toMatch(/granjas/);
    player.teleport({ x: 5, y: 4 });
    expect(say('¿viste a Evaristo, el buhonero?')).toMatch(/Guarida de Bandoleros/);
    player.teleport({ x: 66, y: 4 });
    run(2500);
    expect(world.items.countInBackpack(ana, 'red-feather-hat')).toBe(1);
    player.teleport({ x: 106, y: 4 });
    run(2500);
    const evaristo = world.allNpcs().find((n) => n.name === 'Evaristo el buhonero');
    if (!evaristo) throw new Error('sin Evaristo');
    player.teleport({ x: evaristo.position.x + 1, y: evaristo.position.y });
    expect(say('hola, ¿sos Evaristo?')).toMatch(/anillo/);
    player.teleport({ x: 66, y: 4 });
    run(2500);
    const boss = world.allCreatures().find((c) => c.name === 'la Tuerta Malena');
    if (!boss) throw new Error('sin la Tuerta Malena');
    boss.combat.takeDamage(10_000);
    app.kernel.events.emit('creatureSlain', { killer: player, creature: boss });
    expect(world.items.countInBackpack(ana, 'mother-ring')).toBe(1);
  };
  return { world, ana, player, say, run, journal, untilRing };
}

describe('etapa 137: historias largas con decisión', () => {
  it('«La pluma roja»: preguntarle a la nena la empieza, y se puede terminar diciéndole la verdad', () => {
    const f = createLand();
    f.untilRing();
    expect(f.journal().find((l) => l.id === 'red-feather')?.hint).toMatch(/Decidí/);
    const karma = f.player.reputation.karma;
    f.player.teleport({ x: 31, y: 4 });
    expect(f.say('Abril, tomá')).toMatch(/Gracias por no mentirme/);
    expect(f.world.items.countInBackpack(f.ana, 'mother-ring')).toBe(0);
    expect(f.world.items.countInBackpack(f.ana, 'mastery-archery')).toBe(1);
    expect(f.world.items.countInBackpack(f.ana, 'emerald')).toBe(2);
    expect(f.player.reputation.karma).toBe(karma + 500);
    // Queda anotado cómo terminó (la segunda opción).
    expect(f.player.legends.get('red-feather')).toBe(legendEnd('red-feather') + 1);
    const entry = f.journal().find((l) => l.id === 'red-feather');
    expect(entry?.done).toBe(true);
    expect(entry?.hint).toMatch(/le contaste la verdad/);
  });

  it('«La pluma roja»: o llevarle el anillo al padre y guardarle el secreto', () => {
    const f = createLand();
    f.untilRing();
    const gold = f.world.items.countInBackpack(f.ana, 'gold');
    f.player.teleport({ x: 106, y: 4 });
    f.run(2500);
    const evaristo = f.world.allNpcs().find((n) => n.name === 'Evaristo el buhonero');
    if (!evaristo) throw new Error('sin Evaristo');
    f.player.teleport({ x: evaristo.position.x + 1, y: evaristo.position.y });
    expect(f.say('acá tenés el anillo')).toMatch(/Vuelvo hoy mismo/);
    expect(f.world.items.countInBackpack(f.ana, 'gold')).toBe(gold + 700);
    expect(f.player.legends.get('red-feather')).toBe(legendEnd('red-feather'));
    expect(legendHint(LEGENDS['red-feather'], legendEnd('red-feather'))).toMatch(
      /guardaste el secreto/,
    );
  });

  it('las historias largas tienen al menos seis pasos, terminan en una decisión y nombran caminantes que existen', () => {
    const long = LEGEND_IDS.map((id) => LEGENDS[id]).filter(
      (l) => l.steps.at(-1)?.kind === 'choice',
    );
    expect(long.length).toBeGreaterThanOrEqual(4);
    for (const legend of long) {
      expect(legend.steps.length, legend.title).toBeGreaterThanOrEqual(6);
      const last = legend.steps.at(-1);
      if (last?.kind !== 'choice') continue;
      expect(last.options).toHaveLength(2);
      expect(legendMax(legend.id)).toBe(legendEnd(legend.id) + 1);
      const met = legend.steps.flatMap((s) => (s.kind === 'meet' ? [s.person.name] : []));
      const people = [
        ...legend.steps.flatMap((s) => (s.kind === 'ask' && s.person ? [s.person] : [])),
        ...last.options.flatMap((o) => (o.person ? [o.person] : [])),
      ];
      for (const person of people)
        expect(
          met.includes(person) || WANDERERS.some((w) => w.name === person),
          `${legend.title}: ${person}`,
        ).toBe(true);
    }
  });
});
