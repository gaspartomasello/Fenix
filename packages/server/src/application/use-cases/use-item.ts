import type { EntityId } from '@fenix/shared';
import type { World } from '../../domain/world';
import type { ItemNotifications } from '../item-notifications';
import type { Notifier } from '../ports';

/** Doble clic sobre un objeto. */
export class UseItem {
  constructor(
    private readonly world: World,
    private readonly notifications: ItemNotifications,
    private readonly notifier: Notifier,
  ) {}

  execute(playerId: EntityId, itemId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const result = this.world.items.use(player, itemId);
    if (!result.ok) {
      this.notifier.send(playerId, { type: 'system', text: result.reason });
      return;
    }
    this.notifications.publish(result.changes, playerId);
  }
}
