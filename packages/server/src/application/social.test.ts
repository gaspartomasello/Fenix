import {
  CRIMINAL_MS,
  DEFAULT_APPEARANCE,
  MURDER_DECAY_MS,
  Terrain,
  TileMap,
  type EntityId,
  type RegionData,
  type ServerMessage,
} from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { Creature } from '../domain/creatures/creature';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

function createArena(regions: readonly RegionData[] = []) {
  const map = new TileMap({
    width: 12,
    height: 3,
    terrain: new Array<Terrain>(36).fill(Terrain.Grass),
    regions,
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 1, y: 1 });
  const app = new GameApplication({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids: new SequentialIds(),
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
  const texts = (to: EntityId): string[] =>
    notifier.deliveries.flatMap((d) =>
      d.to === to && d.message.type === 'system' ? [d.message.text] : [],
    );
  const lastSocial = (to: EntityId): Extract<ServerMessage, { type: 'social' }> | undefined => {
    const message = notifier
      .ofType('social')
      .filter((d) => d.to === to)
      .at(-1)?.message;
    return message?.type === 'social' ? message : undefined;
  };
  const social = (id: EntityId, command: string, name?: string, tag?: string): void =>
    app.handle(id, {
      type: 'social',
      command: command as never,
      ...(name === undefined ? {} : { name }),
      ...(tag === undefined ? {} : { tag }),
    });
  return { clock, notifier, world, app, run, join, texts, lastSocial, social };
}

describe('combate entre jugadores', () => {
  it('atacar a un inocente marca como criminal, y la marca se va con el tiempo', () => {
    const arena = createArena();
    const ana = arena.join('Ana');
    const bruno = arena.join('Bruno');
    arena.notifier.clear();

    arena.app.handle(ana, { type: 'attack', targetId: bruno });
    expect(arena.world.get(ana)?.reputation.notoriety).toBe('criminal');
    expect(arena.notifier.ofType('mobileStatus').map((d) => d.message)).toContainEqual({
      type: 'mobileStatus',
      id: ana,
      notoriety: 'criminal',
      guildTag: null,
    });
    expect(arena.texts(bruno)).toContain('¡Ana te está atacando!');

    // Bruno se defiende: atacar a un criminal no es delito.
    arena.app.handle(bruno, { type: 'attack', targetId: ana });
    expect(arena.world.get(bruno)?.reputation.notoriety).toBe('innocent');

    arena.app.handle(ana, { type: 'stopAttack' });
    arena.app.handle(bruno, { type: 'stopAttack' });
    arena.run(CRIMINAL_MS + 200);
    expect(arena.world.get(ana)?.reputation.notoriety).toBe('innocent');
  });

  it('matar a un inocente suma una muerte, que se olvida con el tiempo', () => {
    const arena = createArena();
    const ana = arena.join('Ana');
    const bruno = arena.join('Bruno');
    arena.app.handle(ana, { type: 'attack', targetId: bruno });
    // Con los puños tarda: los dos tienen la misma vida y Bruno no se defiende.
    arena.run(180_000);
    expect(arena.world.get(bruno)?.combat.isDead).toBe(true);
    expect(arena.world.get(ana)?.reputation.murders).toBe(1);
    expect(arena.texts(bruno)).toContain('Ana te mató.');
    expect(arena.lastSocial(ana)?.murders).toBe(1);

    arena.run(MURDER_DECAY_MS);
    expect(arena.world.get(ana)?.reputation.murders).toBe(0);
  });

  it('no se pelea dentro del pueblo ni contra el propio grupo', () => {
    const town = createArena([{ name: 'Pueblo', x: 0, y: 0, width: 4, height: 3 }]);
    const ana = town.join('Ana');
    const bruno = town.join('Bruno');
    town.app.handle(ana, { type: 'attack', targetId: bruno });
    expect(town.texts(ana)).toContain('Dentro del pueblo no se puede pelear con otros jugadores.');

    const field = createArena();
    const carla = field.join('Carla');
    const dario = field.join('Dario');
    field.social(carla, 'party-invite', 'dario');
    field.social(dario, 'party-accept');
    field.app.handle(carla, { type: 'attack', targetId: dario });
    expect(field.texts(carla)).toContain('No podés atacar a alguien de tu grupo.');
    expect(field.world.get(carla)?.combat.targetId).toBeNull();
  });

  it('matar criaturas da fama y karma', () => {
    const arena = createArena();
    const ana = arena.join('Ana');
    arena.world.addCreature(new Creature('rata', 'rat', { x: 2, y: 1 }));
    arena.app.handle(ana, { type: 'attack', targetId: 'rata' });
    arena.run(15_000);
    expect(arena.lastSocial(ana)?.fame).toBe(5);
    expect(arena.lastSocial(ana)?.karma).toBe(5);
  });
});

describe('grupos', () => {
  it('invitar, aceptar, hablar al grupo y salir', () => {
    const arena = createArena();
    const ana = arena.join('Ana');
    const bruno = arena.join('Bruno');

    arena.social(ana, 'party-invite', 'Bruno');
    expect(arena.lastSocial(bruno)?.invites.party).toBe('Ana');
    arena.social(bruno, 'party-accept');

    const party = arena.lastSocial(ana)?.party;
    expect(party?.leaderId).toBe(ana);
    expect(party?.members.map((m) => m.name)).toEqual(['Ana', 'Bruno']);

    arena.notifier.clear();
    arena.app.handle(bruno, { type: 'chat', text: 'vamos', channel: 'party' });
    expect(arena.notifier.ofType('chat').map((d) => d.to)).toEqual([ana, bruno]);

    arena.social(bruno, 'party-leave');
    expect(arena.lastSocial(ana)?.party).toBeNull();
    expect(arena.texts(ana)).toContain('El grupo se disolvió.');
  });

  it('rechaza invitaciones inválidas y avisa si no hay grupo', () => {
    const arena = createArena();
    const ana = arena.join('Ana');
    arena.social(ana, 'party-invite', 'Nadie');
    arena.social(ana, 'party-accept');
    arena.app.handle(ana, { type: 'chat', text: 'hola', channel: 'party' });
    expect(arena.texts(ana)).toEqual(
      expect.arrayContaining([
        'No hay nadie conectado con el nombre «Nadie».',
        'No tenés invitaciones a un grupo.',
        'No estás en un grupo.',
      ]),
    );
  });

  it('al desconectarse deja el grupo', () => {
    const arena = createArena();
    const ana = arena.join('Ana');
    const bruno = arena.join('Bruno');
    const carla = arena.join('Carla');
    arena.social(ana, 'party-invite', 'Bruno');
    arena.social(bruno, 'party-accept');
    arena.social(ana, 'party-invite', 'Carla');
    arena.social(carla, 'party-accept');

    arena.app.leave(ana);
    const party = arena.lastSocial(bruno)?.party;
    expect(party?.leaderId).toBe(bruno);
    expect(party?.members.map((m) => m.name)).toEqual(['Bruno', 'Carla']);
  });
});

describe('gremios', () => {
  it('fundar, invitar, mostrar las siglas y hablar al gremio', () => {
    const arena = createArena();
    const ana = arena.join('Ana');
    const bruno = arena.join('Bruno');
    const carla = arena.join('Carla');

    arena.social(ana, 'guild-create', 'Orden del Fénix', 'fnx');
    expect(arena.lastSocial(ana)?.guild).toEqual({
      name: 'Orden del Fénix',
      tag: 'FNX',
      members: ['Ana'],
    });
    expect(arena.notifier.ofType('mobileStatus').at(-1)?.message).toMatchObject({
      id: ana,
      guildTag: 'FNX',
    });

    arena.social(ana, 'guild-invite', 'Bruno');
    expect(arena.lastSocial(bruno)?.invites.guild).toBe('Ana');
    arena.social(bruno, 'guild-accept');
    const brunoPlayer = arena.world.get(bruno);
    if (!brunoPlayer) throw new Error('sin Bruno');
    expect(arena.world.snapshotOf(brunoPlayer).guildTag).toBe('FNX');

    arena.notifier.clear();
    arena.app.handle(ana, { type: 'chat', text: 'reunión', channel: 'guild' });
    const listeners = arena.notifier.ofType('chat').map((d) => d.to);
    expect(listeners.sort()).toEqual([ana, bruno].sort());
    expect(listeners).not.toContain(carla);

    // Las siglas y nombres no se repiten; los miembros no se atacan.
    arena.social(carla, 'guild-create', 'Otra Orden', 'FNX');
    expect(arena.texts(carla)).toContain('Esas siglas ya están en uso.');
    arena.app.handle(ana, { type: 'attack', targetId: bruno });
    expect(arena.texts(ana)).toContain('No podés atacar a alguien de tu gremio.');

    arena.social(bruno, 'guild-leave');
    expect(arena.lastSocial(ana)?.guild?.members).toEqual(['Ana']);
  });
});
