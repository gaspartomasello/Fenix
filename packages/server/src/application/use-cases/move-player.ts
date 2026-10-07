import type { Direction, EntityId, MoveMode } from '@fenix/shared';
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
    this.notifier.broadcast(
      {
        type: 'playerMoved',
        id: playerId,
        position: player.position,
        direction: player.direction,
        mode,
      },
      { except: playerId },
    );
  }
}
