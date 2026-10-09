import {
  HEALING,
  BACKPACK_AREA,
  ITEM_ICON_SIZE,
  ITEMS,
  MAX_BACKPACK_ITEMS,
  MAX_STACK,
  clampToBackpack,
  describeItem,
  inViewRange,
  withinReach,
  type EntityId,
  type EquipmentLook,
  type EquipmentSlot,
  type ItemDestination,
  type ItemKind,
  type Position,
  type TileMap,
} from '@fenix/shared';
import { Item, type ItemLocation } from './item';

/** Quién actúa sobre un objeto. */
export interface ItemActor {
  readonly id: EntityId;
  readonly position: Position;
}

/** Qué cambió tras una acción, para avisar solo a quien corresponde. */
export interface ItemChanges {
  /** Objetos que dejaron el suelo (o cambiaron) en estas posiciones. */
  readonly groundRemoved: { id: EntityId; position: Position }[];
  /** Objetos que aparecieron (o cambiaron) en el suelo. */
  readonly groundAdded: Item[];
  /** Dueños cuya mochila o equipo cambió. */
  readonly inventories: Set<EntityId>;
  /** Dueños cuyo aspecto (lo que tienen puesto) cambió. */
  readonly looks: Set<EntityId>;
  /** Mensaje para quien actuó. */
  message?: string;
  /** Efecto sobre quien lo usó (comida, pociones). */
  effect?: { readonly heal: number; readonly stamina: number };
}

export type ItemResult = { ok: true; changes: ItemChanges } | { ok: false; reason: string };

const emptyChanges = (): ItemChanges => ({
  groundRemoved: [],
  groundAdded: [],
  inventories: new Set(),
  looks: new Set(),
});

const fail = (reason: string): ItemResult => ({ ok: false, reason });

/**
 * Todos los objetos del mundo y las reglas para moverlos y usarlos, como en
 * UO: se levantan a 2 tiles o menos, la mochila tiene un límite, lo apilable
 * se junta y cada lugar del cuerpo admite un solo objeto.
 */
export class Items {
  private readonly byId = new Map<EntityId, Item>();

  add(id: EntityId, kind: ItemKind, amount: number, location: ItemLocation): Item {
    const item = new Item(id, kind, amount, location);
    this.byId.set(id, item);
    return item;
  }

  get(id: EntityId): Item | undefined {
    return this.byId.get(id);
  }

  groundNear(position: Position): Item[] {
    return this.all().filter(
      (item) => item.location.type === 'ground' && inViewRange(item.location.position, position),
    );
  }

  backpackOf(ownerId: EntityId): Item[] {
    return this.all().filter(
      (i) => i.location.type === 'backpack' && i.location.ownerId === ownerId,
    );
  }

  equipmentOf(ownerId: EntityId): Item[] {
    return this.all().filter(
      (i) => i.location.type === 'equipment' && i.location.ownerId === ownerId,
    );
  }

  lookOf(ownerId: EntityId): EquipmentLook {
    const look: Partial<Record<EquipmentSlot, ItemKind>> = {};
    for (const item of this.equipmentOf(ownerId)) {
      if (item.location.type === 'equipment') look[item.location.slot] = item.kind;
    }
    return look;
  }

  /** Borra todo lo que lleva un jugador (todavía no hay persistencia). */
  removeOwnedBy(ownerId: EntityId): void {
    for (const item of this.all()) if (item.ownerId() === ownerId) this.byId.delete(item.id);
  }

  /** Mueve un objeto al suelo, a la mochila o al equipo de `actor`. */
  move(actor: ItemActor, itemId: EntityId, to: ItemDestination, map: TileMap): ItemResult {
    const item = this.byId.get(itemId);
    if (!item) return fail('Ese objeto ya no está.');
    const access = this.checkAccess(actor, item);
    if (access) return fail(access);

    const changes = emptyChanges();
    switch (to.type) {
      case 'ground': {
        if (!withinReach(actor.position, to.position))
          return fail('Está demasiado lejos para tirarlo ahí.');
        if (!map.isWalkable(to.position)) return fail('No podés tirar eso ahí.');
        this.relocate(item, { type: 'ground', position: to.position }, changes);
        return { ok: true, changes };
      }
      case 'backpack':
        return this.putInBackpack(actor.id, item, to.position, changes);
      case 'equipment':
        return this.equip(actor.id, item, to.slot, changes);
    }
  }

  /** Doble clic: comer, beber, ponerse o sacarse algo. */
  use(actor: ItemActor, itemId: EntityId): ItemResult {
    const item = this.byId.get(itemId);
    if (!item) return fail('Ese objeto ya no está.');
    const access = this.checkAccess(actor, item);
    if (access) return fail(access);

    const definition = ITEMS[item.kind];
    const changes = emptyChanges();
    switch (definition.use) {
      case 'eat':
        this.consumeOne(item, changes);
        changes.message = `Comiste ${describeItem(item.kind)}.`;
        changes.effect = { heal: HEALING.apple, stamina: 10 };
        return { ok: true, changes };
      case 'drink':
        this.consumeOne(item, changes);
        changes.message = `Tomaste ${describeItem(item.kind)}. Te sentís mejor.`;
        changes.effect = { heal: HEALING.potion, stamina: 0 };
        return { ok: true, changes };
      case 'equip':
        if (item.location.type === 'equipment')
          return this.putInBackpack(actor.id, item, undefined, changes);
        return this.equip(actor.id, item, definition.slot ?? 'rightHand', changes);
      case 'none': {
        const total = this.backpackOf(actor.id)
          .filter((i) => i.kind === item.kind)
          .reduce((sum, i) => sum + i.amount, 0);
        changes.message =
          item.location.type === 'ground'
            ? `Ves ${describeItem(item.kind, item.amount)}.`
            : `Tenés ${describeItem(item.kind, total)} en la mochila.`;
        return { ok: true, changes };
      }
    }
  }

