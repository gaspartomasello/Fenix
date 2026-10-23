import type { ModuleFactory } from '../../kernel/game-module';
import { MountActions } from './mount-actions';

/** Comprar monturas, montar, desmontar y soltar la mascota; da `mounts`. */
export const mountsModule: ModuleFactory = (kernel) => {
  const mounts = new MountActions(
    kernel.world,
    kernel.ids,
    kernel.items,
    kernel.mobiles,
    kernel.notifier,
  );
  kernel.services.provide('mounts', {
    grant: (player, kind) => mounts.grant(player, kind),
    dismountOnDeath: (player) => mounts.dismountOnDeath(player),
  });
  return {
    name: 'mounts',
    handles: {
      buyMount: (playerId, m) => mounts.buy(playerId, m.vendorId, m.mount),
      mount: (playerId, m) => mounts.mount(playerId, m.petId),
      dismount: (playerId) => mounts.dismount(playerId),
      releasePet: (playerId) => mounts.releasePet(playerId),
    },
  };
};
