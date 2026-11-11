import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import { ASSASSINS_MASTER, ASSASSINS_STANDING } from '@fenix/shared/guilds/assassins';
import type { ServerMessage } from '@fenix/shared/protocol/messages';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { Creature } from '../domain/creatures/creature';
import { Npc } from '../domain/npcs/npc';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
// <módulos>
import { gameWith } from '../test-support/game';
import { assassinsModule } from './features/assassins/assassins.module';
import { chatModule } from './features/chat/chat.module';
import { combatModule } from './features/combat/combat.module';
import { corpsesModule } from './features/corpses/corpses.module';
import { itemsModule } from './features/items/items.module';
import { loreModule } from './features/lore/lore.module';
// </módulos>

const newGame = gameWith([
  chatModule,
  itemsModule,
  combatModule,
  corpsesModule,
  loreModule,
  assassinsModule,
]);

/** El Refugio de los Bandidos (sin guardias) al oeste y una granja al este. */
function createLand() {
  const width = 80;
  const height = 10;
  const map = new TileMap({
    width,
    height,
    terrain: new Array<Terrain>(width * height).fill(Terrain.Grass),
    regions: [
      { name: 'Refugio de los Bandidos', x: 0, y: 0, width: 20, height: 10, wild: true },
      { name: 'Granja de los Olmos', x: 60, y: 0, width: 14, height: 10, wild: true },
    ],
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 4, y: 4 });
  world.addNpc(new Npc('tabernero', 'innkeeper', { x: 10, y: 4 }, 'Ruperto el contrabandista'));
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
  const say = (text: string): void => app.handle(ana, { type: 'chat', text, channel: 'say' });
  const heard = (): string =>
    notifier
      .ofType('chat')
      .map((d) => d.message as Extract<ServerMessage, { type: 'chat' }>)
      .filter((m) => m.id !== ana)
      .at(-1)?.text ?? '';
  const run = (ms: number): void => {
    for (let t = 0; t < ms; t += 100) {
      clock.advance(100);
      app.tick(clock.now());
    }
  };
  return { world, app, ana, player, say, heard, run, clock };
}

describe('etapa 104: la gente de paz de los caminos', () => {
  it('atacar a un viajero (nombre azul) es un crimen, y matarlo ensucia el karma', () => {
    const f = createLand();
    f.player.teleport({ x: 40, y: 4 });
    const traveler = new Creature('viajero', 'traveler', { x: 41, y: 4 });
    f.world.addCreature(traveler);
    expect(traveler.definition.innocent).toBe(true);
    // No ataca a nadie por su cuenta.
    f.run(3000);
    expect(f.player.combat.health).toBe(1);
    f.app.handle(f.ana, { type: 'attack', targetId: traveler.id });
    expect(f.player.reputation.notoriety).toBe('criminal');
    const karma = f.player.reputation.karma;
    traveler.combat.takeDamage(10_000);
    f.app.kernel.events.emit('creatureSlain', { killer: f.player, creature: traveler });
    expect(f.player.reputation.karma).toBeLessThan(karma);
  });
});

describe('etapa 104: el gremio de asesinos del Refugio', () => {
  it('la jefa se hace la mendiga hasta que le nombran la sombra; después da encargos y paga', () => {
    const f = createLand();
    const master = f.world.allNpcs().find((n) => n.name === ASSASSINS_MASTER);
    expect(master).toBeDefined();
    if (!master) return;
    f.player.teleport({ x: master.position.x + 1, y: master.position.y });
    f.say(`${ASSASSINS_MASTER}, ¿tenés un encargo?`);
    expect(f.heard()).toMatch(/monedita/);
    expect(f.player.standing.has(ASSASSINS_STANDING)).toBe(false);

    f.say('Silvana, vengo por la sombra');
    expect(f.heard()).toMatch(/gremio/);
    expect(f.player.standing.get(ASSASSINS_STANDING)).toBe(0);

    f.say('Silvana, dame un encargo');
    const order = f.heard();
    expect(order).toMatch(/Granja de los Olmos/);
    expect(order).toMatch(/queda hacia el este de Refugio de los Bandidos/);
    const victim = f.world
      .allCreatures()
      .find((c) => c.definition.innocent && c.name !== c.definition.name);
    expect(victim).toBeDefined();
    if (!victim) return;
    expect(f.world.map.regionAt(victim.position)?.name).toBe('Granja de los Olmos');

    victim.combat.takeDamage(10_000);
    f.app.kernel.events.emit('creatureSlain', { killer: f.player, creature: victim });
    const gold = f.world.items.countInBackpack(f.ana, 'gold');
    f.say('Silvana, ya está hecho');
    expect(f.heard()).toMatch(/limpio/);
    expect(f.world.items.countInBackpack(f.ana, 'gold')).toBe(gold + 300);
    expect(f.player.standing.get(ASSASSINS_STANDING)).toBe(1);
    f.say('Silvana, ¿cuál es mi rango?');
    expect(f.heard()).toMatch(/Aprendiz de la Sombra/);
  });

  it('el encargo vence si no se cumple a tiempo, y la víctima se va', () => {
    const f = createLand();
    f.player.standing.set(ASSASSINS_STANDING, 0);
    const master = f.world.allNpcs().find((n) => n.name === ASSASSINS_MASTER);
    if (!master) throw new Error('sin jefa');
    f.player.teleport({ x: master.position.x + 1, y: master.position.y });
    f.say('Silvana, un encargo');
    const victim = f.world.allCreatures().find((c) => c.definition.innocent);
    expect(victim).toBeDefined();
    f.clock.advance(41 * 60 * 1000);
    f.run(6000);
    expect(victim?.gone || victim?.combat.isDead).toBe(true);
  });

  it('en el Refugio, sin ley, los vecinos no le temen a un asesino', () => {
    const f = createLand();
    for (let i = 0; i < 5; i++) f.player.reputation.addMurder(0);
    f.player.teleport({ x: 11, y: 4 });
    f.say('Ruperto, hola');
    expect(f.heard()).not.toMatch(/no quiero problemas/);
  });
});
