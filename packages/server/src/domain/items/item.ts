import type { ShipRecord } from '../ships/ship';
import type {
  BookText,
  BackpackItemSnapshot,
  EntityId,
  EquipmentSlot,
  EquippedItemSnapshot,
  GroundItemSnapshot,
  ItemKind,
  Position,
  RuneMark,
  TreasureMark,
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
  | { readonly type: 'equipment'; readonly ownerId: EntityId; readonly slot: EquipmentSlot }
  /** Adentro de un recipiente: una bolsa (su id) o un mueble (`static:x:y`). */
  | { readonly type: 'container'; readonly containerId: string; readonly position: Position };

export class Item {
  constructor(
    readonly id: EntityId,
    readonly kind: ItemKind,
    public amount: number,
    public location: ItemLocation,
  ) {}

  /** Runa marcada: el lugar que guarda (null en blanco). */
  mark: RuneMark | null = null;

  /** Libro: lo que tiene escrito (null si nunca se escribió). */
  book: BookText | null = null;

  /** Teñido: su color (null: el de siempre). */
  hue: number | null = null;

  /** Mapa del tesoro: dónde está enterrado el cofre (null si no es un mapa). */
  treasure: TreasureMark | null = null;

  /** Maqueta de un barco ya botado alguna vez: su nombre, casco y permisos. */
  ship: ShipRecord | null = null;

  /** Lo que el cliente ve además de tipo y cantidad. */
  private get extra(): { mark?: RuneMark; bookTitle?: string; hue?: number } {
    return {
      ...(this.mark ? { mark: this.mark } : {}),
      ...(this.book?.title ? { bookTitle: this.book.title } : {}),
      ...(this.hue !== null ? { hue: this.hue } : {}),
    };
  }

  ownerId(): EntityId | null {
    return this.location.type === 'ground' ||
      this.location.type === 'corpse' ||
      this.location.type === 'container'
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
    if (inside !== 'backpack' && inside !== 'bank' && inside !== 'corpse' && inside !== 'container')
      return null;
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
