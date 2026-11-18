import type { ModuleFactory } from '../../kernel/game-module';
import { Furniture } from './furniture';

/** Amueblar la casa: poner, girar y guardar los muebles hechos por un carpintero. */
export const furnitureModule: ModuleFactory = (kernel) => {
  const furniture = new Furniture(
    kernel.world,
    kernel.ids,
    kernel.items,
    kernel.notifier,
    kernel.services.lazy('houses'),
  );
  return {
    name: 'furniture',
    handles: {
      placeFurniture: (playerId, m) => furniture.place(playerId, m.itemId, m.position),
      furnitureAction: (playerId, m) => furniture.act(playerId, m.position, m.action),
    },
  };
};
