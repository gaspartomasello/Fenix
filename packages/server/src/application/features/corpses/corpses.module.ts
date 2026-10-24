import type { ModuleFactory } from '../../kernel/game-module';
import { Corpses } from './corpses';

/** Los cuerpos de las criaturas: revisarlos y llevarse el botín; da `corpses`. */
export const corpsesModule: ModuleFactory = (kernel) => {
  const corpses = new Corpses(
    kernel.world,
    kernel.clock,
    kernel.ids,
    kernel.items,
    kernel.notifier,
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
  };
};
