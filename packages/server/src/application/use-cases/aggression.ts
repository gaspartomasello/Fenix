import type { Player } from '../../domain/player';
import type { Notifier } from '../ports';
import type { SocialNotifications } from '../social-notifications';

/**
 * Atacar a un inocente (con armas o hechizos) es un crimen: quien ataca
 * queda como criminal un rato. El atacado recibe el aviso.
 */
export function commitAggression(
  attacker: Player,
  target: Player,
  now: number,
  notifier: Notifier,
  social: SocialNotifications,
): void {
  notifier.send(target.id, { type: 'system', text: `¡${attacker.name} te está atacando!` });
  if (target.reputation.notoriety !== 'innocent') return;
  if (attacker.reputation.markCriminal(now)) {
    notifier.send(attacker.id, {
      type: 'system',
      text: 'Atacaste a un inocente: ahora sos criminal y atacarte no es delito.',
    });
    social.statusChanged(attacker);
  }
}
