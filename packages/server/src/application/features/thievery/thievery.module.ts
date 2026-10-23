import type { ModuleFactory } from '../../kernel/game-module';
import { Thievery } from './thievery';

/** El oficio del ladrón: forzar cerraduras, fisgonear y robar. */
export const thieveryModule: ModuleFactory = (kernel) => {
  const thievery = new Thievery(
    kernel.world,
    kernel.clock,
    kernel.ids,
    kernel.random,
    kernel.services.lazy('containers'),
    kernel.services.optional('stealth'),
    kernel.items,
    kernel.mobiles,
    kernel.social,
    kernel.notifier,
  );
  // Fisgonear y robar se hacen sobre alguien: sin a quién, no pasa nada.
  kernel.skills.on('snooping', (playerId, targetId) => {
    if (targetId) thievery.snoop(playerId, targetId);
  });
  kernel.skills.on('stealing', (playerId, targetId) => {
    if (targetId) thievery.steal(playerId, targetId);
  });
  return {
    name: 'thievery',
    handles: {
      pickLock: (playerId, m) => thievery.pickLock(playerId, m.toolId, m.position),
    },
  };
};
