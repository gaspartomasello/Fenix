import type { EquipmentSlot } from '@fenix/shared';
import { el } from './dom';

/** Dónde se soltó lo que se estaba arrastrando. */
export type DropTarget =
  | { readonly kind: 'backpack'; readonly position: { x: number; y: number } }
  | { readonly kind: 'bank'; readonly position: { x: number; y: number } }
  | { readonly kind: 'slot'; readonly slot: EquipmentSlot }
  | { readonly kind: 'world'; readonly clientX: number; readonly clientY: number };

export interface DragSource {
  readonly id: string;
  readonly iconUrl: string;
  readonly onDrop: (target: DropTarget) => void;
  readonly onDoubleTap: () => void;
}

const DRAG_THRESHOLD_PX = 5;
const DOUBLE_TAP_MS = 450;
const ICON_HALF = 22;

/**
 * Arrastrar y soltar con mouse o dedo, sin la API de drag-and-drop del
 * navegador (que no funciona en pantallas táctiles). Un toque sin arrastrar
 * cuenta para el doble toque, que equivale al doble clic.
 */
export class DragController {
  private readonly ghost: HTMLImageElement;
  private lastTap: { id: string; at: number } | null = null;

  constructor(host: HTMLElement) {
    this.ghost = el('img', { className: 'drag-ghost', attrs: { alt: '', 'aria-hidden': 'true' } });
    this.ghost.hidden = true;
    host.append(this.ghost);
  }

  /** Empieza a seguir un puntero apretado sobre un objeto. */
  begin(source: DragSource, down: PointerEvent): void {
    const start = { x: down.clientX, y: down.clientY };
    let dragging = false;

    const move = (e: PointerEvent): void => {
      if (e.pointerId !== down.pointerId) return;
      if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_THRESHOLD_PX) {
        dragging = true;
        this.ghost.src = source.iconUrl;
        this.ghost.hidden = false;
      }
      if (dragging) this.placeGhost(e);
    };
    const up = (e: PointerEvent): void => {
      if (e.pointerId !== down.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      this.ghost.hidden = true;
      if (dragging) {
        const target = resolveTarget(e.clientX, e.clientY);
        if (target) source.onDrop(target);
      } else {
        this.registerTap(source);
      }
    };
    const cancel = (e: PointerEvent): void => {
      if (e.pointerId !== down.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      this.ghost.hidden = true;
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }

  destroy(): void {
    this.ghost.remove();
  }

  private placeGhost(e: PointerEvent): void {
    this.ghost.style.transform = `translate(${e.clientX - ICON_HALF}px, ${e.clientY - ICON_HALF}px)`;
  }

  private registerTap(source: DragSource): void {
    const now = performance.now();
    if (this.lastTap && this.lastTap.id === source.id && now - this.lastTap.at < DOUBLE_TAP_MS) {
      this.lastTap = null;
      source.onDoubleTap();
      return;
    }
    this.lastTap = { id: source.id, at: now };
  }
}

/** Busca el destino bajo el puntero mediante atributos `data-drop`. */
function resolveTarget(clientX: number, clientY: number): DropTarget | null {
  const element = document.elementFromPoint(clientX, clientY);
  const zone = element?.closest<HTMLElement>('[data-drop]');
  if (!zone) return null;
  switch (zone.dataset.drop) {
    case 'backpack':
    case 'bank': {
      const rect = zone.getBoundingClientRect();
      return {
        kind: zone.dataset.drop,
        position: {
          x: Math.round(clientX - rect.left - ICON_HALF),
          y: Math.round(clientY - rect.top - ICON_HALF),
        },
      };
    }
    case 'slot':
      return zone.dataset.slot ? { kind: 'slot', slot: zone.dataset.slot as EquipmentSlot } : null;
    case 'world':
      return { kind: 'world', clientX, clientY };
    default:
      return null;
  }
}
