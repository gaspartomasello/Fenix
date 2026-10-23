import type { EntityId, GroundItemSnapshot } from '@fenix/shared/protocol/messages';
import type { ItemChanges } from '../../domain/items/items';
import type { World } from '../../domain/world';
import type { Notifier } from '../ports';

/**
 * Traduce cambios de objetos en mensajes: el suelo, a quienes lo ven; la
 * mochila, a su dueño; lo que alguien tiene puesto, a quienes lo ven.
 */
export class ItemNotifications {
  /** Lo arma `Corpses`: avisa que cambió lo que hay dentro de un cuerpo. */
  onCorpseChanged: (corpseId: EntityId) => void = () => {};
  /** Lo arma `Containers`: avisa que cambió lo que hay dentro de un recipiente. */
  onContainerChanged: (containerId: string) => void = () => {};

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
    // Lo que entra o sale de una bolsa propia cambia el peso que se lleva.
    const owners = new Set(changes.inventories);
    for (const containerId of changes.containers) {
      const root = this.world.items.rootOf(containerId);
      if (root && (root.type === 'backpack' || root.type === 'equipment')) owners.add(root.ownerId);
    }
    for (const ownerId of owners) this.sendInventory(ownerId);
    for (const ownerId of changes.looks) this.sendLook(ownerId);
    for (const corpseId of changes.corpses) this.onCorpseChanged(corpseId);
    for (const containerId of changes.containers) this.onContainerChanged(containerId);
    if (changes.message) this.notifier.send(actorId, { type: 'system', text: changes.message });
  }

  sendInventory(ownerId: EntityId): void {
    const items = this.world.items;
    const weight = items.weightOf(ownerId);
    const player = this.world.get(ownerId);
    if (player) player.carried = weight;
    this.notifier.send(ownerId, {
      type: 'inventory',
      backpack: items.backpackOf(ownerId).flatMap((i) => i.toBackpackSnapshot() ?? []),
      equipment: items.equipmentOf(ownerId).flatMap((i) => i.toEquippedSnapshot() ?? []),
      bank: items.bankOf(ownerId).flatMap((i) => i.toBackpackSnapshot() ?? []),
      weight: Math.round(weight * 10) / 10,
      ...(player?.unburdened ? { unburdened: true as const } : {}),
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
    return this.world.items
      .groundNear(player.position, (p) => this.world.seen(p))
      .flatMap((i) => i.toGroundSnapshot() ?? []);
  }

  private sendLook(ownerId: EntityId): void {
    const owner = this.world.get(ownerId);
    if (!owner) return;
    this.notifier.sendMany(this.watchers(owner.position), {
      type: 'playerEquipment',
      id: ownerId,
      equipment: this.world.items.lookOf(ownerId),
      hues: this.world.items.huesOf(ownerId),
    });
  }

  private watchers(position: { x: number; y: number }): EntityId[] {
    return this.world.playersNear(position).map((p) => p.id);
  }
}
