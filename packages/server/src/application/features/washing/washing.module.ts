import type { ModuleFactory } from '../../kernel/game-module';
import { Washing } from './washing';

/** Las vendas usadas quedan ensangrentadas y se lavan en el agua. */
export const washingModule: ModuleFactory = (kernel) => {
  const washing = new Washing(kernel.world, kernel.ids, kernel.items, kernel.notifier);
  kernel.events.on('bandageUsed', ({ player }) => washing.bandageUsed(player));
  kernel.itemUses.on('kind:bloody-bandage', (playerId) => washing.wash(playerId), {
    ownedOnly: true,
  });
  return { name: 'washing' };
};
