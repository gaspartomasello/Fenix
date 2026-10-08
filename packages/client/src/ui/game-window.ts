import { el } from './dom';

let topZ = 10;

/**
 * Ventana flotante con barra de título arrastrable y botón para cerrarla.
 * Recuerda su posición en el navegador (si está permitido guardar datos).
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
    this.element.addEventListener('pointerdown', () => this.bringToFront(), {
      signal: this.abort.signal,
    });
    bar.addEventListener('pointerdown', (e) => this.startMove(e), { signal: this.abort.signal });
  }

  setTitle(title: string): void {
    this.title.textContent = title;
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
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

  private startMove(down: PointerEvent): void {
    if ((down.target as HTMLElement).closest('button')) return;
    down.preventDefault();
    const rect = this.element.getBoundingClientRect();
    const offset = { x: down.clientX - rect.left, y: down.clientY - rect.top };
    const move = (e: PointerEvent): void =>
      this.moveTo({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.keepOnScreen();
      savePosition(this.id, { x: this.element.offsetLeft, y: this.element.offsetTop });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  private moveTo({ x, y }: { x: number; y: number }): void {
    this.element.style.left = `${Math.round(x)}px`;
    this.element.style.top = `${Math.round(y)}px`;
  }

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
