import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { ALL_MODULES, createGame } from './game';
import { GameApplication, type GameApplicationDeps } from './game-application';
import type { GameMessage, ModuleFactory } from './kernel/game-module';

/** Todos los pedidos de un jugador en el mundo: TypeScript exige que estén todos. */
const EVERY_MESSAGE: Record<Exclude<GameMessage, 'useSkill'>, true> = {
  move: true,
  chat: true,
  moveItem: true,
  useItem: true,
  useOn: true,
  attack: true,
  stopAttack: true,
  castSpell: true,
  track: true,
  followTrack: true,
  pickLock: true,
  setWarMode: true,
  gather: true,
  buy: true,
  sell: true,
  craft: true,
  social: true,
  setHour: true,
  testTravel: true,
  toggleInvulnerable: true,
  talkNpc: true,
  acceptQuest: true,
  abandonQuest: true,
  dye: true,
  tintTub: true,
  shipOrder: true,
  boardShip: true,
  shipAction: true,
  shipSecurity: true,
  dig: true,
  readBook: true,
  writeBook: true,
  openContainer: true,
  gm: true,
  openCorpse: true,
  useDoor: true,
  lootAll: true,
  buyMount: true,
  mount: true,
  dismount: true,
  releasePet: true,
};

function deps(): GameApplicationDeps {
  const clock = new FakeClock();
  return {
    world: new World(
      new TileMap({ width: 2, height: 1, terrain: [Terrain.Grass, Terrain.Grass] }),
      {
        x: 0,
        y: 0,
      },
    ),
    worldClock: new WorldClock(clock.now()),
    clock,
    ids: new SequentialIds(),
    random: new FixedRandom(),
    notifier: new RecordingNotifier(),
  };
}

describe('armado del juego', () => {
  it('cada pedido del protocolo lo atiende un módulo', () => {
    const app = createGame(deps());
    const missing = (Object.keys(EVERY_MESSAGE) as GameMessage[]).filter((t) => !app.handles(t));
    expect(missing).toEqual([]);
    expect(app.handles('useSkill')).toBe(true);
  });

  it('los servicios que se piden, alguien los da', () => {
    const app = createGame(deps());
    for (const name of ['movement', 'combat', 'containers', 'banking'] as const)
      expect(app.kernel.services.has(name)).toBe(true);
  });

  it('dos módulos no pueden atender el mismo pedido', () => {
    const echo: ModuleFactory = () => ({ name: 'eco', handles: { chat: () => {} } });
    const again: ModuleFactory = () => ({ name: 'otro eco', handles: { chat: () => {} } });
    expect(() => new GameApplication(deps(), [echo, again])).toThrow(/Dos módulos atienden "chat"/);
  });

  it('cada módulo tiene un nombre propio', () => {
    const names = ALL_MODULES.map((build) => build(new GameApplication(deps(), []).kernel).name);
    expect(new Set(names).size).toBe(ALL_MODULES.length);
  });

  it('sin módulos, el juego arranca y deja entrar (solo la sesión)', () => {
    const app = new GameApplication(deps(), []);
    expect(app.handles('move')).toBe(false);
    app.tick(0);
  });
});
