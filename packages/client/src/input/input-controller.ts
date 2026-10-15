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
  /** Otra fuente de movimiento con prioridad (el joystick del celular). */
  readonly extraIntent?: () => MovementIntent | null;
}

/** Cuánto hay que abrir o cerrar los dedos para acercar o alejar un paso. */
const PINCH_STEP_PX = 60;

/**
 * Traduce teclado, mouse, toques y el joystick a intenciones de movimiento.
 * Con dos dedos se acerca o aleja la vista. Ignora el teclado mientras se
 * escribe en un campo de texto (por ejemplo, el chat).
 */
export class InputController {
  private readonly keys = new Set<string>();
  private shift = false;
  private pointer: ScreenPoint | null = null;
  /** Clic derecho sostenido (mouse) o dedo apoyado (pantallas táctiles). */
  private steering = false;
  /** Dedos apoyados en el mundo (para acercar o alejar pellizcando). */
  private readonly touches = new Map<number, ScreenPoint>();
  private pinchFrom: number | null = null;
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
        if (e.pointerType === 'touch') {
          this.touches.set(e.pointerId, this.localPoint(e));
          if (this.touches.size === 2) {
            // Dos dedos: se pellizca para acercar o alejar, no se camina.
            this.steering = false;
            this.pinchFrom = this.pinchDistance();
            return;
          }
        }
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
    surface.addEventListener(
      'pointermove',
      (e) => {
        const point = this.localPoint(e);
        if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, point);
        if (this.pinchFrom !== null && this.touches.size === 2) {
          const distance = this.pinchDistance();
          if (Math.abs(distance - this.pinchFrom) >= PINCH_STEP_PX) {
            options.onZoom(distance > this.pinchFrom ? 1 : -1);
            this.pinchFrom = distance;
          }
          return;
        }
        this.pointer = point;
      },
      { signal },
    );
    const lift = (e: PointerEvent): void => {
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinchFrom = null;
    };
    surface.addEventListener(
      'pointerup',
      (e) => {
        lift(e);
        if (isSteeringPointer(e)) this.steering = false;
      },
      { signal },
    );
    surface.addEventListener(
      'pointercancel',
      (e) => {
        lift(e);
        this.steering = false;
      },
      { signal },
    );
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
    const extra = this.options.extraIntent?.();
    if (extra) return extra;
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

  private pinchDistance(): number {
    const [a, b] = [...this.touches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
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
