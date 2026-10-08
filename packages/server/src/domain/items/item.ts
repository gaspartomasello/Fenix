import type {
  BackpackItemSnapshot,
  EntityId,
  EquipmentSlot,
  EquippedItemSnapshot,
  GroundItemSnapshot,
  ItemKind,
  Position,
} from '@fenix/shared';

/** Dónde está un objeto: en el suelo, en una mochila o puesto. */
export type ItemLocation =
  | { readonly type: 'ground'; readonly position: Position }
  | { readonly type: 'backpack'; readonly ownerId: EntityId; readonly position: Position }
  | { readonly type: 'bank'; readonly ownerId: EntityId; readonly position: Position }
  | { readonly type: 'equipment'; readonly ownerId: EntityId; readonly slot: EquipmentSlot };

export class Item {
  constructor(
    readonly id: EntityId,
    readonly kind: ItemKind,
    public amount: number,
    public location: ItemLocation,
  ) {}

  ownerId(): EntityId | null {
    return this.location.type === 'ground' ? null : this.location.ownerId;
  }

  toGroundSnapshot(): GroundItemSnapshot | null {
    if (this.location.type !== 'ground') return null;
    return { id: this.id, kind: this.kind, amount: this.amount, position: this.location.position };
  }

  toBackpackSnapshot(): BackpackItemSnapshot | null {
    if (this.location.type !== 'backpack' && this.location.type !== 'bank') return null;
    return { id: this.id, kind: this.kind, amount: this.amount, position: this.location.position };
  }

  toEquippedSnapshot(): EquippedItemSnapshot | null {
    if (this.location.type !== 'equipment') return null;
    return { id: this.id, kind: this.kind, amount: this.amount, slot: this.location.slot };
  }
}
