import type { EntityId, ItemDestination } from '@fenix/shared/protocol/messages';
import type { Item } from '../../../domain/items/item';
import type { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { Guards } from '../../kernel/guards';
import type { ItemNotifications } from '../../kernel/item-notifications';
import type { Notifier } from '../../ports';
import type { GameServices } from '../../kernel/services';

/** Arrastrar y soltar un objeto: al suelo, a la mochila o al equipo. */
export class MoveItem {
  constructor(
    private readonly world: World,
    private readonly notifications: ItemNotifications,
    private readonly notifier: Notifier,
    private readonly banking: GameServices['banking'],
    /** Reglas de otros módulos que no dejan levantar algo (lo de adentro de una casa ajena). */
    private readonly guards: Guards<[player: Player, item: Item]>,
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
    const item = this.world.items.get(itemId);
    const refused = item ? this.guards.refusal(player, item) : null;
    if (refused) {
      this.notifier.send(playerId, { type: 'system', text: refused });
      this.notifications.sendInventory(playerId);
      return;
    }
    const nearBanker = this.banking.nearBanker(player);
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
