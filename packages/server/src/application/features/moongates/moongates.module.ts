import type { ModuleFactory } from '../../kernel/game-module';
import { Moongates } from './moongates';

/** Portales lunares fijos en las afueras de las ciudades: al pisarlos se elige a dónde ir. */
export const moongatesModule: ModuleFactory = (kernel) => {
  const moongates = new Moongates(kernel.world, kernel.notifier, kernel.services.lazy('movement'));
  kernel.events.on('stepped', ({ player }) => moongates.stepped(player));
  return {
    name: 'moongates',
    handles: {
      moongateTravel: (playerId, m) => moongates.travel(playerId, m.destination),
    },
  };
};
