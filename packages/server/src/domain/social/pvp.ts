import type { Player } from '../player';
import type { World } from '../world';

/**
 * ¿Por qué no se puede atacar a otro jugador? Dentro de los pueblos no se
 * pelea, y nadie ataca a alguien de su grupo o de su gremio.
 */
export function pvpRefusal(attacker: Player, target: Player, world: World): string | null {
  if (world.map.safeZoneAt(attacker.position) || world.map.safeZoneAt(target.position))
    return 'Dentro del pueblo no se puede pelear con otros jugadores.';
  if (world.parties.sameParty(attacker.id, target.id))
    return 'No podés atacar a alguien de tu grupo.';
  if (world.guilds.sameGuild(attacker.name, target.name))
    return 'No podés atacar a alguien de tu gremio.';
  return null;
}
