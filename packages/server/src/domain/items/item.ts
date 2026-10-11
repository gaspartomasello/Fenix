import type {
  BackpackItemSnapshot,
  EntityId,
  EquipmentSlot,
  EquippedItemSnapshot,
  GroundItemSnapshot,
  ItemKind,
  Position,
  RuneMark,
} from '@fenix/shared';

/** Dónde está un objeto: en el suelo, en una mochila, puesto o dentro de un cuerpo. */
export type ItemLocation =
  | { readonly type: 'ground'; readonly position: Position }
  | {
      readonly type: 'corpse';
      readonly corpseId: EntityId;
      /** Tile donde está el cuerpo. */
      readonly at: Position;
      /** Lugar en pixeles dentro de la ventana del cuerpo. */
      readonly position: Position;
    }
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

  /** Runa marcada: el lugar que guarda (null en blanco). */
  mark: RuneMark | null = null;

  /** Lo que el cliente ve además de tipo y cantidad. */
  private get extra(): { mark?: RuneMark } {
    return this.mark ? { mark: this.mark } : {};
  }

  ownerId(): EntityId | null {
    return this.location.type === 'ground' || this.location.type === 'corpse'
      ? null
      : this.location.ownerId;
  }

  toGroundSnapshot(): GroundItemSnapshot | null {
    if (this.location.type !== 'ground') return null;
    return {
      id: this.id,
      kind: this.kind,
      amount: this.amount,
      position: this.location.position,
      ...this.extra,
    };
  }

  toBackpackSnapshot(): BackpackItemSnapshot | null {
    const inside = this.location.type;
    if (inside !== 'backpack' && inside !== 'bank' && inside !== 'corpse') return null;
    return {
      id: this.id,
      kind: this.kind,
      amount: this.amount,
      position: this.location.position,
      ...this.extra,
    };
  }

  toEquippedSnapshot(): EquippedItemSnapshot | null {
    if (this.location.type !== 'equipment') return null;
    return {
      id: this.id,
      kind: this.kind,
      amount: this.amount,
      slot: this.location.slot,
      ...this.extra,
    };
  }
}
