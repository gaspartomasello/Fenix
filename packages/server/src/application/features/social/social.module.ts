import type { ModuleFactory } from '../../kernel/game-module';
import { SocialActions } from './social-actions';

/** Grupos y gremios: invitar, aceptar, salir; al irse, se avisa a los compañeros. */
export const socialModule: ModuleFactory = (kernel) => {
  const social = new SocialActions(kernel.world, kernel.clock, kernel.social);
  return {
    name: 'social',
    handles: { social: (playerId, m) => social.execute(playerId, m) },
    leaving: (player) => social.disconnect(player),
  };
};
