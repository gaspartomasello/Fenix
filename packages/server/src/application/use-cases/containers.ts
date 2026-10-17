import {
  ITEMS,
  SCROLL_KINDS,
  STATIC_CONTAINERS,
  STATICS,
  staticContainerAt,
  type ContainerLook,
  type EntityId,
  type ItemKind,
  type StaticPlacement,
} from '@fenix/shared';
import { emptyChanges } from '../../domain/items/items';
import type { World } from '../../domain/world';
import type { ItemNotifications } from '../item-notifications';
import type { Clock, IdGenerator, Notifier, RandomSource } from '../ports';

/** Cada cuánto se revisa que quien tiene un recipiente abierto siga pudiendo verlo. */
const CHECK_MS = 1000;
/** Un mueble vacío se vuelve a llenar después de este tiempo (como en UO, el mundo se repone). */
const REFILL_MS = 30 * 60 * 1000;

/** Lo que suele haber en cada mueble: [objeto, cantidad mínima, máxima, probabilidad]. */
const STOCK: Readonly<Record<ContainerLook, readonly [ItemKind, number, number, number][]>> = {
  chest: [
    ['gold', 10, 80, 1],
    ['bandage', 2, 6, 0.6],
    ['healing-potion', 1, 2, 0.4],
    ['apple', 1, 4, 0.4],
    ['blank-scroll', 1, 3, 0.3],
    ['pouch', 1, 1, 0.2],
  ],
  barrel: [
    ['apple', 3, 10, 0.7],
    ['raw-fish', 2, 6, 0.4],
  ],
  crate: [
    ['logs', 4, 12, 0.6],
    ['boards', 3, 10, 0.5],
    ['cloth', 2, 8, 0.4],
    ['hides', 2, 5, 0.3],
  ],
  bookshelf: [
    ['blank-scroll', 2, 6, 0.7],
    ['scribe-pen', 1, 1, 0.2],
  ],
  shelf: [
    ['empty-bottle', 2, 5, 0.7],
    ['healing-potion', 1, 2, 0.5],
    ['cure-potion', 1, 2, 0.4],
    ['refresh-potion', 1, 2, 0.4],
    ['garlic', 2, 6, 0.4],
    ['ginseng', 2, 6, 0.4],
  ],
  bag: [],
  box: [],
};

/**
 * Recipientes, como en UO: las bolsas y cajas que se llevan en la mochila y
 * los muebles del mundo que guardan cosas (cofres, barriles, cajones,
 * bibliotecas, estantes). Con doble clic se abren y se ve lo de adentro; se
 * arrastra para guardar o sacar. Los muebles traen cosas la primera vez que
 * se abren y se reponen al rato de quedar vacíos. Quien se aleja deja de verlo.
 */
