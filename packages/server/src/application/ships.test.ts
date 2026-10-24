import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import { Direction } from '@fenix/shared/geometry/direction';
import type { ShipPanelMessage } from '@fenix/shared/protocol/messages';
import { SHIPS, parseShipOrder, shipLevel } from '@fenix/shared/ships/ships';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { captureCharacter } from '../domain/persistence/saved-character';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
// <módulos>
import { gameWith } from '../test-support/game';
import { movementModule } from './features/movement/movement.module';
import { chatModule } from './features/chat/chat.module';
import { itemsModule } from './features/items/items.module';
import { shipsModule } from './features/ships/ships.module';
// </módulos>

const newGame = gameWith([movementModule, chatModule, itemsModule, shipsModule]);

/** Una costa: tierra a la izquierda (x < 6) y mar abierto a la derecha. */
function createHarbor() {
  const width = 40;
  const height = 30;
  const terrain = new Array<Terrain>(width * height).fill(Terrain.Water);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < 6; x++) terrain[y * width + x] = Terrain.Grass;
  const map = new TileMap({ width, height, terrain, statics: [], regions: [] });
  const world = new World(map, { x: 4, y: 15 });
  const notifier = new RecordingNotifier();
  const clock = new FakeClock(0);
  const app = newGame({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids: new SequentialIds(),
    random: new FixedRandom(0.5),
    notifier,
  });
  const join = (name: string) => {
    const result = app.join({ type: 'join', name, appearance: DEFAULT_APPEARANCE });
    if (!result.ok) throw new Error(result.reason);
    app.announceJoin(result.playerId);
    const player = world.get(result.playerId);
    if (!player) throw new Error('sin jugador');
    return player;
  };
  const ana = join('Ana');
  const beto = join('Beto');
  const launch = (kind: 'sloop-deed' | 'galleon-deed', owner = ana, y = 15) => {
    owner.teleport({ x: 5, y });
    // Mira al mar: intenta caminar hacia el agua (no puede, pero queda mirando para ese lado).
    owner.tryMove(world.map, Direction.East, 'walk', 0);
    const deed = world.items.add(`maqueta-${owner.name}-${kind}`, kind, 1, {
      type: 'backpack',
      ownerId: owner.id,
      position: { x: 0, y: 0 },
    });
    app.handle(owner.id, { type: 'useItem', itemId: deed.id });
    const ship = [...world.ships.values()].find(
      (s) => s.owner === owner.name && s.kind === (kind === 'sloop-deed' ? 'sloop' : 'galleon'),
    );
    if (!ship) throw new Error('no se botó');
    return ship;
  };
  const tick = (ms: number) => {
    for (let t = 0; t < ms; t += 100) {
      clock.advance(100);
      app.tick(clock.now());
    }
  };
  return { world, app, notifier, clock, ana, beto, launch, tick };
}

