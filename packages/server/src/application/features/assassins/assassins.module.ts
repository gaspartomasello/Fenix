import type { ModuleFactory } from '../../kernel/game-module';
import { Assassins } from './assassins';

/** Cada cuánto se revisan los encargos vencidos. */
const CHECK_MS = 5000;

/**
 * El gremio de asesinos, escondido en el Refugio de los Bandidos: su jefa da
 * encargos de matar a gente de paz (nombre azul) y paga según el rango.
 * También baja el karma de quien mata a alguien de paz.
 */
export const assassinsModule: ModuleFactory = (kernel) => {
  const assassins = new Assassins(
    kernel.world,
    kernel.ids,
    kernel.random,
    kernel.items,
    kernel.mobiles,
    kernel.notifier,
    kernel.services.lazy('combat'),
    () => kernel.clock.now(),
  );
  assassins.settle();
  kernel.dialogue.add((player, npc, words) => assassins.talk(player, npc, words));
  kernel.events.on('creatureSlain', ({ killer, creature }) => assassins.slain(killer, creature));
  let nextCheckAt = 0;
  return {
    name: 'assassins',
    tick: (now) => {
      if (now < nextCheckAt) return;
      nextCheckAt = now + CHECK_MS;
      assassins.tick(now);
    },
  };
};
