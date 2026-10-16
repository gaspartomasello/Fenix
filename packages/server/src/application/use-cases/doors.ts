import { DOOR_RANGE, tileDistance, type EntityId, type Position } from '@fenix/shared';
import type { World } from '../../domain/world';
import type { Notifier } from '../ports';

/**
 * Puertas, como en UO: con doble clic, estando al lado, se abren o se
 * cierran. Cerradas bloquean el paso (también a las criaturas: no entran a
 * las casas). No se puede cerrar una puerta con alguien parado en ella. El
 * cambio se avisa a todos, así cada cliente ve la puerta igual.
 */
export class Doors {
  constructor(
    private readonly world: World,
    private readonly notifier: Notifier,
  ) {}

  use(playerId: EntityId, position: Position): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const map = this.world.map;
    if (!map.doorAt(position)) return;
    if (tileDistance(player.position, position) > DOOR_RANGE)
      return this.say(playerId, 'Acercate a la puerta para abrirla.');
    const open = !map.isDoorOpen(position);
    if (!open && this.world.isOccupied(position))
      return this.say(playerId, 'Hay alguien en la puerta.');
    if (!map.setDoorOpen(position, open)) return;
    this.notifier.broadcast({ type: 'door', position, open });
  }

  private say(playerId: EntityId, text: string): void {
    this.notifier.send(playerId, { type: 'system', text });
  }
}
