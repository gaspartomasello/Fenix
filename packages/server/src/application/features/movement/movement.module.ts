import type { ModuleFactory } from '../../kernel/game-module';
import { MovePlayer } from './move-player';

/** Caminar y correr; da `movement` (llevar a alguien a otro lugar al instante). */
export const movementModule: ModuleFactory = (kernel) => {
  const { services } = kernel;
  const movePlayer = new MovePlayer(
    kernel.world,
    kernel.clock,
    kernel.notifier,
    kernel.items,
    kernel.mobiles,
    kernel.guards.move,
    // Sin portales ni sigilo se camina igual.
    services.optional('portals'),
    services.optional('stealth'),
  );
  services.provide('movement', { teleport: (player, to) => movePlayer.teleport(player, to) });
  return {
    name: 'movement',
    handles: {
      move: (playerId, m) =>
        movePlayer.execute({ playerId, direction: m.direction, mode: m.mode, seq: m.seq }),
    },
  };
};
