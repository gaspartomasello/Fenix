import { el } from './dom';

export interface HudButton {
  readonly label: string;
  /** Tecla que también lo activa (se muestra en el botón). */
  readonly key: string;
  readonly onPress: () => void;
}

/** Botones fijos en pantalla (útiles también en el celular). */
export class HudButtons {
  readonly element: HTMLElement;
  private readonly abort = new AbortController();

  constructor(buttons: readonly HudButton[]) {
    this.element = el(
      'div',
      { className: 'hud-buttons' },
      buttons.map((button) => {
        const node = el('button', { className: 'hud-button', attrs: { type: 'button' } }, [
          el('span', { text: button.label }),
          el('kbd', { text: button.key.toUpperCase() }),
        ]);
        node.addEventListener('click', button.onPress, { signal: this.abort.signal });
        return node;
      }),
    );
    window.addEventListener(
      'keydown',
      (e) => {
        if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
        const match = buttons.find((b) => b.key.toLowerCase() === e.key.toLowerCase());
        if (match) {
          e.preventDefault();
          match.onPress();
        }
      },
      { signal: this.abort.signal },
    );
  }

  destroy(): void {
    this.abort.abort();
    this.element.remove();
  }
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
