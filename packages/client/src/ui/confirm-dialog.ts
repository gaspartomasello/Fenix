import { el, onPress } from './dom';

/**
 * Un cartel para confirmar algo (sí o no), con la línea de las ventanas del
 * juego: cuero, bronce, título dorado y placas grabadas. Tocar afuera, la ✕
 * o Escape es decir que no.
 */
export class ConfirmDialog {
  readonly element: HTMLElement;
  private readonly title = el('h2', { className: 'confirm-title' });
  private readonly text = el('p', { className: 'confirm-text' });
  private readonly ok = el('button', {
    className: 'button button--plaque confirm-ok',
    attrs: { type: 'button' },
  });
  private onAccept: (() => void) | null = null;

  constructor() {
    const cancel = el('button', {
      className: 'button button--plaque confirm-cancel',
      text: 'Cancelar',
      attrs: { type: 'button' },
    });
    const close = el('button', {
      className: 'window-close',
      text: '✕',
      attrs: { type: 'button', 'aria-label': 'Cancelar' },
    });
    onPress(this.ok, () => this.finish(true));
    onPress(cancel, () => this.finish(false));
    onPress(close, () => this.finish(false));
    const panel = el('div', { className: 'panel confirm-panel', attrs: { role: 'dialog' } }, [
      el('div', { className: 'confirm-head' }, [this.title, close]),
      this.text,
      el('div', { className: 'confirm-actions' }, [this.ok, cancel]),
    ]);
    this.element = el('div', { className: 'confirm-dialog' }, [panel]);
    this.element.hidden = true;
    this.element.addEventListener('pointerdown', (e) => {
      if (e.target === this.element) this.finish(false);
    });
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.element.hidden) return;
        if (e.key === 'Escape') this.finish(false);
        else if (e.key === 'Enter') this.finish(true);
        else return;
        e.preventDefault();
        e.stopPropagation();
      },
      { capture: true },
    );
  }

  ask(title: string, text: string, accept: string, onAccept: () => void): void {
    this.title.textContent = title;
    this.text.textContent = text;
    this.ok.textContent = accept;
    this.onAccept = onAccept;
    this.element.hidden = false;
  }

  private finish(accepted: boolean): void {
    if (this.element.hidden) return;
    this.element.hidden = true;
    const accept = this.onAccept;
    this.onAccept = null;
    if (accepted) accept?.();
  }
}
