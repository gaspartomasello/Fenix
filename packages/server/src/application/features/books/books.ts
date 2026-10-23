import { BLANK_BOOK, writeBookPage } from '@fenix/shared/items/books';
import { ITEMS } from '@fenix/shared/items/item-catalog';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { emptyChanges } from '../../../domain/items/items';
import type { World } from '../../../domain/world';
import type { ItemNotifications } from '../../kernel/item-notifications';
import type { Notifier } from '../../ports';

/**
 * Libros, como en UO: con doble clic se abren y se leen hoja por hoja. Un
 * libro en blanco se puede escribir (título y hojas); el primero que escribe
 * queda como autor. Los libros que se encuentran en las bibliotecas ya vienen
 * escritos y no se pueden cambiar.
 */
export class Books {
  constructor(
    private readonly world: World,
    private readonly notifications: ItemNotifications,
    private readonly notifier: Notifier,
  ) {}

  read(playerId: EntityId, itemId: EntityId): void {
    const player = this.world.get(playerId);
    const item = this.world.items.get(itemId);
    if (!player || !item || ITEMS[item.kind].use !== 'book') return;
    if (player.combat.isDead) return this.say(playerId, 'Los fantasmas no pueden leer.');
    const denied = this.world.items.reach(player, itemId);
    if (denied) return this.say(playerId, denied);
    const book = item.book ?? BLANK_BOOK;
    this.notifier.send(playerId, {
      type: 'book',
      itemId,
      title: book.title,
      author: book.author,
      pages: book.pages,
      writable: !book.sealed,
    });
  }

  write(playerId: EntityId, itemId: EntityId, title: string, page: number, text: string): void {
    const player = this.world.get(playerId);
    const item = this.world.items.get(itemId);
    if (!player || !item || ITEMS[item.kind].use !== 'book' || player.combat.isDead) return;
    const denied = this.world.items.reach(player, itemId);
    if (denied) return this.say(playerId, denied);
    const book = item.book ?? BLANK_BOOK;
    if (book.sealed) return this.say(playerId, 'Este libro no se puede escribir.');
    const before = book.title;
    item.book = writeBookPage(book, player.name, title, page, text);
    // El título se ve al pasar el mouse: si cambió, se avisa.
    if (item.book.title !== before) {
      const changes = emptyChanges();
      this.world.items.touch(item, changes);
      this.notifications.publish(changes, playerId);
    }
  }

  private say(playerId: EntityId, text: string): void {
    this.notifier.send(playerId, { type: 'system', text });
  }
}
