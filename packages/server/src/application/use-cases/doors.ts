import { DOOR_RANGE, doorPartner, tileDistance, type EntityId, type Position } from '@fenix/shared';
import type { World } from '../../domain/world';
import type { Notifier } from '../ports';

/**
 * Puertas, como en UO: con doble clic, estando al lado, se abren o se
 * cierran. Cerradas bloquean el paso (también a las criaturas: no entran a
 * las casas). No se puede cerrar una puerta con alguien parado en ella. Las
 * dos hojas de una puerta doble se abren y se cierran juntas. El cambio se
 * avisa a todos, así cada cliente ve la puerta igual.
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
    const kind = map.doorAt(position);
    if (!kind) return;
    if (tileDistance(player.position, position) > DOOR_RANGE)
      return this.say(playerId, 'Acercate a la puerta para abrirla.');
    const partner = doorPartner(kind, position);
    const leaves = partner && map.doorAt(partner) ? [position, partner] : [position];
    const open = !map.isDoorOpen(position);
    if (!open && leaves.some((leaf) => this.world.isOccupied(leaf)))
      return this.say(playerId, 'Hay alguien en la puerta.');
    for (const leaf of leaves)
      if (map.setDoorOpen(leaf, open))
        this.notifier.broadcast({ type: 'door', position: leaf, open });
  }

  private say(playerId: EntityId, text: string): void {
    this.notifier.send(playerId, { type: 'system', text });
  }
}
