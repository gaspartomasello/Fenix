import { Creature } from '../../domain/creatures/creature';
import type { Mobile } from '../../domain/mobile';
import { Player } from '../../domain/player';
import type { Notifier } from '../ports';
import type { SocialNotifications } from './social-notifications';

/**
 * Atacar a un inocente (con armas o hechizos) es un crimen: quien ataca
 * queda como criminal un rato. El atacado recibe el aviso. Los inocentes son
 * los jugadores de nombre azul y la gente de paz de los caminos (viajeros,
 * buhoneras, peregrinos, cazadoras).
 */
export function commitAggression(
  attacker: Player,
  target: Mobile,
  now: number,
  notifier: Notifier,
  social: SocialNotifications,
): void {
  if (target instanceof Player)
    notifier.send(target.id, { type: 'system', text: `¡${attacker.name} te está atacando!` });
  if (!isInnocent(target)) return;
  if (attacker.reputation.markCriminal(now)) {
    notifier.send(attacker.id, {
      type: 'system',
      text: 'Atacaste a un inocente: ahora sos criminal y atacarte no es delito.',
    });
    social.statusChanged(attacker);
  }
}

/** ¿Es inocente (atacarlo es un crimen)? */
export function isInnocent(target: Mobile): boolean {
  if (target instanceof Player) return target.reputation.notoriety === 'innocent';
  return (
    target instanceof Creature && target.definition.innocent === true && target.ownerId === null
  );
}
