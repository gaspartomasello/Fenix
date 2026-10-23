import type { ModuleFactory } from '../../kernel/game-module';
import { EconomyActions } from './economy-actions';

/** Juntar recursos, fundir, fabricar, comprar y vender; da `banking`. */
export const economyModule: ModuleFactory = (kernel) => {
  const economy = new EconomyActions(
    kernel.world,
    kernel.clock,
    kernel.ids,
    kernel.random,
    kernel.items,
    kernel.mobiles,
    kernel.notifier,
  );
  kernel.services.provide('banking', { nearBanker: (player) => economy.nearBanker(player) });
  // Doble clic sobre el mineral propio: fundirlo en una forja cercana.
  kernel.itemUses.on('kind:iron-ore', (playerId) => economy.smelt(playerId), { ownedOnly: true });
  return {
    name: 'economy',
    handles: {
      gather: (playerId, m) => economy.gather(playerId, m.toolId, m.position),
      buy: (playerId, m) => economy.buy(playerId, m.vendorId, m.kind, m.amount),
      sell: (playerId, m) => economy.sell(playerId, m.vendorId, m.itemId),
      craft: (playerId, m) => economy.craft(playerId, m.recipe),
    },
  };
};
