import { ITEMS, type ItemKind } from '@fenix/shared/items/item-catalog';
import { el } from './dom';
import { itemIconUrl } from './item-icons';

/**
 * Cuántos mover de una pila (como el de UO al levantar monedas): "Todo",
 * "Mitad", "Uno" o un número con el teclado numérico (o el del teclado de la
 * computadora: números, borrar, Enter y Escape). Se abre en el medio de la
 * pantalla, sobre todo lo demás; tocar afuera es cancelar.
 */
export class AmountPicker {
  readonly element: HTMLElement;
  private readonly panel: HTMLElement;
  private pending: ((amount: number | null) => void) | null = null;
  private typed = '';
  private max = 1;
  private readonly display = el('output', { className: 'amount-display' });
  private readonly header = el('div', { className: 'amount-header' });

  constructor() {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].map((key) => {
      const button = el('button', {
        className:
          key === '✓'
            ? 'amount-key amount-key--ok'
            : key === '⌫'
              ? 'amount-key amount-key--back'
              : 'amount-key',
        text: key,
        attrs: {
          type: 'button',
          'aria-label': key === '✓' ? 'Mover' : key === '⌫' ? 'Borrar' : key,
        },
      });
      button.addEventListener('click', () => this.press(key));
      return button;
    });
    const quick = (text: string, value: () => number): HTMLElement => {
      const button = el('button', {
        className: 'button button--plaque amount-quick',
        text,
        attrs: { type: 'button' },
      });
      button.addEventListener('click', () => this.finish(value()));
      return button;
    };
    const close = el('button', {
      className: 'window-close',
      text: '✕',
      attrs: { type: 'button', 'aria-label': 'Cancelar' },
    });
    close.addEventListener('click', () => this.finish(null));
    this.panel = el('div', { className: 'panel amount-panel', attrs: { role: 'dialog' } }, [
      el('div', { className: 'amount-bar' }, [this.header, close]),
      this.display,
      el('div', { className: 'amount-quicks' }, [
        quick('Todo', () => this.max),
        quick('Mitad', () => Math.max(1, Math.floor(this.max / 2))),
        quick('Uno', () => 1),
      ]),
      el('div', { className: 'amount-keys' }, keys),
    ]);
    this.element = el('div', { className: 'amount-picker' }, [this.panel]);
    this.element.hidden = true;
    this.element.addEventListener('pointerdown', (e) => {
      if (e.target === this.element) this.finish(null);
    });
    window.addEventListener('keydown', (e) => this.onKey(e), { capture: true });
  }

  /** Pregunta cuántos de `max` (null si se cancela). */
  ask(kind: ItemKind, max: number): Promise<number | null> {
    this.pending?.(null);
    this.max = max;
    this.typed = '';
    const item = ITEMS[kind];
    this.header.replaceChildren(
      el('img', {
        className: 'amount-icon',
        attrs: { src: itemIconUrl(kind, max), alt: '', draggable: 'false' },
      }),
      el('span', {
        className: 'window-title',
        text: `¿${item.article === 'una' ? 'Cuántas' : 'Cuántos'} ${item.plural}?`,
      }),
    );
    this.render();
    this.element.hidden = false;
    return new Promise((resolve) => {
      this.pending = resolve;
    });
  }

  private press(key: string): void {
    if (key === '✓') this.finish(this.typed ? Number(this.typed) : this.max);
    else if (key === '⌫') this.typed = this.typed.slice(0, -1);
    else if (this.typed.length < 7) {
      const next = `${this.typed}${key}`.replace(/^0+/, '');
      this.typed = Number(next) > this.max ? String(this.max) : next;
    }
    this.render();
  }

  private render(): void {
    this.display.textContent = this.typed || String(this.max);
    this.display.classList.toggle('is-placeholder', !this.typed);
    this.display.setAttribute('aria-label', `${this.typed || this.max} de ${this.max}`);
  }

  private finish(amount: number | null): void {
    if (!this.pending) return;
    const resolve = this.pending;
    this.pending = null;
    this.element.hidden = true;
    resolve(amount === null ? null : Math.max(1, Math.min(this.max, Math.floor(amount))));
  }

  /** En la computadora: números, borrar, Enter (mover) y Escape (cancelar), sin que los tome el juego. */
  private onKey(e: KeyboardEvent): void {
    if (!this.pending) return;
    const key = /^[0-9]$/.test(e.key)
      ? e.key
      : e.key === 'Backspace'
        ? '⌫'
        : e.key === 'Enter'
          ? '✓'
          : null;
    if (e.key === 'Escape') this.finish(null);
    else if (key) this.press(key);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
}
