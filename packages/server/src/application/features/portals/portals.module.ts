import type { ModuleFactory } from '../../kernel/game-module';
import { Gates } from './gates';

/** Los portales del hechizo Portal: se abren, llevan de un lado al otro y se cierran; da `portals`. */
export const portalsModule: ModuleFactory = (kernel) => {
  const gates = new Gates(kernel.world, kernel.ids, kernel.items);
  kernel.services.provide('portals', {
    open: (from, to, now, casterId) => gates.open(from, to, now, casterId),
    destinationFrom: (at) => gates.destinationFrom(at),
  });
  return { name: 'portals', tick: (now) => gates.tick(now) };
};
