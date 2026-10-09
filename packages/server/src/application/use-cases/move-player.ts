import type { Direction, EntityId, MoveMode } from '@fenix/shared';
import type { Player } from '../../domain/player';
import type { World } from '../../domain/world';
import type { Clock, Notifier } from '../ports';

export interface MovePlayerInput {
  readonly playerId: EntityId;
  readonly direction: Direction;
  readonly mode: MoveMode;
  readonly seq: number;
}

export class MovePlayer {
  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
  ) {}

  execute({ playerId, direction, mode, seq }: MovePlayerInput): void {
    const player = this.world.get(playerId);
    if (!player) return;

    const before = this.idsNear(player);
    const outcome = player.tryMove(this.world.map, direction, mode, this.clock.now());
    if (!outcome.ok) {
      this.notifier.send(playerId, {
        type: 'moveRejected',
        seq,
        position: player.position,
        direction: player.direction,
      });
      return;
    }

    this.notifier.send(playerId, { type: 'moveAck', seq, position: player.position });
    this.updateVisibility(player, before, mode);
  }

  /**
   * Quienes seguían viendo al jugador reciben el paso; quienes entran o salen
   * del rango de visión lo ven aparecer o desaparecer, y viceversa.
   */
  private updateVisibility(player: Player, before: Set<EntityId>, mode: MoveMode): void {
    const after = this.idsNear(player);
    const stayed = [...after].filter((id) => before.has(id));
    const entered = [...after].filter((id) => !before.has(id));
    const left = [...before].filter((id) => !after.has(id));

    this.notifier.sendMany(stayed, {
      type: 'playerMoved',
      id: player.id,
      position: player.position,
      direction: player.direction,
      mode,
    });
    this.notifier.sendMany(entered, { type: 'playerAppeared', player: player.toSnapshot() });
    this.notifier.sendMany(left, { type: 'playerDisappeared', id: player.id });

    for (const id of entered) {
      const other = this.world.get(id);
      if (other)
        this.notifier.send(player.id, { type: 'playerAppeared', player: other.toSnapshot() });
    }
    for (const id of left) this.notifier.send(player.id, { type: 'playerDisappeared', id });
  }

  private idsNear(player: Player): Set<EntityId> {
    return new Set(this.world.playersNear(player.position, { except: player.id }).map((p) => p.id));
  }
}