  private all(): Item[] {
    return [...this.byId.values()];
  }

  private checkAccess(actor: ItemActor, item: Item): string | null {
    if (item.location.type === 'ground') {
      return withinReach(actor.position, item.location.position) ? null : 'Está demasiado lejos.';
    }
    return item.location.ownerId === actor.id ? null : 'Eso no es tuyo.';
  }

  private putInBackpack(
    ownerId: EntityId,
    item: Item,
    position: Position | undefined,
    changes: ItemChanges,
  ): ItemResult {
    const alreadyInside = item.location.type === 'backpack' && item.location.ownerId === ownerId;
    if (alreadyInside) {
      if (position)
        this.relocate(
          item,
          { type: 'backpack', ownerId, position: clampToBackpack(position) },
          changes,
        );
      return { ok: true, changes };
    }

    if (ITEMS[item.kind].stackable) {
      const stack = this.backpackOf(ownerId).find(
        (i) => i.kind === item.kind && i.amount + item.amount <= MAX_STACK,
      );
      if (stack) {
        this.detach(item, changes);
        this.byId.delete(item.id);
        stack.amount += item.amount;
        changes.inventories.add(ownerId);
        changes.message = `Guardaste ${describeItem(item.kind, item.amount)}.`;
        return { ok: true, changes };
      }
    }

    if (this.backpackOf(ownerId).length >= MAX_BACKPACK_ITEMS)
      return fail('Tu mochila está llena.');
    const target = position ? clampToBackpack(position) : this.freeSpot(ownerId);
    const fromGround = item.location.type === 'ground';
    this.relocate(item, { type: 'backpack', ownerId, position: target }, changes);
    if (fromGround) changes.message = `Levantaste ${describeItem(item.kind, item.amount)}.`;
    return { ok: true, changes };
  }

  private equip(
    ownerId: EntityId,
    item: Item,
    slot: EquipmentSlot,
    changes: ItemChanges,
  ): ItemResult {
    if (ITEMS[item.kind].slot !== slot) return fail('Eso no se puede poner ahí.');
    const current = this.equipmentOf(ownerId).find(
      (i) => i.location.type === 'equipment' && i.location.slot === slot,
    );
    if (current === item) return { ok: true, changes };
    if (current) {
      if (this.backpackOf(ownerId).length >= MAX_BACKPACK_ITEMS)
        return fail('Tu mochila está llena.');
      this.relocate(
        current,
        { type: 'backpack', ownerId, position: this.freeSpot(ownerId) },
        changes,
      );
    }
    this.relocate(item, { type: 'equipment', ownerId, slot }, changes);
    return { ok: true, changes };
  }

  private consumeOne(item: Item, changes: ItemChanges): void {
    this.detach(item, changes);
    item.amount -= 1;
    if (item.amount <= 0) {
      this.byId.delete(item.id);
      return;
    }
    this.attach(item, changes);
  }

  /** Cambia la ubicación registrando qué se debe avisar. */
  private relocate(item: Item, location: ItemLocation, changes: ItemChanges): void {
    this.detach(item, changes);
    item.location = location;
    this.attach(item, changes);
  }

  private detach(item: Item, changes: ItemChanges): void {
    this.markChanged(item, changes, 'from');
  }

  private attach(item: Item, changes: ItemChanges): void {
    this.markChanged(item, changes, 'to');
  }

  private markChanged(item: Item, changes: ItemChanges, side: 'from' | 'to'): void {
    const location = item.location;
    if (location.type === 'ground') {
      if (side === 'from') changes.groundRemoved.push({ id: item.id, position: location.position });
      else changes.groundAdded.push(item);
      return;
    }
    changes.inventories.add(location.ownerId);
    if (location.type === 'equipment') changes.looks.add(location.ownerId);
  }

  /** Primer casillero libre de la mochila, en una grilla del tamaño de un ícono. */
  private freeSpot(ownerId: EntityId): Position {
    const taken = this.backpackOf(ownerId).map((i) =>
      i.location.type === 'backpack' ? i.location.position : null,
    );
    const columns = Math.floor(BACKPACK_AREA.width / ITEM_ICON_SIZE);
    const rows = Math.floor(BACKPACK_AREA.height / ITEM_ICON_SIZE);
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const spot = { x: column * ITEM_ICON_SIZE, y: row * ITEM_ICON_SIZE };
        const occupied = taken.some(
          (p) =>
            p &&
            Math.abs(p.x - spot.x) < ITEM_ICON_SIZE / 2 &&
            Math.abs(p.y - spot.y) < ITEM_ICON_SIZE / 2,
        );
        if (!occupied) return spot;
      }
    }
    // Mochila apretada: se apilan en cascada, como en UO.
    const n = taken.length;
    return clampToBackpack({ x: (n * 9) % BACKPACK_AREA.width, y: (n * 7) % BACKPACK_AREA.height });
  }
}
