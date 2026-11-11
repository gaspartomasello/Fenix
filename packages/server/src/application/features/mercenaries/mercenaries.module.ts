import type { ModuleFactory } from '../../kernel/game-module';
import { Mercenaries, plain } from './mercenaries';

/** Cada cuánto se cobran los sueldos y se mira la codicia. */
const CHECK_MS = 2000;

/**
 * Los mercenarios: se contratan con los capitanes de algunos pueblos, siguen
 * y defienden al patrón, cobran solos y tienen lealtad y codicia.
 */
export const mercenariesModule: ModuleFactory = (kernel) => {
  const mercenaries = new Mercenaries(
    kernel.world,
    kernel.ids,
    kernel.random,
    kernel.items,
    kernel.mobiles,
    kernel.notifier,
    kernel.services.lazy('combat'),
    () => kernel.clock.now(),
  );
  mercenaries.settle();
  kernel.dialogue.add((player, npc, words) => mercenaries.talk(player, npc, words));
  kernel.events.on('spoke', ({ player, text }) => mercenaries.heard(player, plain(text)));
  kernel.events.on('creatureSlain', ({ killer }) => mercenaries.slain(killer));
  let nextCheckAt = 0;
  return {
    name: 'mercenaries',
    tick: (now) => {
      if (now < nextCheckAt) return;
      nextCheckAt = now + CHECK_MS;
      mercenaries.tick(now);
    },
    leaving: (player) => mercenaries.leaving(player),
  };
};
