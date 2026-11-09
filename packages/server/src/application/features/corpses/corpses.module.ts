import type { ModuleFactory } from '../../kernel/game-module';
import { Corpses } from './corpses';

/** Los cuerpos de las criaturas y de los jugadores: revisarlos y saquearlos; da `corpses`. */
export const corpsesModule: ModuleFactory = (kernel) => {
  const corpses = new Corpses(
    kernel.world,
    kernel.clock,
    kernel.ids,
    kernel.items,
    kernel.notifier,
    kernel.social,
  );
  // El cuerpo de los jugadores: queda al morir y se revisa con doble clic.
  kernel.events.on('playerDied', ({ player }) => corpses.playerDied(player));
  kernel.itemUses.on('kind:player-corpse', (playerId, itemId) =>
    corpses.openPlayerCorpse(playerId, itemId),
  );
  kernel.itemUses.on('kind:player-bones', (playerId, itemId) =>
    corpses.openPlayerCorpse(playerId, itemId),
  );
  kernel.services.provide('corpses', {
    fill: (creature, drops) => corpses.fill(creature, drops),
    remove: (corpseId) => corpses.remove(corpseId),
  });
  return {
    name: 'corpses',
    handles: {
      openCorpse: (playerId, m) => corpses.open(playerId, m.corpseId),
      lootAll: (playerId, m) => corpses.lootAll(playerId, m.corpseId),
    },
    left: (playerId) => corpses.forget(playerId),
    tick: (now) => corpses.tick(now),
  };
};
