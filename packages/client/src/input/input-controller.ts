import type { ScreenPoint } from '../rendering/iso';
import { keysToIntent, pointerToIntent, type MovementIntent } from './movement-intent';

const MOVEMENT_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
]);

export interface InputControllerOptions {
  /** Elemento donde se escucha el mouse (el canvas del juego). */
  readonly surface: HTMLElement;
  /** Posición en pantalla del personaje propio. */
  readonly selfScreenPosition: () => ScreenPoint;
  readonly onZoom: (delta: 1 | -1) => void;
  /** Si devuelve false, tocar ese punto no mueve al personaje (por ejemplo, hay un objeto). */
  readonly canSteerFrom?: (point: ScreenPoint) => boolean;
}

/**
 * Traduce teclado, mouse y toques a intenciones de movimiento. Ignora el teclado
 * mientras se escribe en un campo de texto (por ejemplo, el chat).
 */
export class InputController {
  private readonly keys = new Set<string>();
  private shift = false;
  private pointer: ScreenPoint | null = null;
  /** Clic derecho sostenido (mouse) o dedo apoyado (pantallas táctiles). */
  private steering = false;
  private readonly abort = new AbortController();

  constructor(private readonly options: InputControllerOptions) {
    const signal = this.abort.signal;
    const { surface } = options;

    window.addEventListener('keydown', (e) => this.onKey(e, true), { signal });
    window.addEventListener('keyup', (e) => this.onKey(e, false), { signal });
    window.addEventListener('blur', () => this.reset(), { signal });

    surface.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    surface.addEventListener(
      'pointerdown',
      (e) => {
        if (!isSteeringPointer(e)) return;
        const point = this.localPoint(e);
        if (e.pointerType !== 'mouse' && options.canSteerFrom?.(point) === false) return;
        e.preventDefault();
        this.steering = true;
        this.pointer = point;
        surface.setPointerCapture(e.pointerId);
      },
      { signal },
    );
    surface.addEventListener('pointermove', (e) => (this.pointer = this.localPoint(e)), { signal });
    surface.addEventListener(
      'pointerup',
      (e) => {
        if (isSteeringPointer(e)) this.steering = false;
      },
      { signal },
    );
    surface.addEventListener('pointercancel', () => (this.steering = false), { signal });
    surface.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        options.onZoom(e.deltaY < 0 ? 1 : -1);
      },
      { signal, passive: false },
    );
  }

  /** Intención de movimiento actual; el mouse tiene prioridad sobre el teclado. */
  movementIntent(): MovementIntent | null {
    if (this.steering && this.pointer) {
      const self = this.options.selfScreenPosition();
      return pointerToIntent(this.pointer.x - self.x, this.pointer.y - self.y);
    }
    return keysToIntent(this.keys, this.shift);
  }

  destroy(): void {
    this.abort.abort();
  }

  private onKey(event: KeyboardEvent, pressed: boolean): void {
    this.shift = event.shiftKey;
    if (pressed && isTyping(event.target)) return;
    if (!MOVEMENT_KEYS.has(event.code)) return;
    event.preventDefault();
    if (pressed) this.keys.add(event.code);
    else this.keys.delete(event.code);
  }

  private reset(): void {
    this.keys.clear();
    this.steering = false;
  }

  private localPoint(event: PointerEvent): ScreenPoint {
    const rect = this.options.surface.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
}

/** Con mouse se camina con el botón derecho; con dedo o lápiz, tocando. */
function isSteeringPointer(event: PointerEvent): boolean {
  return event.pointerType === 'mouse' ? event.button === 2 : event.isPrimary;
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