export class Containers {
  /** Qué recipientes tiene abiertos cada jugador. */
  private readonly open = new Map<EntityId, Set<string>>();
  /** Cuándo se llenó por última vez cada mueble. */
  private readonly stockedAt = new Map<string, number>();
  private nextCheckAt = 0;

  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly random: RandomSource,
    private readonly notifications: ItemNotifications,
    private readonly notifier: Notifier,
  ) {
    notifications.onContainerChanged = (id) => this.refresh(id);
  }

  /** Abrir: una bolsa (su id) o un mueble (`static:x:y`). */
  openFor(playerId: EntityId, containerId: string): void {
    const player = this.world.get(playerId);
    if (!player) return;
    if (player.combat.isDead) return this.say(playerId, 'Los fantasmas no pueden abrir nada.');
    const name = this.nameOf(containerId);
    if (!name) return;
    const denied = this.world.items.containerAccess(player, containerId, this.nearBanker(playerId));
    if (denied) return this.say(playerId, denied);
    if (staticContainerAt(containerId)) this.stock(containerId);
    let set = this.open.get(playerId);
    if (!set) this.open.set(playerId, (set = new Set()));
    set.add(containerId);
    this.send(playerId, containerId);
  }

  /** Revisa (cada tanto) que quien tiene algo abierto siga pudiendo verlo. */
  tick(now: number): void {
    if (now < this.nextCheckAt) return;
    this.nextCheckAt = now + CHECK_MS;
    for (const [playerId, ids] of this.open) {
      const player = this.world.get(playerId);
      if (!player) {
        this.open.delete(playerId);
        continue;
      }
      for (const id of ids)
        if (this.world.items.containerAccess(player, id, this.nearBanker(playerId)))
          this.close(playerId, id);
    }
  }

  forget(playerId: EntityId): void {
    this.open.delete(playerId);
  }

  /** Cambió lo de adentro: se lo reenvía a quienes lo tienen abierto. */
  private refresh(containerId: string): void {
    for (const [playerId, ids] of this.open)
      if (ids.has(containerId)) this.send(playerId, containerId);
  }

  private send(playerId: EntityId, containerId: string): void {
    const name = this.nameOf(containerId);
    if (!name) return this.close(playerId, containerId);
    const items = this.world.items
      .contentsOf(containerId)
      .flatMap((i) => i.toBackpackSnapshot() ?? []);
    this.notifier.send(playerId, {
      type: 'container',
      containerId,
      name,
      look: this.lookOf(containerId),
      items,
    });
  }

  private close(playerId: EntityId, containerId: string): void {
    this.open.get(playerId)?.delete(containerId);
    this.notifier.send(playerId, { type: 'containerClosed', containerId });
  }

  /** Llena un mueble la primera vez (y lo repone si quedó vacío hace rato). */
  private stock(containerId: string): void {
    const now = this.clock.now();
    const last = this.stockedAt.get(containerId);
    const empty = this.world.items.contentsOf(containerId).length === 0;
    if (last !== undefined && !(empty && now - last >= REFILL_MS)) return;
    this.stockedAt.set(containerId, now);
    const changes = emptyChanges();
    const kinds = STOCK[this.lookOf(containerId)];
    for (const [kind, min, max, chance] of kinds) {
      if (this.random.next() >= chance) continue;
      const amount = min + Math.floor(this.random.next() * (max - min + 1));
      const stacks = ITEMS[kind].stackable ? 1 : amount;
      for (let i = 0; i < stacks; i++)
        this.world.items.add(this.ids.next(), kind, ITEMS[kind].stackable ? amount : 1, {
          type: 'container',
          containerId,
          position: this.world.items.gridSpot(
            this.world.items.contentsOf(containerId).map((it) => it.location),
          ),
        });
    }
    // En las bibliotecas, a veces, un pergamino de hechizo.
    if (this.lookOf(containerId) === 'bookshelf' && this.random.next() < 0.3) {
      const scroll = SCROLL_KINDS[Math.floor(this.random.next() * 16)] ?? SCROLL_KINDS[0];
      if (scroll)
        this.world.items.add(this.ids.next(), scroll, 1, {
          type: 'container',
          containerId,
          position: this.world.items.gridSpot(
            this.world.items.contentsOf(containerId).map((it) => it.location),
          ),
        });
    }
    changes.containers.add(containerId);
  }

  private staticOf(containerId: string): StaticPlacement | undefined {
    const at = staticContainerAt(containerId);
    if (!at) return undefined;
    return this.world.map.statics.find(
      (s) => s.x === at.x && s.y === at.y && STATIC_CONTAINERS[s.kind],
    );
  }

  private nameOf(containerId: string): string | null {
    const placed = this.staticOf(containerId);
    if (placed) return STATICS[placed.kind].name;
    const bag = this.world.items.get(containerId);
    return bag && ITEMS[bag.kind].capacity ? ITEMS[bag.kind].name : null;
  }

  private lookOf(containerId: string): ContainerLook {
    const placed = this.staticOf(containerId);
    if (placed) return STATIC_CONTAINERS[placed.kind]?.look ?? 'chest';
    const bag = this.world.items.get(containerId);
    return bag?.kind === 'wooden-box' ? 'box' : 'bag';
  }

  /** ¿Está cerca de la banquera? (para las bolsas guardadas en el banco). */
  private nearBanker(playerId: EntityId): boolean {
    const player = this.world.get(playerId);
    if (!player) return false;
    return this.world
      .allNpcs()
      .some(
        (n) =>
          n.role === 'banker' &&
          Math.max(
            Math.abs(n.position.x - player.position.x),
            Math.abs(n.position.y - player.position.y),
          ) <= 3,
      );
  }

  private say(playerId: EntityId, text: string): void {
    this.notifier.send(playerId, { type: 'system', text });
  }
}
