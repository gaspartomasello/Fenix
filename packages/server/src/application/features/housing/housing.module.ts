import type { ModuleFactory } from '../../kernel/game-module';
import { Housing } from './housing';

/**
 * Casas de los jugadores: levantarlas con la escritura (o un lote para
 * diseñarla a gusto, pagando con oro o con materiales), su ventana (nombre,
 * amigos, copropietarios, echados, pública o privada), echar visitas,
 * demolerlas y guardarlas con lo que tienen adentro.
 */
export const housingModule: ModuleFactory = (kernel) => {
  const housing = new Housing(
    kernel.world,
    kernel.clock,
    kernel.ids,
    kernel.items,
    kernel.mobiles,
    kernel.notifier,
    kernel.houseStore,
    { movement: kernel.services.lazy('movement') },
  );
  // Las puertas, los cofres y lo de adentro de una casa son de sus amigos.
  kernel.guards.door.add((player, position) => housing.doorRefusal(player, position));
  kernel.guards.move.add((player, from, to) => housing.moveRefusal(player, from, to));
  kernel.guards.take.add((player, item) => housing.takeRefusal(player, item));
  kernel.guards.container.add((playerId, containerId) =>
    housing.containerRefusal(playerId, containerId),
  );
  return {
    name: 'housing',
    handles: {
      placeHouse: (playerId, m) => housing.place(playerId, m.deedId, m.position),
      houseAction: (playerId, m) => housing.action(playerId, m.houseId, m.action),
      houseSecurity: (playerId, m) => housing.security(playerId, m.houseId, m.change),
      houseDesign: (playerId, m) => housing.design(playerId, m.houseId, m.design, m.pay),
    },
    tick: (now) => housing.tick(now),
    joined: (player) => housing.joined(player),
    saveAll: () => housing.save(),
  };
};
