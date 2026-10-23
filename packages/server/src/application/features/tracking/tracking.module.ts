import type { ModuleFactory } from '../../kernel/game-module';
import { Tracking } from './tracking';

/** Rastrear: buscar animales, monstruos o personas cerca y seguir su rastro. */
export const trackingModule: ModuleFactory = (kernel) => {
  const tracking = new Tracking(
    kernel.world,
    kernel.mobiles,
    kernel.notifier,
    kernel.random,
    kernel.clock,
  );
  return {
    name: 'tracking',
    handles: {
      track: (playerId, m) => tracking.track(playerId, m.category),
      followTrack: (playerId, m) => tracking.follow(playerId, m.targetId),
    },
    tick: (now) => tracking.tick(now),
  };
};
