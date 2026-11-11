import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import { mercenaryStanding } from '@fenix/shared/guilds/mercenaries';
import type { ServerMessage } from '@fenix/shared/protocol/messages';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { emptyChanges } from '../domain/items/items';
import { Npc } from '../domain/npcs/npc';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
// <módulos>
import { gameWith } from '../test-support/game';
import { chatModule } from './features/chat/chat.module';
import { combatModule } from './features/combat/combat.module';
import { corpsesModule } from './features/corpses/corpses.module';
import { itemsModule } from './features/items/items.module';
import { loreModule } from './features/lore/lore.module';
import { mercenariesModule } from './features/mercenaries/mercenaries.module';
// </módulos>

const newGame = gameWith([
  chatModule,
  itemsModule,
  combatModule,
  corpsesModule,
  loreModule,
  mercenariesModule,
]);

const MINUTE = 60 * 1000;

/** El Refugio de los Bandidos, con su taberna (y su capitán de mercenarios). */
function createLand() {
  const width = 40;
  const height = 12;
  const map = new TileMap({
    width,
    height,
    terrain: new Array<Terrain>(width * height).fill(Terrain.Grass),
    regions: [{ name: 'Refugio de los Bandidos', x: 0, y: 0, width: 40, height: 12, wild: true }],
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 4, y: 4 });
  world.addNpc(new Npc('tabernero', 'innkeeper', { x: 10, y: 6 }, 'Ruperto el contrabandista'));
  const app = newGame({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids: new SequentialIds(),
    random: new FixedRandom(0.1),
    notifier,
  });
  const result = app.join({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
  if (!result.ok) throw new Error(result.reason);
  app.announceJoin(result.playerId);
  const ana = result.playerId;
  const player = world.get(ana);
  if (!player) throw new Error('sin jugador');
  const captain = world.allNpcs().find((n) => n.role === 'mercenary');
  if (!captain) throw new Error('sin capitán');
  player.teleport({ x: captain.position.x - 1, y: captain.position.y - 1 });
  const say = (text: string): void => app.handle(ana, { type: 'chat', text, channel: 'say' });
  const heard = (): string =>
    notifier
      .ofType('chat')
      .map((d) => d.message as Extract<ServerMessage, { type: 'chat' }>)
      .filter((m) => m.id !== ana)
      .at(-1)?.text ?? '';
  const system = (): string =>
    notifier
      .ofType('system')
      .map((d) => (d.message as { text: string }).text)
      .join('\n');
  const gold = (): number => world.items.countInBackpack(ana, 'gold');
  const setGold = (amount: number): void => {
    const changes = emptyChanges();
    world.items.consumeFromBackpack(ana, 'gold', gold(), changes);
    if (amount > 0) world.items.addToBackpack(ana, 'gold', amount, () => `oro-${amount}`, changes);
  };
  const run = (ms: number): void => {
    for (let t = 0; t < ms; t += 500) {
      clock.advance(500);
      app.tick(clock.now());
    }
  };
  const merc = (name: string) => world.allCreatures().find((c) => c.name === name && !c.gone);
  return { world, app, ana, player, captain, say, heard, system, gold, setGold, run, merc };
}

describe('etapa 105: mercenarios', () => {
  it('el capitán presenta a su gente y se contrata pagando por adelantado', () => {
    const f = createLand();
    f.say('¿qué mercenarios tenés?');
    expect(f.heard()).toMatch(/Rata Mondragón/);
    f.setGold(10);
    f.say('quiero a Rata');
    expect(f.heard()).toMatch(/no los tenés/);
    f.setGold(100);
    f.say('quiero a Rata');
    expect(f.heard()).toMatch(/Trato hecho/);
    expect(f.gold()).toBe(60);
    const rata = f.merc('Rata Mondragón');
    expect(rata?.ownerId).toBe(f.ana);
  });

  it('cobra solo cada diez minutos; la paga a tiempo y la propina suben la lealtad', () => {
    const f = createLand();
    f.setGold(1000);
    f.say('Leandro... no, quiero a Bastián');
    const key = mercenaryStanding('Bastián Rompecráneos');
    const start = f.player.standing.get(key) ?? 0;
    f.run(10 * MINUTE + 1000);
    expect(f.gold()).toBe(1000 - 55 * 2);
    expect(f.player.standing.get(key)).toBe(start + 4);
    f.say('Bastián, tomá una propina');
    expect(f.player.standing.get(key)).toBe(start + 14);
    expect(f.gold()).toBe(1000 - 55 * 3);
  });

  it('si no cobra, avisa; si sigue sin cobrar, un codicioso se da vuelta y ataca', () => {
    const f = createLand();
    f.setGold(40);
    f.say('contrato a Rata');
    expect(f.gold()).toBe(0);
    f.run(10 * MINUTE + 1000);
    expect(f.heard()).toMatch(/¿y mi paga\?/);
    f.run(2 * MINUTE + 1000);
    expect(f.system()).toMatch(/te traicionó/);
    const traitor = f.merc('Rata Mondragón');
    expect(traitor?.ownerId).toBeNull();
    expect(traitor?.combat.targetId).toBe(f.ana);
    expect(f.player.standing.get(mercenaryStanding('Rata Mondragón'))).toBe(-1);
    // Nunca más trabaja para quien no le pagó.
    f.setGold(100);
    f.say('quiero a Rata');
    expect(f.heard()).toMatch(/no quiere ni verte/);
  });

  it('con mucho oro encima, a uno codicioso y poco leal se le nota antes de traicionar', () => {
    const f = createLand();
    f.setGold(9000);
    f.say('contrato a Vera');
    f.run(3000);
    expect(f.system()).toMatch(/Vera la Cuervo mira tu bolsa de oro con demasiado interés/);
    f.run(MINUTE + 3000);
    expect(f.system()).toMatch(/Vera la Cuervo te traicionó/);
  });

  it('uno leal no traiciona aunque el patrón cargue una fortuna', () => {
    const f = createLand();
    f.player.standing.set(mercenaryStanding('Vera la Cuervo'), 80);
    f.setGold(9000);
    f.say('contrato a Vera');
    f.run(3 * MINUTE);
    expect(f.system()).not.toMatch(/traicionó|demasiado interés/);
    f.say('Vera, ¿cómo estás?');
    expect(f.heard()).toMatch(/a gusto/);
  });

  it('se lo despide de palabra y su lealtad queda guardada', () => {
    const f = createLand();
    f.setGold(500);
    f.say('quiero a Bastián');
    f.say('Bastián, estás despedido');
    expect(f.merc('Bastián Rompecráneos')).toBeUndefined();
    expect(f.player.standing.get(mercenaryStanding('Bastián Rompecráneos'))).toBe(25);
  });
});
