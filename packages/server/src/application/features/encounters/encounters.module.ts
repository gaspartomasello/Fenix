import type { ModuleFactory } from '../../kernel/game-module';
import { Encounters } from './encounters';

/** Cada cuánto se van los que se quedaron demasiado. */
const CHECK_MS = 5000;

/**
 * Encuentros fortuitos en los caminos: emboscadas, una buhonera en apuros,
 * lobos de noche o un caminante con un rumor de un lugar escondido.
 */
export const encountersModule: ModuleFactory = (kernel) => {
  const encounters = new Encounters(
    kernel.world,
    kernel.worldClock,
    kernel.ids,
    kernel.random,
    kernel.items,
    kernel.mobiles,
    kernel.notifier,
    kernel.services.lazy('combat'),
    () => kernel.clock.now(),
  );
  kernel.events.on('stepped', ({ player }) => encounters.stepped(player));
  kernel.events.on('creatureSlain', ({ killer, creature }) => encounters.slain(killer, creature));
  let nextCheckAt = 0;
  return {
    name: 'encounters',
    tick: (now) => {
      if (now < nextCheckAt) return;
      nextCheckAt = now + CHECK_MS;
      encounters.tick(now);
    },
    leaving: (player) => encounters.leaving(player),
  };
};
