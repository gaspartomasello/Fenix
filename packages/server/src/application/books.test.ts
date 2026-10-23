import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import { LORE_BOOKS } from '@fenix/shared/items/books';
import { decodeClientMessage } from '@fenix/shared/protocol/codec';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { captureCharacter, parseSavedCharacter } from '../domain/persistence/saved-character';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

function createRoom() {
  const map = new TileMap({
    width: 10,
    height: 10,
    terrain: new Array<Terrain>(100).fill(Terrain.Grass),
    statics: [],
    regions: [],
  });
  const world = new World(map, { x: 5, y: 5 });
  const notifier = new RecordingNotifier();
  const app = new GameApplication({
    world,
    worldClock: new WorldClock(0),
    clock: new FakeClock(0),
    ids: new SequentialIds(),
    random: new FixedRandom(0.1),
    notifier,
  });
  const join = (name: string) => {
    const result = app.join({ type: 'join', name, appearance: DEFAULT_APPEARANCE });
    if (!result.ok) throw new Error(result.reason);
    app.announceJoin(result.playerId);
    return result.playerId;
  };
  return { world, app, notifier, join };
}

describe('libros', () => {
  it('un libro en blanco se escribe hoja por hoja, queda firmado y se guarda', () => {
    const { world, app, notifier, join } = createRoom();
    const ana = join('Ana');
    const book = world.items.add('libro-1', 'book', 1, {
      type: 'backpack',
      ownerId: ana,
      position: { x: 0, y: 0 },
    });
    app.handle(ana, { type: 'useItem', itemId: book.id });
    const opened = notifier.ofType('book').at(-1)?.message;
    expect(opened).toMatchObject({ writable: true, title: '', pages: [] });

    app.handle(ana, { type: 'writeBook', itemId: book.id, title: 'Diario', page: 0, text: 'Hola' });
    app.handle(ana, { type: 'writeBook', itemId: book.id, title: 'Diario', page: 2, text: 'Fin' });
    expect(book.book).toEqual({ title: 'Diario', author: 'Ana', pages: ['Hola', '', 'Fin'] });
    // Borrar la última hoja la saca.
    app.handle(ana, { type: 'writeBook', itemId: book.id, title: 'Diario', page: 2, text: ' ' });
    expect(book.book?.pages).toEqual(['Hola']);

    const player = world.get(ana);
    if (!player) throw new Error('sin jugador');
    const saved = parseSavedCharacter(
      JSON.parse(JSON.stringify(captureCharacter(player, world, null))),
    );
    expect(saved?.items.find((i) => i.kind === 'book')?.book?.title).toBe('Diario');
  });

  it('los libros de las bibliotecas se leen pero no se escriben', () => {
    const { world, app, notifier, join } = createRoom();
    const ana = join('Ana');
    const book = world.items.add('libro-2', 'book', 1, {
      type: 'backpack',
      ownerId: ana,
      position: { x: 0, y: 0 },
    });
    book.book = LORE_BOOKS[0] ?? null;
    app.handle(ana, { type: 'readBook', itemId: book.id });
    expect(notifier.ofType('book').at(-1)?.message).toMatchObject({ writable: false });
    app.handle(ana, { type: 'writeBook', itemId: book.id, title: 'Mío', page: 0, text: 'x' });
    expect(book.book).toBe(LORE_BOOKS[0]);
  });

  it('no se escribe en el libro de otro que está lejos ni hojas fuera del libro', () => {
    const { world, app, join } = createRoom();
    const ana = join('Ana');
    const beto = join('Beto');
    const book = world.items.add('libro-3', 'book', 1, {
      type: 'backpack',
      ownerId: ana,
      position: { x: 0, y: 0 },
    });
    app.handle(beto, { type: 'writeBook', itemId: book.id, title: 'Robado', page: 0, text: 'x' });
    expect(book.book).toBeNull();
    const decoded = decodeClientMessage(
      JSON.stringify({ type: 'writeBook', itemId: book.id, title: 't', page: 99, text: 'x' }),
    );
    expect(decoded.ok).toBe(false);
  });
});
