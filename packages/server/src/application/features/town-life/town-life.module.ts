import type { ModuleFactory } from '../../kernel/game-module';
import { TownLife } from './town-life';

/** Vecinos que caminan por el pueblo y guardias que ajustician a los criminales. */
export const townLifeModule: ModuleFactory = (kernel) => {
  const townLife = new TownLife(
    kernel.world,
    kernel.mobiles,
    kernel.notifier,
    () => kernel.random.next(),
    kernel.services.lazy('combat'),
  );
  return { name: 'town-life', tick: (now) => townLife.tick(now) };
};
