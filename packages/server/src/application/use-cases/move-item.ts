import type { EntityId, ItemDestination } from '@fenix/shared';
import type { World } from '../../domain/world';
import type { ItemNotifications } from '../item-notifications';
import type { Notifier } from '../ports';
import type { EconomyActions } from './economy-actions';

/** Arrastrar y soltar un objeto: al suelo, a la mochila o al equipo. */
export class MoveItem {
  constructor(
    private readonly world: World,
    private readonly notifications: ItemNotifications,
    private readonly notifier: Notifier,
    private readonly economy: EconomyActions,
  ) {}

  execute(playerId: EntityId, itemId: EntityId, to: ItemDestination): void {
    const player = this.world.get(playerId);
    if (!player) return;
    if (player.combat.isDead) {
      this.notifier.send(playerId, {
        type: 'system',
        text: 'Los fantasmas no pueden tocar objetos.',
      });
      return;
    }
    const nearBanker = this.economy.nearBanker(player);
    const result = this.world.items.move(player, itemId, to, this.world.map, nearBanker);
    if (!result.ok) {
      this.notifier.send(playerId, { type: 'system', text: result.reason });
      // Reenviar el estado real para que el cliente deshaga lo que haya mostrado.
      this.notifications.sendInventory(playerId);
      return;
    }
    this.notifications.publish(result.changes, playerId);
  }
}
