import type { Materials } from '@fenix/shared/housing/design';
import { describeItem, type ItemKind } from '@fenix/shared/items/item-catalog';
import type { EntityId } from '@fenix/shared/protocol/messages';
import type { ItemChanges } from '../../../domain/items/items';
import type { World } from '../../../domain/world';

/**
 * Cobrar y devolver lo de una obra: el oro sale de la mochila y, si no
 * alcanza, del banco (como en UO); los materiales, de la mochila y de los
 * cofres de la casa.
 */
export class BuildingPayment {
  constructor(
    private readonly world: World,
    private readonly ids: () => EntityId,
  ) {}

  /** Cuánto oro tiene para pagar (mochila y banco). */
  gold(playerId: EntityId): number {
    const banked = this.world.items
      .bankOf(playerId)
      .filter((i) => i.kind === 'gold')
      .reduce((sum, i) => sum + i.amount, 0);
    return this.world.items.countInBackpack(playerId, 'gold') + banked;
  }

  /** Cobra en oro; devuelve cuánto salió del banco (null si no alcanza). */
  payGold(playerId: EntityId, total: number, changes: ItemChanges): number | null {
    if (this.gold(playerId) < total) return null;
    const carried = this.world.items.countInBackpack(playerId, 'gold');
    const fromBackpack = Math.min(carried, total);
    if (fromBackpack > 0)
      this.world.items.consumeFromBackpack(playerId, 'gold', fromBackpack, changes);
    let fromBank = total - fromBackpack;
    const banked = fromBank;
    for (const stack of this.world.items.bankOf(playerId).filter((i) => i.kind === 'gold')) {
      if (fromBank === 0) break;
      const used = Math.min(fromBank, stack.amount);
      fromBank -= used;
      if (used === stack.amount) this.world.items.destroy(stack.id, changes);
      else stack.amount -= used;
      changes.inventories.add(playerId);
    }
    return banked;
  }

  /** Lo que falta de cada material (vacío: alcanza). */
  missing(playerId: EntityId, chestIds: readonly EntityId[], needed: Materials): string[] {
    const lacking: string[] = [];
    for (const [kind, amount] of entries(needed)) {
      const have = this.count(playerId, chestIds, kind);
      if (have < amount) lacking.push(describeItem(kind, amount - have));
    }
    return lacking;
  }

  /** Gasta los materiales: primero los de la mochila, después los de los cofres. */
  payMaterials(
    playerId: EntityId,
    chestIds: readonly EntityId[],
    needed: Materials,
    changes: ItemChanges,
  ): boolean {
    if (this.missing(playerId, chestIds, needed).length > 0) return false;
    for (const [kind, amount] of entries(needed)) {
      const carried = Math.min(amount, this.world.items.countInBackpack(playerId, kind));
      if (carried > 0) this.world.items.consumeFromBackpack(playerId, kind, carried, changes);
      let left = amount - carried;
      for (const chestId of chestIds) {
        for (const item of this.world.items.descendantsOf(chestId)) {
          if (left === 0) break;
          if (item.kind !== kind) continue;
          const used = Math.min(left, item.amount);
          left -= used;
          if (item.location.type === 'container') changes.containers.add(item.location.containerId);
          if (used === item.amount) this.world.items.destroy(item.id, changes);
          else item.amount -= used;
        }
      }
    }
    return true;
  }

  /** Devuelve materiales a la mochila (lo que no entra va al banco). */
  refund(playerId: EntityId, materials: Materials, changes: ItemChanges): void {
    for (const [kind, amount] of entries(materials)) {
      if (this.world.items.addToBackpack(playerId, kind, amount, this.ids, changes)) continue;
      this.world.items.add(this.ids(), kind, amount, {
        type: 'bank',
        ownerId: playerId,
        position: { x: 0, y: 0 },
      });
      changes.inventories.add(playerId);
    }
  }

  private count(playerId: EntityId, chestIds: readonly EntityId[], kind: ItemKind): number {
    const stored = chestIds
      .flatMap((id) => this.world.items.descendantsOf(id))
      .filter((i) => i.kind === kind)
      .reduce((sum, i) => sum + i.amount, 0);
    return this.world.items.countInBackpack(playerId, kind) + stored;
  }
}

function entries(materials: Materials): [ItemKind, number][] {
  return Object.entries(materials).filter((e): e is [ItemKind, number] => (e[1] ?? 0) > 0);
}

/** "40 tablas, 12 bloques de piedra". */
export function describeMaterials(materials: Materials): string {
  return entries(materials)
    .map(([kind, amount]) => describeItem(kind, amount))
    .join(', ');
}
