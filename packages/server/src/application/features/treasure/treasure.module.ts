import type { ModuleFactory } from '../../kernel/game-module';
import { TreasureHunt } from './treasure-hunt';

/** Mapas del tesoro: leerlos, buscar la marca y desenterrar el cofre. */
export const treasureModule: ModuleFactory = (kernel) => {
  const treasure = new TreasureHunt(
    kernel.world,
    kernel.clock,
    kernel.ids,
    kernel.random,
    kernel.items,
    kernel.mobiles,
    kernel.notifier,
    (name) => kernel.isAdmin(name),
  );
  kernel.events.on('treasureMapDropped', ({ corpseId, level }) =>
    treasure.chartCorpse(corpseId, level),
  );
  kernel.itemUses.on('map', (playerId, itemId) => treasure.read(playerId, itemId));
  return {
    name: 'treasure',
    handles: { dig: (playerId, m) => treasure.dig(playerId, m.toolId, m.position) },
    tick: (now) => treasure.tick(now),
  };
};
