import { tileDistance, type Position } from '@fenix/shared/geometry/position';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { MOONGATE_TOWNS } from '@fenix/shared/travel/moongates';
import type { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { GameServices } from '../../kernel/services';
import type { Notifier } from '../../ports';

/** Un portal lunar: dónde está y de qué ciudad es. */
interface Moongate {
  readonly town: string;
  readonly at: Position;
}

/**
 * Los portales lunares fijos (ver `@fenix/shared/travel/moongates`): al
 * pisar uno se ofrece la lista de ciudades; al elegir, se aparece al lado del
 * portal de esa ciudad. Los portales del hechizo Portal son otra cosa (los
 * maneja `portals`): estos están desde que se crea el mundo.
 */
export class Moongates {
  private readonly gates: readonly Moongate[];

  constructor(
    private readonly world: World,
    private readonly notifier: Notifier,
    private readonly movement: GameServices['movement'],
  ) {
    // Los portales que ya estaban al crearse el mundo, cada uno con la ciudad más cercana.
    const towns = MOONGATE_TOWNS.flatMap((name) => {
      const r = world.map.regions.find((t) => t.name === name && !t.wild && !t.dungeon && !t.floor);
      return r ? [{ name, center: { x: r.x + r.width / 2, y: r.y + r.height / 2 } }] : [];
    });
    this.gates = world.items
      .all()
      .filter((i) => i.kind === 'moongate' && i.location.type === 'ground')
      .flatMap((i) => {
        if (i.location.type !== 'ground') return [];
        const at = i.location.position;
        const town = [...towns].sort(
          (a, b) => tileDistance(a.center, at) - tileDistance(b.center, at),
        )[0];
        return town ? [{ town: town.name, at }] : [];
      });
  }

  /** Dio un paso: si pisó un portal lunar, se le ofrecen los destinos. */
  stepped(player: Player): void {
    const gate = this.gateAt(player.position);
    if (!gate) return;
    this.notifier.send(player.id, {
      type: 'moongateMenu',
      here: gate.town,
      destinations: this.gates.filter((g) => g !== gate).map((g) => g.town),
    });
  }

  /** Eligió a dónde ir: tiene que seguir parado en un portal. */
  travel(playerId: EntityId, destination: string): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const from = this.gateAt(player.position);
    const to = this.gates.find((g) => g.town === destination);
    if (!from || !to || to === from) return;
    const spot = this.besideOf(to.at);
    if (!spot) {
      this.notifier.send(playerId, {
        type: 'system',
        text: 'Del otro lado hay demasiada gente: probá en un momento.',
      });
      return;
    }
    this.movement.teleport(player, spot);
    this.notifier.send(playerId, {
      type: 'system',
      text: `Cruzás el portal y aparecés en las afueras de ${to.town}.`,
    });
  }

  private gateAt(at: Position): Moongate | undefined {
    return this.gates.find((g) => g.at.x === at.x && g.at.y === at.y);
  }

  /** Un lugar al lado del portal (no encima, para no volver a abrir el menú al llegar). */
  private besideOf(at: Position): Position | null {
    for (let r = 1; r <= 2; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (!dx && !dy) continue;
          const p = { x: at.x + dx, y: at.y + dy };
          if (this.world.map.isWalkable(p) && !this.world.isOccupied(p)) return p;
        }
    return null;
  }
}
