import { el } from './dom';

export interface HudButton {
  readonly label: string;
  /** Tecla que también lo activa (se muestra en el botón). */
  readonly key: string;
  readonly onPress: () => void;
  /** Botón que queda presionado o no (por ejemplo, el modo guerra). */
  readonly pressed?: () => boolean;
}

/** Botones fijos en pantalla (útiles también en el celular). */
export class HudButtons {
  readonly element: HTMLElement;
  private readonly abort = new AbortController();
  private readonly toggles: { node: HTMLButtonElement; pressed: () => boolean }[] = [];

  constructor(buttons: readonly HudButton[]) {
    this.element = el(
      'div',
      { className: 'hud-buttons' },
      buttons.map((button) => {
        const node = el('button', { className: 'hud-button', attrs: { type: 'button' } }, [
          el('span', { text: button.label }),
          el('kbd', { text: keyLabel(button.key) }),
        ]);
        node.addEventListener('click', button.onPress, { signal: this.abort.signal });
        if (button.pressed) this.toggles.push({ node, pressed: button.pressed });
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

  /** Actualiza los botones que quedan presionados. */
  refresh(): void {
    for (const { node, pressed } of this.toggles)
      node.setAttribute('aria-pressed', String(pressed()));
  }

  destroy(): void {
    this.abort.abort();
    this.element.remove();
  }
}

function keyLabel(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
