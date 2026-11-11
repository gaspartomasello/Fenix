import type { ModuleFactory } from '../../kernel/game-module';
import { Home } from './home';

/** El hogar: el santuario al que vuelve un fantasma con `home`; se elige con doble clic. */
export const homeModule: ModuleFactory = (kernel) => {
  const home = new Home(kernel.world, kernel.notifier, kernel.services.lazy('movement'));
  kernel.events.on('playerDied', ({ player }) => home.died(player));
  return {
    name: 'home',
    handles: {
      setHome: (playerId, m) => home.choose(playerId, m.position),
      goHome: (playerId) => home.goHome(playerId),
    },
  };
};
