import type { Position } from '@fenix/shared/geometry/position';
import type { EntityId } from '@fenix/shared/protocol/messages';
import type { TreasureLevel } from '@fenix/shared/treasure/treasure';
import type { Creature } from '../../domain/creatures/creature';
import type { Player } from '../../domain/player';

/**
 * Lo que pasa en el juego y le puede importar a otro módulo. Quien lo
 * provoca lo emite; quien quiere reaccionar se suscribe. Ningún módulo
 * llama a otro por nombre.
 */
export interface GameEvents {
  /** Alguien habló en voz alta (no por el grupo ni el gremio). */
  spoke: { readonly player: Player; readonly text: string };
  /** Un jugador eligió a quién atacar. */
  attacked: { readonly attacker: Player; readonly targetId: EntityId };
  /** Un jugador empezó a lanzar un hechizo. */
  castStarted: { readonly caster: Player };
  /** Un jugador mató a una criatura salvaje que reaparece (misiones de caza). */
  creatureKilled: { readonly killer: Player; readonly creature: Creature };
  /** Un jugador mató a cualquier criatura salvaje, también a los jefes. */
  creatureSlain: { readonly killer: Player; readonly creature: Creature };
  /** Una criatura dejó un mapa del tesoro en su cuerpo. */
  treasureMapDropped: { readonly corpseId: EntityId; readonly level: TreasureLevel };
  /** Trampa mágica puesta o sacada en un mueble. */
  magicTrap: { readonly casterId: EntityId; readonly containerId: string; readonly armed: boolean };
  /** Cerradura mágica puesta, o Abrir cerradura. */
  magicLock: {
    readonly casterId: EntityId;
    readonly containerId: string;
    readonly locked: boolean;
    readonly magery: number;
  };
  /** Telequinesis sobre una puerta o un mueble. */
  telekinesis: { readonly casterId: EntityId; readonly position: Position };
}
