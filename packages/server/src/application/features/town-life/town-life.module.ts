import type { ModuleFactory } from '../../kernel/game-module';
import { GUARD_CALL_COOLDOWN_MS, isGuardCall } from '@fenix/shared/social/guards';
import { TownLife } from './town-life';

/** Vecinos que caminan por el pueblo y guardias que ajustician a los criminales (y se los puede llamar). */
export const townLifeModule: ModuleFactory = (kernel) => {
  const townLife = new TownLife(
    kernel.world,
    kernel.mobiles,
    kernel.notifier,
    () => kernel.random.next(),
    kernel.services.lazy('combat'),
  );
  kernel.services.provide('guards', { call: (at, now) => townLife.call(at, now) });
  // "¡Guardia!": cualquiera puede llamarla (una vez cada tanto).
  const lastCall = new Map<string, number>();
  kernel.events.on('spoke', ({ player, text }) => {
    if (player.combat.isDead || !isGuardCall(plain(text))) return;
    const now = kernel.clock.now();
    if (now - (lastCall.get(player.id) ?? -Infinity) < GUARD_CALL_COOLDOWN_MS) return;
    lastCall.set(player.id, now);
    const result = townLife.call(player.position, now);
    if (result === 'coming') return;
    kernel.notifier.send(player.id, {
      type: 'system',
      text:
        result === 'lawless'
          ? 'Acá no hay guardias que te escuchen.'
          : 'Los guardias no ven a ningún criminal por acá.',
    });
  });
  return {
    name: 'town-life',
    tick: (now) => townLife.tick(now),
    left: (playerId) => lastCall.delete(playerId),
  };
};

/** Minúsculas, sin acentos ni signos. */
function plain(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
