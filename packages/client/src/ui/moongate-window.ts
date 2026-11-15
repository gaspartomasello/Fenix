import { el, onPress } from './dom';

/**
 * El portal lunar: al pisarlo, un cartel con las ciudades a las que lleva
 * (placas grabadas, una por ciudad). Elegir una es viajar; tocar afuera, la ✕
 * o Escape es quedarse.
 */
export class MoongateWindow {
  readonly element: HTMLElement;
  private readonly title = el('h2', { className: 'confirm-title', text: 'Portal lunar' });
  private readonly text = el('p', { className: 'confirm-text' });
  private readonly list = el('div', { className: 'moongate-list' });

  constructor(private readonly travel: (destination: string) => void) {
    const close = el('button', {
      className: 'window-close',
      text: '✕',
      attrs: { type: 'button', 'aria-label': 'Quedarse' },
    });
    onPress(close, () => this.hide());
    const panel = el('div', { className: 'panel confirm-panel', attrs: { role: 'dialog' } }, [
      el('div', { className: 'confirm-head' }, [this.title, close]),
      this.text,
      this.list,
    ]);
    this.element = el('div', { className: 'confirm-dialog' }, [panel]);
    this.element.hidden = true;
    this.element.addEventListener('pointerdown', (e) => {
      if (e.target === this.element) this.hide();
    });
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.element.hidden || e.key !== 'Escape') return;
        this.hide();
        e.preventDefault();
        e.stopPropagation();
      },
      { capture: true },
    );
  }

  show(here: string, destinations: readonly string[]): void {
    this.text.textContent = `Estás en las afueras de ${here}. ¿A dónde querés ir?`;
    this.list.replaceChildren(
      ...destinations.map((name) => {
        const button = el('button', {
          className: 'button button--plaque',
          text: name,
          attrs: { type: 'button' },
        });
        onPress(button, () => {
          this.hide();
          this.travel(name);
        });
        return button;
      }),
    );
    this.element.hidden = false;
  }

  hide(): void {
    this.element.hidden = true;
  }
}
