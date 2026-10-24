import type { ModuleFactory } from '../../kernel/game-module';
import { Dyeing } from './dyeing';

/** La tina de tintura: elegir su color y teñir ropa y bolsas. */
export const dyeingModule: ModuleFactory = (kernel) => {
  const dyeing = new Dyeing(kernel.world, kernel.items, kernel.notifier);
  return {
    name: 'dyeing',
    handles: {
      dye: (playerId, m) => dyeing.dye(playerId, m.itemId, m.hue),
      tintTub: (playerId, m) => dyeing.tint(playerId, m.tubId, m.hue),
    },
  };
};
