import type { EntityId } from '@fenix/shared';
import type { World } from '../../domain/world';
import type { Notifier } from '../ports';

export class LeaveWorld {
  constructor(
    private readonly world: World,
    private readonly notifier: Notifier,
  ) {}

  execute(playerId: EntityId): void {
    const player = this.world.remove(playerId);
    if (!player) return;
    this.notifier.broadcast({ type: 'playerLeft', id: playerId });
    this.notifier.broadcast({ type: 'system', text: `${player.name} salió del mundo.` });
  }
}
