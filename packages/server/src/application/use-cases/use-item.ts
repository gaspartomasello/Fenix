import { ITEMS, describeItem, type EntityId } from '@fenix/shared';
import { startBandage } from '../../domain/healing/bandage';
import { consume } from '../../domain/items/consumables';
import type { World } from '../../domain/world';
import type { ItemNotifications } from '../item-notifications';
import type { MobileNotifications } from '../mobile-notifications';
import type { Clock, IdGenerator, Notifier, RandomSource } from '../ports';
import type { EconomyActions } from './economy-actions';

/** Doble clic sobre un objeto, o usarlo sobre alguien (vendas). */
export class UseItem {
  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly random: RandomSource,
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
    const changes = result.changes;
    const consumed = changes.consumed;
    if (consumed) {
      const effect = consume(player, consumed, this.clock.now(), () => this.random.next());
      changes.message = effect.message;
      // La botella vacía vuelve a la mochila, como en UO.
      if (ITEMS[consumed].potion)
        this.world.items.addToBackpack(playerId, 'empty-bottle', 1, () => this.ids.next(), changes);
      this.mobiles.sendVitals(player);
      this.mobiles.broadcastHealth(player);
      if (effect.effectsChanged) this.mobiles.sendEffects(player);
    }
    this.notifications.publish(changes, playerId);
  }

  /** Usar un objeto sobre alguien: por ahora, vendarlo. */
  useOn(playerId: EntityId, itemId: EntityId, targetId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const item = this.world.items.get(itemId);
    if (item?.kind !== 'bandage') {
      this.notifier.send(playerId, {
        type: 'system',
        text: item
          ? `No podés usar ${describeItem(item.kind)} sobre alguien.`
          : 'Ese objeto ya no está.',
      });
      return;
    }
    const result = startBandage(player, itemId, targetId, this.world, this.clock.now());
    if (!result.ok) {
      this.notifier.send(playerId, { type: 'system', text: result.reason });
      return;
    }
    const self = result.target.id === playerId;
    result.changes.message = self
      ? 'Empezás a vendarte.'
      : `Empezás a vendar a ${result.target.name}.`;
    this.notifications.publish(result.changes, playerId);
    if (!self)
      this.notifier.send(result.target.id, {
        type: 'system',
        text: `${player.name} empieza a vendarte.`,
      });
  }
}
