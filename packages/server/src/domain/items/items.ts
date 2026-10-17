import {
  BACKPACK_AREA,
  STATIC_CONTAINERS,
  staticContainerAt,
  CORPSE_AREA,
  ITEM_ICON_SIZE,
  ITEMS,
  MAX_BACKPACK_ITEMS,
  MAX_STACK,
  clampToBackpack,
  describeItem,
  inViewRange,
  withinReach,
  type EntityId,
  type EquipmentHues,
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
  /** Cuerpos cuyo contenido cambió. */
  readonly corpses: Set<EntityId>;
  /** Recipientes (bolsas y muebles) cuyo contenido cambió. */
  readonly containers: Set<string>;
  /** Mensaje para quien actuó. */
  message?: string;
  /** Lo que se comió o tomó: su efecto lo aplica `consumables.ts`. */
  consumed?: ItemKind;
}

export type ItemResult = { ok: true; changes: ItemChanges } | { ok: false; reason: string };

export const emptyChanges = (): ItemChanges => ({
  groundRemoved: [],
  groundAdded: [],
  inventories: new Set(),
  looks: new Set(),
  corpses: new Set(),
  containers: new Set(),
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

  bankOf(ownerId: EntityId): Item[] {
    return this.all().filter((i) => i.location.type === 'bank' && i.location.ownerId === ownerId);
  }

  /** Agrega unidades nuevas a la mochila, juntándolas con una pila existente si se puede. */
  addToBackpack(
    ownerId: EntityId,
    kind: ItemKind,
    amount: number,
    ids: () => EntityId,
    changes: ItemChanges,
  ): boolean {
    if (ITEMS[kind].stackable) {
      const stack = this.backpackOf(ownerId).find(
        (i) => i.kind === kind && !i.newbie && i.amount + amount <= MAX_STACK,
      );
      if (stack) {
        stack.amount += amount;
        changes.inventories.add(ownerId);
        return true;
      }
    }
    if (this.backpackOf(ownerId).length >= MAX_BACKPACK_ITEMS) return false;
    this.add(ids(), kind, amount, { type: 'backpack', ownerId, position: this.freeSpot(ownerId) });
    changes.inventories.add(ownerId);
    return true;
  }

  /** Lo que hay dentro de un cuerpo. */
  corpseOf(corpseId: EntityId): Item[] {
    return this.all().filter(
      (i) => i.location.type === 'corpse' && i.location.corpseId === corpseId,
    );
  }

  /**
   * Pone el botín dentro de un cuerpo, acomodado en una grilla como en una
   * mochila. Devuelve los objetos creados.
   */
  fillCorpse(
    corpseId: EntityId,
    at: Position,
    drops: readonly { kind: ItemKind; amount: number }[],
    ids: () => EntityId,
  ): Item[] {
    const columns = Math.floor(CORPSE_AREA.width / ITEM_ICON_SIZE);
    const rows = Math.floor(CORPSE_AREA.height / ITEM_ICON_SIZE);
    return drops.map((drop, index) =>
      this.add(ids(), drop.kind, drop.amount, {
        type: 'corpse',
        corpseId,
        at,
        // En grilla; si no entran, se encima el resto en cascada, como en UO.
        position:
          index < columns * rows
            ? {
                x: (index % columns) * ITEM_ICON_SIZE,
                y: Math.floor(index / columns) * ITEM_ICON_SIZE,
              }
            : {
                x: (index * 11) % (CORPSE_AREA.width - ITEM_ICON_SIZE),
                y: (index * 17) % (CORPSE_AREA.height - ITEM_ICON_SIZE),
              },
      }),
    );
  }

  /** Saca un objeto del mundo (un portal que se cierra). */
  remove(id: EntityId): Item | undefined {
    const item = this.byId.get(id);
    this.byId.delete(id);
    return item;
  }

  /** Lo saca del mundo avisando a quien lo tenía o lo veía (un mapa que se usó). */
  destroy(id: EntityId, changes: ItemChanges): void {
    const item = this.byId.get(id);
    if (!item) return;
    this.detach(item, changes);
    this.byId.delete(id);
  }

  /** El cuerpo se deshizo: lo que quedaba adentro se pierde con él. */
  removeCorpse(corpseId: EntityId): void {
    for (const item of this.corpseOf(corpseId)) this.byId.delete(item.id);
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

  /** Colores teñidos de lo que tiene puesto. */
  huesOf(ownerId: EntityId): EquipmentHues {
    const hues: Partial<Record<EquipmentSlot, number>> = {};
    for (const item of this.equipmentOf(ownerId))
      if (item.location.type === 'equipment' && item.hue !== null)
        hues[item.location.slot] = item.hue;
    return hues;
  }

  /** Cuántas unidades de un tipo tiene alguien en la mochila. */
  countInBackpack(ownerId: EntityId, kind: ItemKind): number {
    return this.backpackOf(ownerId)
      .filter((i) => i.kind === kind)
      .reduce((sum, i) => sum + i.amount, 0);
  }

  /** Gasta unidades de la mochila (reactivos, por ejemplo). Devuelve false si no alcanzan. */
  consumeFromBackpack(
    ownerId: EntityId,
    kind: ItemKind,
    amount: number,
    changes: ItemChanges,
  ): boolean {
    if (this.countInBackpack(ownerId, kind) < amount) return false;
    let left = amount;
    for (const item of this.backpackOf(ownerId).filter((i) => i.kind === kind)) {
      const used = Math.min(left, item.amount);
      item.amount -= used;
      left -= used;
      if (item.amount <= 0) this.byId.delete(item.id);
      if (left === 0) break;
    }
    changes.inventories.add(ownerId);
    return true;
  }

  /** Borra todo lo que lleva un jugador (todavía no hay persistencia). */
  removeOwnedBy(ownerId: EntityId): void {
    for (const item of this.all())
      if (item.ownerId() === ownerId) {
        // Lo que lleva adentro de sus bolsas se va con ellas.
        if (ITEMS[item.kind].capacity)
          for (const inner of this.descendantsOf(item.id)) this.byId.delete(inner.id);
        this.byId.delete(item.id);
      }
  }

  /**
   * Mueve un objeto al suelo, a la mochila, al banco o al equipo de `actor`.
   * El banco solo se puede usar con `nearBanker`.
   */
  move(
    actor: ItemActor,
    itemId: EntityId,
    to: ItemDestination,
    map: TileMap,
    nearBanker = false,
  ): ItemResult {
    const item = this.byId.get(itemId);
    if (!item) return fail('Ese objeto ya no está.');
    const access = this.checkAccess(actor, item);
    if (access) return fail(access);
    if ((item.location.type === 'bank' || to.type === 'bank') && !nearBanker) {
      return fail('Para usar el banco tenés que estar cerca de la banquera.');
    }

    if (item.newbie) {
      const refusal = this.newbieRefusal(actor, to);
      if (refusal) return fail(refusal);
    }

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
      case 'bank':
        this.relocate(
          item,
          {
            type: 'bank',
            ownerId: actor.id,
            position: clampToBackpack(to.position ?? { x: 0, y: 0 }),
          },
          changes,
        );
        return { ok: true, changes };
      case 'equipment':
        return this.equip(actor.id, item, to.slot, changes);
      case 'container':
        return this.putInContainer(
          actor,
          item,
          to.containerId,
          to.position,
          map,
          nearBanker,
          changes,
        );
    }
  }

  /** El equipo inicial solo va entre las cosas de su dueño: mochila, equipo, banco y sus bolsas. */
  private newbieRefusal(actor: ItemActor, to: ItemDestination): string | null {
    if (to.type === 'ground') return 'Es tu equipo inicial: no lo podés tirar.';
    if (to.type !== 'container') return null;
    const root = this.rootOf(to.containerId);
    const own =
      root !== null &&
      (root.type === 'backpack' || root.type === 'bank' || root.type === 'equipment') &&
      root.ownerId === actor.id;
    return own ? null : 'Es tu equipo inicial: solo lo podés guardar entre tus cosas.';
  }

  /** Lo que hay adentro de un recipiente (una bolsa o un mueble). */
  contentsOf(containerId: string): Item[] {
    return this.all().filter(
      (i) => i.location.type === 'container' && i.location.containerId === containerId,
    );
  }

  /** Todo lo que hay adentro, también en las bolsas de adentro. */
  descendantsOf(containerId: string): Item[] {
    const out: Item[] = [];
    for (const item of this.contentsOf(containerId)) {
      out.push(item);
      if (ITEMS[item.kind].capacity) out.push(...this.descendantsOf(item.id));
    }
    return out;
  }

  /**
   * Dónde está, en definitiva, un recipiente: un mueble del mapa, o el lugar
   * de la bolsa de más afuera (la mochila de alguien, el suelo, un cuerpo…).
   */
  rootOf(containerId: string): ItemLocation | { type: 'static'; at: Position } | null {
    let id = containerId;
    for (let depth = 0; depth < 10; depth++) {
      const at = staticContainerAt(id);
      if (at) return { type: 'static', at };
      const bag = this.byId.get(id);
      if (!bag || !ITEMS[bag.kind].capacity) return null;
      if (bag.location.type !== 'container') return bag.location;
      id = bag.location.containerId;
    }
    return null;
  }

  /** ¿Puede `actor` ver y tocar lo de adentro de este recipiente? (null: sí; si no, el motivo). */
  containerAccess(actor: ItemActor, containerId: string, nearBanker = false): string | null {
    const root = this.rootOf(containerId);
    if (!root) return 'Eso ya no está.';
    switch (root.type) {
      case 'static':
        return withinReach(actor.position, root.at) ? null : 'Está demasiado lejos.';
      case 'ground':
        return withinReach(actor.position, root.position) ? null : 'Está demasiado lejos.';
      case 'corpse':
        return withinReach(actor.position, root.at) ? null : 'El cuerpo está demasiado lejos.';
      case 'bank':
        if (root.ownerId !== actor.id) return 'Eso no es tuyo.';
        return nearBanker ? null : 'Para usar el banco tenés que estar cerca de la banquera.';
      case 'container':
        return 'Eso ya no está.';
      default:
        return root.ownerId === actor.id ? null : 'Eso no es tuyo.';
    }
  }

  private putInContainer(
    actor: ItemActor,
    item: Item,
    containerId: string,
    position: Position | undefined,
    map: TileMap,
    nearBanker: boolean,
    changes: ItemChanges,
  ): ItemResult {
    const access = this.containerAccess(actor, containerId, nearBanker);
    if (access) return fail(access);
    const capacity = this.capacityOf(containerId, map);
    if (!capacity) return fail('Eso no guarda cosas.');
    // Una bolsa no entra en sí misma (ni en una bolsa que lleva adentro).
    for (let id: string | null = containerId; id;) {
      if (id === item.id) return fail('No podés meter una bolsa adentro de sí misma.');
      const parent = this.byId.get(id);
      id = parent?.location.type === 'container' ? parent.location.containerId : null;
    }
    const inside = this.contentsOf(containerId);
    const already = item.location.type === 'container' && item.location.containerId === containerId;
    if (already) {
      if (position)
        this.relocate(
          item,
          { type: 'container', containerId, position: clampToBackpack(position) },
          changes,
        );
      return { ok: true, changes };
    }
    if (ITEMS[item.kind].stackable) {
      const stack = inside.find(
        (i) =>
          i.kind === item.kind && i.newbie === item.newbie && i.amount + item.amount <= MAX_STACK,
      );
      if (stack) {
        this.detach(item, changes);
        this.byId.delete(item.id);
        stack.amount += item.amount;
        changes.containers.add(containerId);
        return { ok: true, changes };
      }
    }
    if (inside.length >= capacity) return fail('Ya no entra nada más ahí.');
    const spot = position
      ? clampToBackpack(position)
      : this.gridSpot(inside.map((i) => i.location));
    this.relocate(item, { type: 'container', containerId, position: spot }, changes);
    return { ok: true, changes };
  }

  /** Cuántos objetos entran en un recipiente (0 si no es uno). */
  capacityOf(containerId: string, map: TileMap): number {
    const at = staticContainerAt(containerId);
    if (at) {
      const placed = map.statics.find(
        (s) => s.x === at.x && s.y === at.y && STATIC_CONTAINERS[s.kind],
      );
      return placed ? (STATIC_CONTAINERS[placed.kind]?.capacity ?? 0) : 0;
    }
    const bag = this.byId.get(containerId);
    return bag ? (ITEMS[bag.kind].capacity ?? 0) : 0;
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
      case 'drink':
        this.consumeOne(item, changes);
        changes.consumed = item.kind;
        return { ok: true, changes };
      case 'equip':
        if (item.location.type === 'equipment')
          return this.putInBackpack(actor.id, item, undefined, changes);
        return this.equip(actor.id, item, definition.slot ?? 'rightHand', changes);
      case 'spellbook':
      case 'tool':
      case 'craft':
      case 'smelt':
      case 'bandage':
      case 'scroll':
      case 'container':
      case 'book':
      case 'music':
      case 'dye':
      case 'map':
      case 'dig':
      case 'ship':
        // Se resuelven en otros casos de uso (o en el cliente): acá no hay nada que hacer.
        return { ok: true, changes };
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

  all(): Item[] {
    return [...this.byId.values()];
  }

  /** ¿Lo puede tocar? Devuelve el motivo si no. */
  reach(actor: ItemActor, itemId: EntityId): string | null {
    const item = this.byId.get(itemId);
    return item ? this.checkAccess(actor, item) : 'Ese objeto ya no está.';
  }

  /** Un objeto cambió sin moverse (un libro escrito): se avisa donde sea que esté. */
  touch(item: Item, changes: ItemChanges): void {
    const at = item.location;
    if (at.type === 'ground') {
      changes.groundRemoved.push({ id: item.id, position: at.position });
      changes.groundAdded.push(item);
    } else if (at.type === 'corpse') changes.corpses.add(at.corpseId);
    else if (at.type === 'container') changes.containers.add(at.containerId);
    else changes.inventories.add(at.ownerId);
  }

  private checkAccess(actor: ItemActor, item: Item): string | null {
    if (ITEMS[item.kind].fixed) return 'Eso no se puede mover.';
    if (item.location.type === 'ground') {
      return withinReach(actor.position, item.location.position) ? null : 'Está demasiado lejos.';
    }
    if (item.location.type === 'corpse') {
      return withinReach(actor.position, item.location.at)
        ? null
        : 'El cuerpo está demasiado lejos.';
    }
    if (item.location.type === 'container')
      return this.containerAccess(actor, item.location.containerId, true);
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
        (i) =>
          i.kind === item.kind && i.newbie === item.newbie && i.amount + item.amount <= MAX_STACK,
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
    const from = item.location.type;
    this.relocate(item, { type: 'backpack', ownerId, position: target }, changes);
    if (from === 'ground') changes.message = `Levantaste ${describeItem(item.kind, item.amount)}.`;
    if (from === 'corpse') changes.message = `Tomaste ${describeItem(item.kind, item.amount)}.`;
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
    // Un arma de dos manos no deja usar escudo (y al revés): lo otro vuelve a la mochila.
    const otherSlot = slot === 'rightHand' ? 'leftHand' : slot === 'leftHand' ? 'rightHand' : null;
    const other = otherSlot
      ? this.equipmentOf(ownerId).find(
          (i) => i.location.type === 'equipment' && i.location.slot === otherSlot,
        )
      : undefined;
    if (other && (ITEMS[item.kind].twoHanded || ITEMS[other.kind].twoHanded)) {
      if (this.backpackOf(ownerId).length >= MAX_BACKPACK_ITEMS)
        return fail('Tu mochila está llena.');
      this.relocate(
        other,
        { type: 'backpack', ownerId, position: this.freeSpot(ownerId) },
        changes,
      );
      changes.message = `Guardaste ${describeItem(other.kind)}: necesitás las dos manos.`;
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
    if (location.type === 'corpse') {
      changes.corpses.add(location.corpseId);
      return;
    }
    if (location.type === 'container') {
      changes.containers.add(location.containerId);
      return;
    }
    changes.inventories.add(location.ownerId);
    if (location.type === 'equipment') changes.looks.add(location.ownerId);
  }

  /** Primer casillero libre de la mochila, en una grilla del tamaño de un ícono. */
  freeSpot(ownerId: EntityId): Position {
    return this.gridSpot(this.backpackOf(ownerId).map((i) => i.location));
  }

  /** Primer casillero libre entre los lugares ya ocupados (mochila o recipiente). */
  gridSpot(locations: readonly ItemLocation[]): Position {
    const taken = locations.map((l) =>
      'position' in l && l.type !== 'ground' ? l.position : null,
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
