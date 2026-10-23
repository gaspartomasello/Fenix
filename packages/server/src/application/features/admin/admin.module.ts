import type { ModuleFactory } from '../../kernel/game-module';
import { GameMaster } from './game-master';
import { TestCommands } from './test-commands';

/** Las órdenes del administrador del juego y las de los personajes de prueba. */
export const adminModule: ModuleFactory = (kernel) => {
  const { services } = kernel;
  const movement = services.lazy('movement');
  const combat = services.lazy('combat');
  const mounts = services.optional('mounts');
  const gameMaster = new GameMaster(
    kernel.world,
    kernel.clock,
    kernel.ids,
    kernel.notifier,
    kernel.mobiles,
    kernel.items,
    {
      teleport: (player, to) => movement.teleport(player, to),
      slay: (victim, by, now) => combat.slay(victim, by, now),
      dismiss: (creature) => combat.dismiss(creature),
      grantMount: (player, kind) => mounts.grant(player, kind),
    },
    (name) => kernel.isAdmin(name),
  );
  const tests = new TestCommands(
    kernel.world,
    kernel.worldClock,
    kernel.clock,
    kernel.notifier,
    kernel.social,
    movement,
    (name) => kernel.isTestCharacter(name),
  );
  return {
    name: 'admin',
    handles: {
      gm: (playerId, m) => gameMaster.execute(playerId, m.command),
      setHour: (playerId, m) => tests.setHour(playerId, m.hour),
      testTravel: (playerId, m) =>
        tests.travel(playerId, m.to === 'place' ? { place: m.place } : m.to),
      toggleInvulnerable: (playerId) => tests.toggleInvulnerable(playerId),
    },
  };
};
