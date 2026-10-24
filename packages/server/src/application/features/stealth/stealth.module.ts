import type { ModuleFactory } from '../../kernel/game-module';
import { Stealth } from './stealth';

/**
 * Esconderse, Sigilo y Mirar; da `stealth`. Hablar en voz alta, atacar o
 * empezar a lanzar un hechizo descubre al escondido.
 */
export const stealthModule: ModuleFactory = (kernel) => {
  const stealth = new Stealth(kernel.world, kernel.mobiles, kernel.notifier, kernel.random);
  kernel.services.provide('stealth', {
    reveal: (player, text) => stealth.reveal(player, text),
    conceal: (player, until) => stealth.conceal(player, until),
    revealArea: (at, radius, by) => stealth.revealArea(at, radius, by),
    step: (player, running) => stealth.step(player, running),
  });
  kernel.skills.on('hiding', (playerId) => stealth.use(playerId, 'hiding'));
  kernel.skills.on('detect-hidden', (playerId) => stealth.use(playerId, 'detect-hidden'));
  kernel.events.on('spoke', ({ player }) => stealth.reveal(player, 'Hablaste y te oyeron.'));
  kernel.events.on('attacked', ({ attacker }) =>
    stealth.reveal(attacker, 'Atacaste y te descubriste.'),
  );
  kernel.events.on('castStarted', ({ caster }) =>
    stealth.reveal(caster, 'Lanzar un hechizo te descubrió.'),
  );
  return { name: 'stealth', tick: (now) => stealth.tick(now) };
};
