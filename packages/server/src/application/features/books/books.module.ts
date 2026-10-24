import type { ModuleFactory } from '../../kernel/game-module';
import { Books } from './books';

/** Libros para leer y escribir. */
export const booksModule: ModuleFactory = (kernel) => {
  const books = new Books(kernel.world, kernel.items, kernel.notifier);
  kernel.itemUses.on('book', (playerId, itemId) => books.read(playerId, itemId));
  return {
    name: 'books',
    handles: {
      readBook: (playerId, m) => books.read(playerId, m.itemId),
      writeBook: (playerId, m) => books.write(playerId, m.itemId, m.title, m.page, m.text),
    },
  };
};
