import type { EntityId } from '@fenix/shared';
import type { World } from '../../domain/world';
import type { ItemNotifications } from '../item-notifications';
import type { MobileNotifications } from '../mobile-notifications';
import type { Notifier } from '../ports';
import type { EconomyActions } from './economy-actions';

/** Doble clic sobre un objeto. */
export class UseItem {
  constructor(
    private readonly world: World,
    private readonly notifications: ItemNotifications,
    private readonly notifier: Notifier,
    private readonly mobiles: MobileNotifications,
    private readonly economy: EconomyActions,
  ) {}

  execute(playerId: EntityId, itemId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player) return;
    if (player.combat.isDead) {
      this.notifier.send(playerId, {
        type: 'system',
        text: 'Los fantasmas no pueden tocar objetos.',
      });
      return;
    }
    // Doble clic sobre el mineral: fundirlo en una forja cercana.
    const item = this.world.items.get(itemId);
    if (item?.kind === 'iron-ore' && item.ownerId() === playerId) {
      this.economy.smelt(playerId);
      return;
    }
    const result = this.world.items.use(player, itemId);
    if (!result.ok) {
      this.notifier.send(playerId, { type: 'system', text: result.reason });
      return;
    }
    this.notifications.publish(result.changes, playerId);
    const effect = result.changes.effect;
    if (effect) {
      player.combat.heal(effect.heal);
      player.combat.restoreStamina(effect.stamina);
      this.mobiles.sendVitals(player);
      this.mobiles.broadcastHealth(player);
    }
  }
}
