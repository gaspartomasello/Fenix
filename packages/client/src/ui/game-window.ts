import { el } from './dom';

// Por encima de los botones de pantalla (joystick, Atacar: 55–60) y debajo de avisos y arrastre.
let topZ = 100;

/** Cuánto de una ventana corrida hacia afuera queda asomado (para volver a agarrarla). */
const PEEK = 48;
/** Cuánto hay que mover el dedo (o el mouse) para que arrastre la ventana y no sea un toque. */
const DRAG_START = 6;

/** Lo que tiene su propio toque: ahí no se arrastra la ventana. */
const INTERACTIVE = 'button, input, select, textarea, a, label, [contenteditable], .item-icon';

/**
 * Ventana flotante con botón para cerrarla (como en UO, el clic derecho
 * sobre la ventana también la cierra). Como en UO, se arrastra desde
 * cualquier lado que no tenga su propio toque (no solo de la barra) y se
 * puede correr fuera de la pantalla dejando un pedazo asomado. Tocarla la
 * trae adelante; su atajo (B, C, Mochila…) la vuelve a traer adelante y
 * entera, y si ya estaba así, la cierra. Recuerda su posición en el
 * navegador (si está permitido guardar datos).
 */
export class GameWindow {
  readonly element: HTMLElement;
  readonly body: HTMLElement;
  private readonly title: HTMLElement;
  private readonly abort = new AbortController();

  constructor(
    private readonly id: string,
    title: string,
    defaultPosition: { x: number; y: number },
  ) {
    const close = el('button', {
      className: 'window-close',
      text: '×',
      attrs: { type: 'button', 'aria-label': `Cerrar ${title}` },
    });
    this.title = el('h2', { className: 'window-title', text: title });
    const bar = el('div', { className: 'window-bar' }, [this.title, close]);
    this.body = el('div', { className: 'window-body' });
    this.element = el(
      'section',
      { className: 'panel game-window', attrs: { 'aria-label': title } },
      [bar, this.body],
    );
    this.element.hidden = true;

    const saved = loadPosition(id);
    // En pantallas chicas las ventanas abren a la izquierda, sin tapar los botones.
    const fallback = window.innerWidth <= 640 ? { x: 8, y: defaultPosition.y } : defaultPosition;
    this.moveTo(saved ?? fallback);

    close.addEventListener('click', () => this.hide(), { signal: this.abort.signal });
    this.element.addEventListener(
      'contextmenu',
      (e) => {
        // Sin menú del navegador y sin que el clic llegue al mundo (ahí mueve al personaje).
        e.preventDefault();
        e.stopPropagation();
        this.hide();
      },
      { signal: this.abort.signal },
    );
    this.element.addEventListener('pointerdown', (e) => this.onPointerDown(e, bar), {
      signal: this.abort.signal,
    });
    // Al girar el celular o achicar la ventana del navegador, que no quede perdida afuera.
    window.addEventListener(
      'resize',
      () => {
        if (this.visible) this.keepPeeking();
      },
      { signal: this.abort.signal },
    );
  }

  setTitle(title: string): void {
    this.title.textContent = title;
    this.element.setAttribute('aria-label', title);
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  /**
   * El atajo de la ventana: si está tapada por otra o corrida afuera, vuelve
   * adelante y entera (como en UO); si ya estaba así, se cierra.
   */
  toggle(): void {
    if (this.visible && this.onTop && this.fullyOnScreen) this.hide();
    else this.show();
  }

  private get onTop(): boolean {
    return this.element.style.zIndex === String(topZ);
  }

  private get fullyOnScreen(): boolean {
    const rect = this.element.getBoundingClientRect();
    return (
      rect.left >= 0 &&
      rect.top >= 0 &&
      rect.right <= window.innerWidth + 1 &&
      rect.bottom <= window.innerHeight + 1
    );
  }

  show(): void {
    this.element.hidden = false;
    this.bringToFront();
    this.keepOnScreen();
  }

  hide(): void {
    this.element.hidden = true;
  }

  destroy(): void {
    this.abort.abort();
    this.element.remove();
  }

  private bringToFront(): void {
    topZ += 1;
    this.element.style.zIndex = String(topZ);
  }

  private onPointerDown(down: PointerEvent, bar: HTMLElement): void {
    this.bringToFront();
    if (down.pointerType === 'mouse' && down.button !== 0) return;
    const target = down.target as HTMLElement;
    // Lo que ya tomó el toque (agarrar un objeto, pintar la grilla) o tiene el suyo propio.
    if (down.defaultPrevented || target.closest(INTERACTIVE)) return;
    if (bar.contains(target)) {
      down.preventDefault();
      this.startMove(down);
      return;
    }
    if (this.scrollsByTouch(target)) return;
    // Desde el cuerpo, recién arrastra cuando se mueve un poco (un toque sigue siendo un toque).
    const pending = (e: PointerEvent): void => {
      if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < DRAG_START) return;
      stop();
      this.startMove(down, e);
    };
    const stop = (): void => {
      window.removeEventListener('pointermove', pending);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', pending);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  /** ¿Ahí el dedo desplaza una lista (por ejemplo, el cuerpo de una ventana alta)? */
  private scrollsByTouch(target: HTMLElement): boolean {
    for (let node: HTMLElement | null = target; node; node = node.parentElement) {
      if (getComputedStyle(node).touchAction.includes('pan')) return true;
      if (node === this.element) break;
    }
    return false;
  }

  private startMove(down: PointerEvent, now: PointerEvent = down): void {
    const rect = this.element.getBoundingClientRect();
    const offset = { x: down.clientX - rect.left, y: down.clientY - rect.top };
    const move = (e: PointerEvent): void => {
      this.moveTo({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      this.keepPeeking();
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      this.keepPeeking();
      savePosition(this.id, { x: this.element.offsetLeft, y: this.element.offsetTop });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    move(now);
  }

  private moveTo({ x, y }: { x: number; y: number }): void {
    this.element.style.left = `${Math.round(x)}px`;
    this.element.style.top = `${Math.round(y)}px`;
  }

  /** Puede quedar corrida afuera, pero siempre con un pedazo asomado. */
  private keepPeeking(): void {
    const rect = this.element.getBoundingClientRect();
    const x = Math.min(Math.max(PEEK - rect.width, rect.left), window.innerWidth - PEEK);
    const y = Math.min(Math.max(0, rect.top), window.innerHeight - PEEK);
    this.moveTo({ x, y });
  }

  /** Entera adentro de la pantalla. */
  private keepOnScreen(): void {
    const rect = this.element.getBoundingClientRect();
    const x = Math.min(Math.max(0, rect.left), Math.max(0, window.innerWidth - rect.width));
    const y = Math.min(Math.max(0, rect.top), Math.max(0, window.innerHeight - rect.height));
    this.moveTo({ x, y });
  }
}

function loadPosition(id: string): { x: number; y: number } | null {
  try {
    const raw = window.localStorage.getItem(`fenix.window.${id}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as { x?: unknown; y?: unknown };
    return typeof value.x === 'number' && typeof value.y === 'number'
      ? { x: value.x, y: value.y }
      : null;
  } catch {
    return null;
  }
}

function savePosition(id: string, position: { x: number; y: number }): void {
  try {
    window.localStorage.setItem(`fenix.window.${id}`, JSON.stringify(position));
  } catch {
    // Sin almacenamiento disponible: la ventana vuelve a su lugar por defecto.
  }
}
