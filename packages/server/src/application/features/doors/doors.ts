import { tileDistance, type Position } from '@fenix/shared/geometry/position';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { DOOR_RANGE, doorPartner } from '@fenix/shared/world/statics';
import type { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { Guards } from '../../kernel/guards';
import type { Notifier } from '../../ports';

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
    /** Reglas de otros módulos que no dejan usar una puerta (la de una casa privada). */
    private readonly guards: Guards<[player: Player, position: Position]>,
  ) {}

  /** Abrir o cerrar; `range` es más largo con Telequinesis. */
  use(playerId: EntityId, position: Position, range = DOOR_RANGE): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const map = this.world.map;
    const kind = map.doorAt(position);
    if (!kind) return;
    if (tileDistance(player.position, position) > range)
      return this.say(playerId, 'Acercate a la puerta para abrirla.');
    const refused = this.guards.refusal(player, position);
    if (refused) return this.say(playerId, refused);
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
