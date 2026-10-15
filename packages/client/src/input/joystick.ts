import { screenVectorToDirection } from '../rendering/iso';
import type { MovementIntent } from './movement-intent';

/** Radio del recorrido de la perilla, en pixeles CSS. */
const RADIUS = 52;
/** Poco movimiento no cuenta (el dedo tiembla). */
const DEAD_ZONE = 0.22;
/** Más allá de esta fracción del recorrido se corre. */
const RUN_FROM = 0.78;

/**
 * Joystick para el pulgar izquierdo (pantallas táctiles), como en los
 * juegos de celular: apoyar el dedo en la base y arrastrar hacia donde se
 * quiere ir; llevándolo al borde se corre. Arriba en el joystick es arriba
 * en la pantalla, igual que con las flechas.
 */
export class Joystick {
  readonly element: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly abort = new AbortController();
  private pointerId: number | null = null;
  private vector: { x: number; y: number } | null = null;

  constructor() {
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    const base = document.createElement('div');
    base.className = 'joystick-base';
    base.append(this.knob);
    this.element = document.createElement('div');
    this.element.className = 'joystick';
    this.element.setAttribute('role', 'application');
    this.element.setAttribute('aria-label', 'Joystick para caminar');
    this.element.append(base);

    const signal = this.abort.signal;
    this.element.addEventListener(
      'pointerdown',
      (e) => {
        if (this.pointerId !== null) return;
        e.preventDefault();
        this.pointerId = e.pointerId;
        this.element.setPointerCapture(e.pointerId);
        this.track(e);
      },
      { signal },
    );
    this.element.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerId === this.pointerId) this.track(e);
      },
      { signal },
    );
    const release = (e: PointerEvent): void => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.vector = null;
      this.knob.style.transform = '';
      this.element.classList.remove('joystick--active');
    };
    this.element.addEventListener('pointerup', release, { signal });
    this.element.addEventListener('pointercancel', release, { signal });
  }

  /** Hacia dónde quiere ir el jugador con el joystick (null: suelto). */
  intent(): MovementIntent | null {
    return joystickIntent(this.vector);
  }

  destroy(): void {
    this.abort.abort();
    this.element.remove();
  }

  private track(e: PointerEvent): void {
    const rect = this.knob.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = (e.clientX - cx) / RADIUS;
    let dy = (e.clientY - cy) / RADIUS;
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    this.vector = { x: dx, y: dy };
    this.knob.style.transform = `translate(${dx * RADIUS}px, ${dy * RADIUS}px)`;
    this.element.classList.add('joystick--active');
  }
}

/** Posición de la perilla (−1 a 1 en cada eje) → intención de movimiento. */
export function joystickIntent(vector: { x: number; y: number } | null): MovementIntent | null {
  if (!vector) return null;
  const strength = Math.hypot(vector.x, vector.y);
  if (strength < DEAD_ZONE) return null;
  const direction = screenVectorToDirection(vector.x, vector.y);
  if (direction === null) return null;
  return { direction, mode: strength >= RUN_FROM ? 'run' : 'walk' };
}
