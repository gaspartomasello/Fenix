import { readSign } from '../core/signs';
import { el, onPress } from './dom';

/**
 * La ventana de un cartel de camino (doble clic o dos toques sobre él): una
 * tabla de madera tallada con una flecha por rama, girada como se ve en la
 * pantalla. Se cierra con la ✕, tocando afuera o con Escape.
 */
export class SignWindow {
  readonly element: HTMLElement;
  private readonly title = el('h2', { className: 'confirm-title sign-title' });
  private readonly list = el('ul', { className: 'sign-lines' });

  constructor() {
    const close = el('button', {
      className: 'window-close',
      text: '✕',
      attrs: { type: 'button', 'aria-label': 'Cerrar' },
    });
    onPress(close, () => this.close());
    const panel = el(
      'div',
      { className: 'panel confirm-panel sign-panel', attrs: { role: 'dialog' } },
      [el('div', { className: 'confirm-head' }, [this.title, close]), this.list],
    );
    this.element = el('div', { className: 'confirm-dialog sign-dialog' }, [panel]);
    this.element.hidden = true;
    this.element.addEventListener('pointerdown', (e) => {
      if (e.target === this.element) this.close();
    });
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.element.hidden || e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        this.close();
      },
      { capture: true },
    );
  }

  show(text: string): void {
    const { title, lines } = readSign(text);
    this.title.textContent = title;
    this.list.replaceChildren(
      ...lines.map((line) =>
        el('li', { className: 'sign-line' }, [
          el('span', {
            className: 'sign-arrow',
            text: line.arrow ?? '➤',
            attrs: { 'aria-hidden': 'true' },
          }),
          el('span', { className: 'sign-place' }, [
            ...(line.heading
              ? [el('small', { className: 'sign-heading', text: line.heading })]
              : []),
            el('span', { text: line.text }),
          ]),
        ]),
      ),
    );
    this.element.hidden = false;
  }

  close(): void {
    this.element.hidden = true;
  }
}
