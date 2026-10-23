import { el } from './dom';

/**
 * Aviso mientras se elige el objetivo de un hechizo, una habilidad o un
 * objeto. Mientras está visible, el puntero es una mira (`is-targeting` en la
 * página) y, en el celular, aparece un botón para cancelar junto al joystick.
 */
export class TargetingBanner {
  readonly element: HTMLElement;
  /** Botón grande para cancelar con el dedo (solo se ve en el modo táctil). */
  readonly cancelButton: HTMLButtonElement;
  private readonly text: HTMLElement;

  constructor() {
    this.text = el('span');
    const cancel = el('button', {
      className: 'targeting-cancel-inline',
      text: 'Cancelar',
      attrs: { type: 'button' },
    });
    this.element = el('div', { className: 'panel targeting-banner', attrs: { role: 'status' } }, [
      this.text,
      cancel,
    ]);
    this.element.hidden = true;
    this.cancelButton = el('button', {
      className: 'targeting-cancel',
      text: '✕',
      attrs: { type: 'button', 'aria-label': 'Cancelar' },
    });
    this.cancelButton.hidden = true;
    for (const button of [cancel, this.cancelButton])
      button.addEventListener('click', () => this.cancel());
  }

  show(text: string): void {
    this.text.textContent = text.replace(' (Escape cancela)', '');
    this.element.hidden = false;
    this.cancelButton.hidden = false;
    document.documentElement.classList.add('is-targeting');
  }

  hide(): void {
    this.element.hidden = true;
    this.cancelButton.hidden = true;
    document.documentElement.classList.remove('is-targeting');
  }

  /** Cancela lo que se está eligiendo: lo mismo que apretar Escape. */
  private cancel(): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    this.hide();
  }
}
