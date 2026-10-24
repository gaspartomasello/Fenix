import type { ModuleFactory } from '../../kernel/game-module';
import { Containers } from './containers';

/** Bolsas, cofres y muebles que guardan cosas, con cerraduras y trampas; da `containers`. */
export const containersModule: ModuleFactory = (kernel) => {
  const { world, events } = kernel;
  const containers = new Containers(
    world,
    kernel.clock,
    kernel.ids,
    kernel.random,
    kernel.items,
    kernel.notifier,
    kernel.guards.container,
    kernel.services.lazy('combat'),
  );
  kernel.services.provide('containers', {
    openFor: (playerId, containerId) => containers.openFor(playerId, containerId),
    describe: (containerId) => containers.describe(containerId),
    lockOf: (containerId) => containers.lockOf(containerId),
    unlock: (containerId) => containers.unlock(containerId),
  });
  kernel.itemUses.on('container', (playerId, itemId) => containers.openFor(playerId, itemId));
  events.on('magicTrap', ({ casterId, containerId, armed }) =>
    containers.setTrap(casterId, containerId, armed),
  );
  events.on('magicLock', ({ casterId, containerId, locked, magery }) =>
    locked
      ? containers.magicLock(casterId, containerId, magery)
      : containers.magicUnlock(casterId, containerId, magery),
  );
  // Telequinesis sobre un mueble (sobre una puerta la atienden las puertas).
  events.on('telekinesis', ({ casterId, position }) => {
    if (!world.map.doorAt(position))
      containers.springTrap(casterId, `static:${position.x}:${position.y}`);
  });
  return {
    name: 'containers',
    handles: { openContainer: (playerId, m) => containers.openFor(playerId, m.containerId) },
    tick: (now) => containers.tick(now),
    left: (playerId) => containers.forget(playerId),
  };
};
