import { LORE_BOOKS } from '@fenix/shared/items/books';
import { ITEMS, SCROLL_KINDS, type ItemKind } from '@fenix/shared/items/item-catalog';
import { TRAP_DAMAGE, unlockReach } from '@fenix/shared/magic/spell-catalog';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { lockDifficulty } from '@fenix/shared/skills/thievery';
import {
  STATIC_CONTAINERS,
  STATICS,
  staticContainerAt,
  type ContainerLook,
  type StaticPlacement,
} from '@fenix/shared/world/statics';
import { emptyChanges } from '../../../domain/items/items';
import type { World } from '../../../domain/world';
import type { ItemNotifications } from '../../kernel/item-notifications';
import type { Clock, IdGenerator, Notifier, RandomSource } from '../../ports';

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
    ['amethyst', 1, 2, 0.12],
    ['ruby', 1, 1, 0.06],
    ['torch', 1, 2, 0.25],
  ],
  barrel: [
    ['apple', 3, 10, 0.6],
    ['raw-fish', 2, 6, 0.3],
    ['carrot', 2, 8, 0.4],
    ['bread', 1, 4, 0.4],
    ['cheese', 1, 2, 0.3],
    ['wine', 1, 3, 0.25],
    ['ale', 1, 3, 0.25],
  ],
  crate: [
    ['logs', 4, 12, 0.6],
    ['boards', 3, 10, 0.5],
    ['cloth', 2, 8, 0.4],
    ['hides', 2, 5, 0.3],
  ],
  bookshelf: [
    ['blank-scroll', 2, 6, 0.7],
    ['book', 1, 1, 0.3],
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
  /** Muebles con trampa mágica: estalla en la cara del próximo que lo abra. */
  private readonly traps = new Set<string>();
  /** Cofres cerrados con llave que alguien abrió con ganzúa, y cuándo (se vuelven a cerrar). */
  private readonly unlocked = new Map<string, number>();
  /** Muebles cerrados con Cerradura mágica, y con qué dificultad. */
  private readonly magicLocks = new Map<string, number>();
  /** Lo arma la aplicación: daña a alguien (la trampa que estalla). */
  hurt: (playerId: EntityId, amount: number) => void = () => {};
  /** Lo arma la aplicación: por qué alguien no puede abrir un recipiente (la bodega de un barco). */
  refusal: (playerId: EntityId, containerId: string) => string | null = () => null;
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
    const refused = this.refusal(playerId, containerId);
    if (refused) return this.say(playerId, refused);
    if (this.lockOf(containerId) > 0)
      return this.say(
        playerId,
        `${capitalize(name)} está cerrado con llave. Hace falta una ganzúa.`,
      );
    if (this.traps.delete(containerId)) {
      const [min, max] = TRAP_DAMAGE;
      const amount = min + Math.floor(this.random.next() * (max - min + 1));
      this.say(playerId, `¡Una trampa mágica estalla al abrir ${name}! (${amount})`);
      this.hurt(playerId, amount);
      if (player.combat.isDead) return;
    }
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

  /** Trampa mágica puesta (o sacada) con un hechizo. */
  setTrap(casterId: EntityId, containerId: string, armed: boolean): void {
    const name = this.nameOf(containerId) ?? 'el mueble';
    if (armed) {
      this.traps.add(containerId);
      return this.say(casterId, `Pusiste una trampa en ${name}.`);
    }
    this.say(
      casterId,
      this.traps.delete(containerId)
        ? `Desarmaste la trampa de ${name}.`
        : `${capitalize(name)} no tenía ninguna trampa.`,
    );
  }

  /** Cerradura mágica: cierra un mueble abierto (más difícil de forzar con más Magia). */
  magicLock(casterId: EntityId, containerId: string, magery: number): void {
    const name = this.nameOf(containerId) ?? 'el mueble';
    if (this.lockOf(containerId) > 0)
      return this.say(casterId, `${capitalize(name)} ya está cerrado con llave.`);
    this.magicLocks.set(containerId, Math.max(100, Math.floor(magery * 0.8)));
    for (const [playerId, ids] of this.open)
      if (ids.has(containerId)) this.close(playerId, containerId);
    this.say(casterId, `Cerraste ${name} con magia.`);
  }

  /** Abrir cerradura: abre la cerradura si no es más difícil de lo que alcanza la Magia. */
  magicUnlock(casterId: EntityId, containerId: string, magery: number): void {
    const name = this.nameOf(containerId) ?? 'el mueble';
    const difficulty = this.lockOf(containerId);
    if (difficulty === 0)
      return this.say(casterId, `${capitalize(name)} no está cerrado con llave.`);
    if (difficulty > unlockReach(magery))
      return this.say(casterId, `La cerradura de ${name} es demasiado difícil para tu Magia.`);
    this.unlock(containerId);
    this.say(casterId, `¡Clic! La cerradura de ${name} se abrió.`);
  }

  /** Telequinesis sobre un mueble: si tiene trampa, estalla lejos de quien la hizo saltar. */
  springTrap(casterId: EntityId, containerId: string): void {
    const name = this.nameOf(containerId) ?? 'el mueble';
    this.say(
      casterId,
      this.traps.delete(containerId)
        ? `La trampa de ${name} estalla lejos de vos, sin hacerte daño.`
        : `Moviste la tapa de ${name} desde lejos: no tenía trampa.`,
    );
  }

  /**
   * Dificultad de la cerradura de un mueble (0 si está abierto). Solo los
   * cofres tienen llave; los abiertos con ganzúa se vuelven a cerrar cuando
   * se reponen.
   */
  lockOf(containerId: string): number {
    const magic = this.magicLocks.get(containerId);
    if (magic !== undefined) return magic;
    const difficulty = this.difficultyOf(containerId);
    if (difficulty === 0) return 0;
    const at = this.unlocked.get(containerId);
    return at !== undefined && this.clock.now() - at < REFILL_MS ? 0 : difficulty;
  }

  /** La cerradura cedió: queda abierto hasta que el cofre se reponga. */
  unlock(containerId: string): void {
    if (this.magicLocks.delete(containerId)) return;
    this.unlocked.set(containerId, this.clock.now());
  }

  /** El nombre de un mueble o bolsa (para los avisos). */
  describe(containerId: string): string | null {
    return this.nameOf(containerId);
  }

  private difficultyOf(containerId: string): number {
    const placed = this.staticOf(containerId);
    if (!placed || STATIC_CONTAINERS[placed.kind]?.look !== 'chest') return 0;
    // Fuera de todo pueblo o lugar con nombre no hay cerraduras.
    const region = this.world.map.regionAt(placed);
    if (!region) return 0;
    return lockDifficulty(placed.x, placed.y, !this.world.map.safeZoneAt(placed));
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
    // Lo que se guarda con llave vale más: oro y alguna gema según la cerradura.
    const lock = this.difficultyOf(containerId);
    if (lock > 0) {
      const spot = (): {
        type: 'container';
        containerId: string;
        position: { x: number; y: number };
      } => ({
        type: 'container',
        containerId,
        position: this.world.items.gridSpot(
          this.world.items.contentsOf(containerId).map((it) => it.location),
        ),
      });
      this.world.items.add(
        this.ids.next(),
        'gold',
        20 + Math.floor(this.random.next() * lock),
        spot(),
      );
      const gems = ['amethyst', 'sapphire', 'ruby', 'emerald', 'diamond'] as const;
      if (this.random.next() < 0.3 + lock / 1500) {
        const gem =
          gems[
            Math.min(
              gems.length - 1,
              Math.floor((lock / 1000) * gems.length * this.random.next() * 1.6),
            )
          ] ?? 'amethyst';
        this.world.items.add(this.ids.next(), gem, 1, spot());
      }
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
    // Y casi siempre algún libro para leer.
    if (this.lookOf(containerId) === 'bookshelf' && this.random.next() < 0.7) {
      const lore = LORE_BOOKS[Math.floor(this.random.next() * LORE_BOOKS.length)] ?? LORE_BOOKS[0];
      const book = this.world.items.add(this.ids.next(), 'book', 1, {
        type: 'container',
        containerId,
        position: this.world.items.gridSpot(
          this.world.items.contentsOf(containerId).map((it) => it.location),
        ),
      });
      book.book = lore ?? null;
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

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
