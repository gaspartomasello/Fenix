import fellUrl from '@fontsource/im-fell-english/files/im-fell-english-latin-400-normal.woff2?url';
import frakturUrl from '@fontsource/unifrakturmaguntia/files/unifrakturmaguntia-latin-400-normal.woff2?url';
import { BOOK_PAGES, BOOK_PAGE_CHARS, BOOK_TITLE_CHARS } from '@fenix/shared/items/books';
import type { EntityId } from '@fenix/shared/protocol/messages';
import type { BookContents } from '../core/client-game';
import { el } from './dom';
import { GameWindow } from './game-window';

/** Lo que el libro le pide al juego: guardar una hoja escrita. */
export type WritePage = (itemId: EntityId, title: string, page: number, text: string) => void;

let fontsLoaded = false;

/**
 * Letras de libro antiguo (licencia libre OFL): "IM Fell English" para el
 * texto y "UnifrakturMaguntia" (gótica) para el título y la letra capital.
 * Se cargan la primera vez que se abre un libro.
 */
function loadBookFonts(): void {
  if (fontsLoaded || typeof FontFace === 'undefined') return;
  fontsLoaded = true;
  for (const [family, url] of [
    ['Fenix Libro', fellUrl],
    ['Fenix Gotica', frakturUrl],
  ] as const) {
    const face = new FontFace(family, `url(${url})`);
    document.fonts.add(face);
    face.load().catch(() => undefined);
  }
}

/**
 * Un libro abierto, como en UO: dos hojas de pergamino una al lado de la
 * otra y flechas para pasar las páginas. En la primera va el título y quién
 * lo escribió. Si el libro se puede escribir, cada hoja es un campo de
 * texto; lo escrito se guarda al pasar de página o al cerrar el libro.
 */
export class BookWindow {
  readonly window: GameWindow;
  private book: BookContents | null = null;
  /** Primera hoja del par que se ve (las hojas de texto empiezan en 0). */
  private spread = -1;
  private title = '';
  private pages: string[] = [];
  private readonly dirty = new Set<number>();
  private titleDirty = false;
  private readonly left: HTMLElement;
  private readonly right: HTMLElement;
  private readonly back: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly folio: HTMLElement;

  constructor(private readonly write: WritePage) {
    this.window = new GameWindow('libro', 'Libro', { x: 260, y: 110 });
    this.window.element.classList.add('book-window');
    this.left = el('div', { className: 'book-page book-left' });
    this.right = el('div', { className: 'book-page book-right' });
    this.back = el('button', {
      className: 'book-turn book-back',
      text: '❮',
      attrs: { type: 'button', 'aria-label': 'Página anterior' },
    });
    this.next = el('button', {
      className: 'book-turn book-next',
      text: '❯',
      attrs: { type: 'button', 'aria-label': 'Página siguiente' },
    });
    this.folio = el('p', { className: 'book-folio' });
    this.back.addEventListener('click', () => this.turn(-2));
    this.next.addEventListener('click', () => this.turn(2));
    this.window.body.append(
      el('div', { className: 'book-spread' }, [this.back, this.left, this.right, this.next]),
      this.folio,
    );
    // Al cerrar, se guarda lo escrito.
    new MutationObserver(() => {
      if (this.window.element.hidden) this.save();
    }).observe(this.window.element, { attributes: true, attributeFilter: ['hidden'] });
  }

  open(book: BookContents): void {
    loadBookFonts();
    if (this.book && this.book.itemId !== book.itemId) this.save();
    this.book = book;
    this.title = book.title;
    this.pages = [...book.pages];
    this.dirty.clear();
    this.titleDirty = false;
    this.spread = -1;
    this.window.setTitle(book.title || 'Libro');
    this.render();
    this.window.show();
  }

  private turn(delta: number): void {
    this.save();
    this.spread = Math.max(-1, Math.min(this.lastSpread(), this.spread + delta));
    this.render();
  }

  /** Hasta dónde se puede pasar: en uno escrito, hasta la última hoja con texto. */
  private lastSpread(): number {
    const filled = this.limit();
    // Pares: (portada, 0), (1, 2), (3, 4)…: empiezan en hoja impar.
    return Math.max(-1, (filled - 1) % 2 === 1 ? filled - 1 : filled - 2);
  }

  /** Cuántas hojas tiene: todas si se puede escribir, si no las escritas. */
  private limit(): number {
    return this.book?.writable ? BOOK_PAGES : Math.max(1, this.pages.length);
  }

  private render(): void {
    const book = this.book;
    if (!book) return;
    this.left.replaceChildren(
      this.spread < 0 ? this.cover(book) : this.page(this.spread, book.writable),
    );
    this.right.replaceChildren(this.page(this.spread + 1, book.writable));
    this.back.disabled = this.spread <= -1;
    this.next.disabled = this.spread >= this.lastSpread();
    // Números de hoja como los ve el jugador (desde 1); la portada no cuenta.
    const first = Math.max(1, this.spread + 1);
    const last = Math.min(this.spread + 2, this.limit());
    this.folio.textContent =
      first >= last
        ? `Hoja ${first} de ${this.limit()}`
        : `Hojas ${first}–${last} de ${this.limit()}`;
  }

  private cover(book: BookContents): HTMLElement {
    if (book.writable) {
      const input = el('input', {
        className: 'book-title-input',
        attrs: {
          type: 'text',
          maxlength: String(BOOK_TITLE_CHARS),
          placeholder: 'Título',
          'aria-label': 'Título del libro',
          value: this.title,
        },
      });
      input.value = this.title;
      input.addEventListener('input', () => {
        this.title = input.value;
        this.titleDirty = true;
      });
      return el('div', { className: 'book-cover' }, [
        input,
        el('p', {
          className: 'book-author',
          text: book.author ? `por ${book.author}` : 'Lo que escribas queda firmado con tu nombre.',
        }),
      ]);
    }
    return el('div', { className: 'book-cover' }, [
      el('h3', { className: 'book-title', text: book.title || 'Sin título' }),
      el('p', { className: 'book-author', text: book.author ? `por ${book.author}` : '' }),
    ]);
  }

  private page(index: number, writable: boolean): HTMLElement {
    if (index >= this.limit()) return el('div', { className: 'book-text' });
    const text = this.pages[index] ?? '';
    if (!writable) {
      const body = el('p', { className: 'book-text' });
      body.textContent = text;
      // La primera hoja empieza con letra capital, como en los libros iluminados.
      if (index === 0 && text) body.classList.add('book-initial');
      return body;
    }
    const area = el('textarea', {
      className: 'book-text book-input',
      attrs: { maxlength: String(BOOK_PAGE_CHARS), 'aria-label': `Hoja ${index + 1}` },
    });
    area.value = text;
    area.addEventListener('input', () => {
      while (this.pages.length <= index) this.pages.push('');
      this.pages[index] = area.value;
      this.dirty.add(index);
    });
    area.addEventListener('blur', () => this.save());
    return area;
  }

  /** Manda al servidor las hojas que cambiaron (y el título, con la primera). */
  private save(): void {
    const book = this.book;
    if (!book?.writable || (this.dirty.size === 0 && !this.titleDirty)) return;
    const pages = this.dirty.size > 0 ? [...this.dirty] : [0];
    for (const page of pages) this.write(book.itemId, this.title, page, this.pages[page] ?? '');
    this.dirty.clear();
    this.titleDirty = false;
    this.window.setTitle(this.title.trim() || 'Libro');
  }
}
