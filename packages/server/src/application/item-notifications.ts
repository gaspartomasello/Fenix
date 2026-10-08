import type { EntityId, GroundItemSnapshot } from '@fenix/shared';
import type { ItemChanges } from '../domain/items/items';
import type { World } from '../domain/world';
import type { Notifier } from './ports';

/**
 * Traduce cambios de objetos en mensajes: el suelo, a quienes lo ven; la
 * mochila, a su dueño; lo que alguien tiene puesto, a quienes lo ven.
 */
export class ItemNotifications {
  constructor(
    private readonly world: World,
    private readonly notifier: Notifier,
  ) {}

  publish(changes: ItemChanges, actorId: EntityId): void {
    for (const { id, position } of changes.groundRemoved) {
      this.notifier.sendMany(this.watchers(position), {
        type: 'groundItems',
        added: [],
        removed: [id],
      });
    }
    for (const item of changes.groundAdded) {
      const snapshot = item.toGroundSnapshot();
      if (snapshot) {
        this.notifier.sendMany(this.watchers(snapshot.position), {
          type: 'groundItems',
          added: [snapshot],
          removed: [],
        });
      }
    }
    for (const ownerId of changes.inventories) this.sendInventory(ownerId);
    for (const ownerId of changes.looks) this.sendLook(ownerId);
    if (changes.message) this.notifier.send(actorId, { type: 'system', text: changes.message });
  }

  sendInventory(ownerId: EntityId): void {
    const items = this.world.items;
    this.notifier.send(ownerId, {
      type: 'inventory',
      backpack: items.backpackOf(ownerId).flatMap((i) => i.toBackpackSnapshot() ?? []),
      equipment: items.equipmentOf(ownerId).flatMap((i) => i.toEquippedSnapshot() ?? []),
      bank: items.bankOf(ownerId).flatMap((i) => i.toBackpackSnapshot() ?? []),
    });
  }

  /** Envía a un jugador los objetos del suelo que entraron o salieron de su vista. */
  sendGroundDiff(
    playerId: EntityId,
    before: ReadonlySet<EntityId>,
    after: readonly GroundItemSnapshot[],
  ): void {
    const afterIds = new Set(after.map((i) => i.id));
    const added = after.filter((i) => !before.has(i.id));
    const removed = [...before].filter((id) => !afterIds.has(id));
    if (added.length > 0 || removed.length > 0) {
      this.notifier.send(playerId, { type: 'groundItems', added, removed });
    }
  }

  groundSnapshotsNear(playerId: EntityId): GroundItemSnapshot[] {
    const player = this.world.get(playerId);
    if (!player) return [];
    return this.world.items.groundNear(player.position).flatMap((i) => i.toGroundSnapshot() ?? []);
  }

  private sendLook(ownerId: EntityId): void {
    const owner = this.world.get(ownerId);
    if (!owner) return;
    this.notifier.sendMany(this.watchers(owner.position), {
      type: 'playerEquipment',
      id: ownerId,
      equipment: this.world.items.lookOf(ownerId),
    });
  }

  private watchers(position: { x: number; y: number }): EntityId[] {
    return this.world.playersNear(position).map((p) => p.id);
  }
}
