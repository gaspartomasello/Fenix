import { el } from './dom';
import type { HudButton } from './hud-buttons';

export interface TouchHudOptions {
  /** Atacar a la criatura más cercana (o seguir con la de ahora). */
  readonly attack: () => void;
  /** Pasar a la siguiente criatura más cercana. */
  readonly nextTarget: () => void;
  readonly stopAttack: () => void;
  readonly hasTarget: () => boolean;
  /** Botones siempre a mano arriba a la derecha (mochila, mapa). */
  readonly quick: readonly Omit<HudButton, 'key'>[];
  /** Todo lo demás, en el menú. */
  readonly menu: readonly Omit<HudButton, 'key'>[];
}

/**
 * Controles para jugar con el dedo (celular acostado): el botón grande de
 * atacar al lado del pulgar derecho, unos pocos botones arriba y el resto de
 * las ventanas en un menú que se abre y se cierra. El joystick va aparte
 * (input/joystick.ts) y la barra de atajos es la misma de la computadora.
 */
export class TouchHud {
  readonly actions: HTMLElement;
  readonly top: HTMLElement;
  readonly sheet: HTMLElement;
  readonly rotateHint: HTMLElement;
  private readonly stop: HTMLButtonElement;
  /** Siguiente objetivo y dejar de atacar: solo mientras se pelea. */
  private readonly side: HTMLElement;
  private readonly toggles: { node: HTMLButtonElement; pressed: () => boolean }[] = [];
  private readonly abort = new AbortController();

  constructor(private readonly options: TouchHudOptions) {
    const signal = this.abort.signal;
    const attack = el('button', {
      className: 'touch-attack',
      text: 'Atacar',
      attrs: { type: 'button', 'aria-label': 'Atacar a la criatura más cercana' },
    });
    attack.addEventListener('click', () => options.attack(), { signal });
    this.stop = el('button', {
      className: 'touch-small',
      text: '✕',
      attrs: { type: 'button', 'aria-label': 'Dejar de atacar' },
    });
    this.stop.addEventListener('click', () => options.stopAttack(), { signal });
    const next = el('button', {
      className: 'touch-small',
      text: '⟳',
      attrs: { type: 'button', 'aria-label': 'Atacar a la siguiente criatura' },
    });
    next.addEventListener('click', () => options.nextTarget(), { signal });
    this.side = el('div', { className: 'touch-side' }, [next, this.stop]);
    this.actions = el('div', { className: 'touch-actions' }, [this.side, attack]);

    const menuButton = el('button', {
      className: 'touch-button',
      text: 'Menú',
      attrs: { type: 'button', 'aria-expanded': 'false' },
    });
    this.top = el('div', { className: 'touch-top' }, [
      ...options.quick.map((b) => this.button(b, 'touch-button')),
      menuButton,
    ]);

    this.sheet = el('div', {
      className: 'touch-sheet panel',
      attrs: { role: 'dialog', 'aria-label': 'Menú' },
    });
    this.sheet.hidden = true;
    const close = (): void => {
      this.sheet.hidden = true;
      menuButton.setAttribute('aria-expanded', 'false');
    };
    this.sheet.append(
      el(
        'div',
        { className: 'touch-sheet-grid' },
        options.menu.map((b) => {
          const node = this.button(b, 'touch-sheet-button');
          // Elegir algo del menú lo cierra (salvo lo que queda prendido o apagado).
          if (!b.pressed) node.addEventListener('click', close, { signal });
          return node;
        }),
      ),
    );
    menuButton.addEventListener(
      'click',
      () => {
        this.sheet.hidden = !this.sheet.hidden;
        menuButton.setAttribute('aria-expanded', String(!this.sheet.hidden));
        this.refresh();
      },
      { signal },
    );
    this.sheet.addEventListener(
      'click',
      (e) => {
        if (e.target === this.sheet) close();
      },
      { signal },
    );

    const keepPlaying = el('button', {
      className: 'button',
      text: 'Jugar así igual',
      attrs: { type: 'button' },
    });
    keepPlaying.addEventListener(
      'click',
      () => document.documentElement.classList.add('portrait-ok'),
      { signal },
    );
    this.rotateHint = el('div', { className: 'rotate-hint' }, [
      el('div', { className: 'panel rotate-hint-panel' }, [
        el('div', { className: 'rotate-hint-phone', attrs: { 'aria-hidden': 'true' } }),
        el('h2', { className: 'title title--small', text: 'Girá el celular' }),
        el('p', {
          text: 'Fenix se juega con el celular acostado: el joystick a la izquierda y los botones a la derecha.',
        }),
        keepPlaying,
      ]),
    ]);
    this.refresh();
  }

  /** Actualiza los botones que quedan prendidos y el de dejar de atacar. */
  refresh(): void {
    this.side.hidden = !this.options.hasTarget();
    for (const { node, pressed } of this.toggles)
      node.setAttribute('aria-pressed', String(pressed()));
  }

  destroy(): void {
    this.abort.abort();
    for (const node of [this.actions, this.top, this.sheet, this.rotateHint]) node.remove();
  }

  private button(button: Omit<HudButton, 'key'>, className: string): HTMLButtonElement {
    const node = el('button', { className, text: button.label, attrs: { type: 'button' } });
    node.addEventListener(
      'click',
      () => {
        button.onPress();
        this.refresh();
      },
      { signal: this.abort.signal },
    );
    if (button.pressed) this.toggles.push({ node, pressed: button.pressed });
    return node;
  }
}

/**
 * ¿Se juega con el dedo? Pantallas táctiles sin mouse, o forzado con
 * `?tactil` en la dirección (para probar en la computadora).
 */
export function prefersTouch(): boolean {
  if (new URLSearchParams(window.location.search).has('tactil')) return true;
  return (
    window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches
  );
}

/** Pantalla completa y, si el navegador deja, trabada acostada. */
export async function enterFullscreen(): Promise<void> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    await orientation.lock?.('landscape');
  } catch {
    // Algunos navegadores (iPhone) no dejan: se sigue jugando igual.
  }
}