describe('barcos', () => {
  it('la maqueta bota el barco en el agua de enfrente, con su bodega en la popa', () => {
    const { world, launch } = createHarbor();
    const ship = launch('galleon-deed');
    expect(ship.facing).toBe(Direction.East);
    for (const t of ship.tiles()) {
      expect(world.map.terrainAt(t)).toBe(Terrain.Water);
      expect(world.map.isWalkable(t)).toBe(true);
    }
    expect(world.items.get(ship.holdId ?? '')?.location).toEqual({
      type: 'ground',
      position: ship.sternTile(),
    });
    expect(world.items.all().some((i) => i.kind === 'galleon-deed')).toBe(false);
  });

  it('sube quien tiene permiso; el timonel obedece a la tripulación y el barco lleva a todos', () => {
    const { world, app, notifier, ana, beto, launch, tick } = createHarbor();
    const ship = launch('sloop-deed');
    app.handle(ana.id, { type: 'boardShip', shipId: ship.id });
    expect(ship.occupies(ana.position)).toBe(true);

    // Beto no tiene permiso: ni abordando ni caminando.
    beto.teleport({ x: 5, y: 14 });
    app.handle(beto.id, { type: 'boardShip', shipId: ship.id });
    expect(ship.occupies(beto.position)).toBe(false);

    // Como pasajero sube, pero el timonel no le hace caso.
    app.handle(ana.id, {
      type: 'shipSecurity',
      shipId: ship.id,
      change: { kind: 'set', name: 'Beto', level: 'passenger' },
    });
    app.handle(beto.id, { type: 'boardShip', shipId: ship.id });
    expect(ship.occupies(beto.position)).toBe(true);
    const start = { ...ship.center };
    app.handle(beto.id, { type: 'chat', text: 'adelante' });
    tick(1000);
    expect(ship.center).toEqual(start);

    // Ana es la capitana: da la orden en voz alta y el barco navega con los dos.
    const betoBefore = { ...beto.position };
    app.handle(ana.id, { type: 'chat', text: 'adelante' });
    tick(1000);
    expect(ship.center.x).toBeGreaterThan(start.x);
    const moved = ship.center.x - start.x;
    expect(beto.position).toEqual({ x: betoBefore.x + moved, y: betoBefore.y });
    expect(ship.occupies(ana.position)).toBe(true);
    app.handle(ana.id, { type: 'chat', text: 'alto' });
    const stopped = { ...ship.center };
    tick(1000);
    expect(ship.center).toEqual(stopped);
    expect(notifier.ofType('shipMoved').length).toBeGreaterThan(0);

    // Virar gira el barco y a la gente a bordo.
    app.handle(ana.id, {
      type: 'shipOrder',
      shipId: ship.id,
      order: { kind: 'turn', side: 'right' },
    });
    expect(ship.facing).toBe(Direction.South);
    expect(ship.occupies(ana.position)).toBe(true);
    expect(ship.occupies(beto.position)).toBe(true);
    expect(world.ships.size).toBe(1);
  });

  it('la bodega es para oficiales y el capitán ve la lista de permisos', () => {
    const { app, notifier, ana, beto, launch } = createHarbor();
    const ship = launch('galleon-deed');
    app.handle(ana.id, {
      type: 'shipSecurity',
      shipId: ship.id,
      change: { kind: 'set', name: 'Beto', level: 'crew' },
    });
    beto.teleport({ x: 5, y: 14 });
    app.handle(beto.id, { type: 'boardShip', shipId: ship.id });
    app.handle(beto.id, { type: 'openContainer', containerId: ship.holdId ?? '' });
    expect(notifier.ofType('container').some((d) => d.to === beto.id)).toBe(false);
    app.handle(ana.id, { type: 'shipAction', shipId: ship.id, action: 'panel' });
    const panel = notifier.ofType('shipPanel').at(-1)?.message as ShipPanelMessage;
    expect(panel.level).toBe('captain');
    expect(panel.security?.manifest.beto).toBe('crew');
  });

  it('un cañonazo daña el casco del otro barco y, si se hunde, los de a bordo nadan a la costa', () => {
    const { world, app, ana, beto, launch, clock } = createHarbor();
    const galleon = launch('galleon-deed');
    app.handle(ana.id, { type: 'boardShip', shipId: galleon.id });
    // El barco de Beto, al sur del galeón (a estribor, porque el galeón mira al este).
    const sloop = launch('sloop-deed', beto, 25);
    app.handle(beto.id, { type: 'boardShip', shipId: sloop.id });
    sloop.hits = 50;
    world.items.add('balas', 'cannonball', 5, {
      type: 'backpack',
      ownerId: ana.id,
      position: { x: 0, y: 0 },
    });
    const fire = (side: 'fire-port' | 'fire-starboard') => {
      clock.advance(10_000);
      app.handle(ana.id, { type: 'shipAction', shipId: galleon.id, action: side });
    };
    const target = sloop.center.y > galleon.center.y ? 'fire-starboard' : 'fire-port';
    fire(target);
    expect(world.ships.has(sloop.id)).toBe(false);
    expect(world.map.isDeck(beto.position)).toBe(false);
    expect(world.map.terrainAt(beto.position)).toBe(Terrain.Grass);
    expect(world.items.countInBackpack(ana.id, 'cannonball')).toBe(4);
  });

  it('guardar el barco devuelve la maqueta con su nombre; si sigue en el agua, se guarda igual', () => {
    const { world, app, ana, launch } = createHarbor();
    const ship = launch('sloop-deed');
    app.handle(ana.id, {
      type: 'shipSecurity',
      shipId: ship.id,
      change: { kind: 'rename', name: 'La Gaviota' },
    });
    // Mientras está en el agua, el guardado lleva la maqueta (por si el servidor se reinicia).
    const saved = captureCharacter(ana, world, null);
    expect(saved.items.find((i) => i.kind === 'sloop-deed')?.ship?.name).toBe('La Gaviota');
    app.handle(ana.id, { type: 'shipAction', shipId: ship.id, action: 'dock' });
    expect(world.ships.size).toBe(0);
    const deed = world.items.backpackOf(ana.id).find((i) => i.kind === 'sloop-deed');
    expect(deed?.ship?.name).toBe('La Gaviota');
    expect(world.items.get(ship.holdId ?? '')).toBeUndefined();
  });

  it('órdenes de voz y permisos', () => {
    expect(parseShipOrder('Adelante')).toEqual({ kind: 'move', heading: 0, speed: 'fast' });
    expect(parseShipOrder('despacio atrás')).toEqual({ kind: 'move', heading: 4, speed: 'slow' });
    expect(parseShipOrder('un paso a babor')).toEqual({ kind: 'move', heading: 6, speed: 'one' });
    expect(parseShipOrder('adelante a estribor')).toEqual({
      kind: 'move',
      heading: 1,
      speed: 'fast',
    });
    expect(parseShipOrder('virar a babor')).toEqual({ kind: 'turn', side: 'left' });
    expect(parseShipOrder('¡Alto!')).toEqual({ kind: 'stop' });
    expect(parseShipOrder('hola a todos')).toBeNull();
    const security = {
      manifest: { beto: 'denied' as const },
      everyone: 'passenger' as const,
      party: 'crew' as const,
      guild: 'denied' as const,
    };
    expect(
      shipLevel(security, 'Ana', { name: 'ana', inOwnerParty: false, inOwnerGuild: false }),
    ).toBe('captain');
    expect(
      shipLevel(security, 'Ana', { name: 'Beto', inOwnerParty: true, inOwnerGuild: false }),
    ).toBe('denied');
    expect(
      shipLevel(security, 'Ana', { name: 'Cata', inOwnerParty: true, inOwnerGuild: false }),
    ).toBe('crew');
    expect(
      shipLevel(security, 'Ana', { name: 'Dani', inOwnerParty: false, inOwnerGuild: false }),
    ).toBe('passenger');
    expect(SHIPS.galleon.cannons).toBe(1);
  });
});
