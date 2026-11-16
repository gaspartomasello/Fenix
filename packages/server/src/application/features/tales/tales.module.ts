import type { ModuleFactory } from '../../kernel/game-module';
import { Tales } from './tales';

/** Cada cuánto se revisan los relatos vencidos. */
const CHECK_MS = 5000;

/**
 * Los relatos de los lugares: la gente de las granjas, caseríos, campamentos
 * y rarezas pide ayuda con un problema propio (algo suelto cerca) y paga.
 */
export const talesModule: ModuleFactory = (kernel) => {
  const tales = new Tales(
    kernel.world,
    kernel.ids,
    kernel.random,
    kernel.items,
    kernel.mobiles,
    kernel.notifier,
    kernel.services.lazy('combat'),
    () => kernel.clock.now(),
  );
  kernel.dialogue.add((player, npc, words) => tales.talk(player, npc, words));
  kernel.events.on('creatureSlain', ({ creature }) => tales.slain(creature));
  let nextCheckAt = 0;
  return {
    name: 'tales',
    tick: (now) => {
      if (now < nextCheckAt) return;
      nextCheckAt = now + CHECK_MS;
      tales.tick(now);
    },
    leaving: (player) => tales.leaving(player),
  };
};
