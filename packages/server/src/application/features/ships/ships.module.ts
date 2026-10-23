import type { ModuleFactory } from '../../kernel/game-module';
import { Ships } from './ships';

/** Barcos tripulados: botarlos, subir, dar órdenes al timonel, cañones y bodega. */
export const shipsModule: ModuleFactory = (kernel) => {
  const { services } = kernel;
  const ships = new Ships(
    kernel.world,
    kernel.clock,
    kernel.ids,
    kernel.random,
    kernel.items,
    kernel.mobiles,
    kernel.notifier,
    {
      movement: services.lazy('movement'),
      combat: services.lazy('combat'),
      containers: services.lazy('containers'),
    },
  );
  // No se sube a un barco ajeno ni se abre su bodega sin permiso.
  kernel.guards.move.add((player, from, to) => ships.refusal(player, from, to));
  kernel.guards.container.add((playerId, containerId) =>
    ships.containerRefusal(playerId, containerId),
  );
  kernel.itemUses.on('ship', (playerId, itemId) => ships.launch(playerId, itemId));
  // Las órdenes al timonel se dan en voz alta, como en UO.
  kernel.events.on('spoke', ({ player, text }) => ships.hear(player.id, text));
  return {
    name: 'ships',
    handles: {
      shipOrder: (playerId, m) => ships.order(playerId, m.shipId, m.order),
      boardShip: (playerId, m) => ships.board(playerId, m.shipId),
      shipAction: (playerId, m) => ships.action(playerId, m.shipId, m.action),
      shipSecurity: (playerId, m) => ships.security(playerId, m.shipId, m.change),
    },
    tick: (now) => ships.tick(now),
    joined: (player) => ships.afterJoin(player.id),
    left: (playerId) => ships.forget(playerId),
  };
};
