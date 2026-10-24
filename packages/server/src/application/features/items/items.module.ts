import type { ModuleFactory } from '../../kernel/game-module';
import { MoveItem } from './move-item';
import { UseItem } from './use-item';

/** Mover objetos (suelo, mochila, equipo, banco) y usarlos (doble clic, usar sobre alguien). */
export const itemsModule: ModuleFactory = (kernel) => {
  const moveItem = new MoveItem(
    kernel.world,
    kernel.items,
    kernel.notifier,
    kernel.services.lazy('banking'),
  );
  const useItem = new UseItem(
    kernel.world,
    kernel.clock,
    kernel.ids,
    kernel.random,
    kernel.items,
    kernel.notifier,
    kernel.mobiles,
    kernel.itemUses,
  );
  kernel.itemUses.on('music', (playerId, itemId) => useItem.play(playerId, itemId), {
    ownedOnly: true,
  });
  return {
    name: 'items',
    handles: {
      moveItem: (playerId, m) => moveItem.execute(playerId, m.itemId, m.to),
      useItem: (playerId, m) => useItem.execute(playerId, m.itemId),
      useOn: (playerId, m) => useItem.useOn(playerId, m.itemId, m.targetId),
    },
  };
};
