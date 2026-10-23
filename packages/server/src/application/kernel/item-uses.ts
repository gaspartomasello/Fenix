import { ITEMS, type ItemKind } from '@fenix/shared/items/item-catalog';
import type { EntityId } from '@fenix/shared/protocol/messages';
import type { Item } from '../../domain/items/item';

/** Qué hace el doble clic: por clase de objeto, por su uso o por ser recipiente. */
export type ItemUseKey =
  `kind:${ItemKind}` | NonNullable<(typeof ITEMS)[ItemKind]['use']> | 'container';

type Handler = (playerId: EntityId, itemId: EntityId) => void;

/**
 * Registro de lo que hace el doble clic sobre un objeto. Cada módulo registra
 * los suyos (los libros se leen, los mapas del tesoro se miran, las bolsas
 * se abren); `UseItem` solo pregunta. Con `ownedOnly`, solo si es del jugador.
 */
export class ItemUses {
  private readonly handlers = new Map<ItemUseKey, { run: Handler; ownedOnly: boolean }>();

  on(key: ItemUseKey, run: Handler, options: { ownedOnly?: boolean } = {}): void {
    if (this.handlers.has(key)) throw new Error(`Dos módulos usan "${key}".`);
    this.handlers.set(key, { run, ownedOnly: options.ownedOnly === true });
  }

  /** Lo que hace el doble clic sobre ese objeto para ese jugador (o null si no hay nada propio). */
  find(item: Item, playerId: EntityId): Handler | null {
    const definition = ITEMS[item.kind];
    const keys: ItemUseKey[] = [`kind:${item.kind}`];
    if (definition.capacity) keys.push('container');
    if (definition.use) keys.push(definition.use);
    for (const key of keys) {
      const handler = this.handlers.get(key);
      if (!handler) continue;
      if (handler.ownedOnly && item.ownerId() !== playerId) continue;
      return handler.run;
    }
    return null;
  }
}
