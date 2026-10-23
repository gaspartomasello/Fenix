import type { EquipmentSlot } from '@fenix/shared';
import { el } from './dom';

/** Dónde se soltó lo que se estaba arrastrando. */
export type DropTarget =
  | { readonly kind: 'backpack'; readonly position: { x: number; y: number } }
  | { readonly kind: 'bank'; readonly position: { x: number; y: number } }
  /** Adentro de un recipiente; sin `position` (soltado sobre la bolsa misma), donde haya lugar. */
  | {
      readonly kind: 'container';
      readonly containerId: string;
      readonly position?: { x: number; y: number };
    }
  | { readonly kind: 'slot'; readonly slot: EquipmentSlot }
  /** El personaje en la ventana de equipo: el objeto va a su lugar del cuerpo. */
  | { readonly kind: 'paperdoll' }
  | { readonly kind: 'world'; readonly clientX: number; readonly clientY: number };

export interface DragSource {
  readonly id: string;
  readonly iconUrl: string;
  /** Devuelve false si no va ahí (el objeto vuelve a su lugar al instante). */
  readonly onDrop: (target: DropTarget) => boolean;
  readonly onDoubleTap: () => void;
  /**
   * Levanta el objeto de donde está (lo esconde) al empezar a arrastrarlo y
   * devuelve cómo volver a mostrarlo si se suelta donde no va.
   */
  readonly lift?: () => () => void;
}

/** Cuánto se espera la respuesta del servidor antes de volver a mostrar lo soltado. */
const SETTLE_MS = 700;

/** Levantar un ícono del DOM: queda su lugar vacío mientras se arrastra. */
export function liftElement(element: HTMLElement): () => () => void {
  return () => {
    element.style.visibility = 'hidden';
    return () => {
      element.style.visibility = '';
    };
  };
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
  /** Modo "elegí un objeto": el próximo toque devuelve el objeto en vez de usarlo. */
  private picking: { onPick: (id: string) => void; onCancel: () => void } | null = null;
  private readonly abort = new AbortController();

  constructor(host: HTMLElement) {
    this.ghost = el('img', { className: 'drag-ghost', attrs: { alt: '', 'aria-hidden': 'true' } });
    this.ghost.hidden = true;
    host.append(this.ghost);
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && this.picking) {
          e.stopImmediatePropagation();
          this.cancelPick();
        }
      },
      { signal: this.abort.signal, capture: true },
    );
  }

  get isPicking(): boolean {
    return this.picking !== null;
  }

  /** El próximo toque sobre un objeto (mochila, bolsa, equipo) lo elige. Escape cancela. */
  pickItem(onPick: (id: string) => void, onCancel: () => void): void {
    this.cancelPick();
    this.picking = { onPick, onCancel };
  }

  cancelPick(): void {
    const picking = this.picking;
    this.picking = null;
    picking?.onCancel();
  }

  /** Empieza a seguir un puntero apretado sobre un objeto. */
  begin(source: DragSource, down: PointerEvent): void {
    const start = { x: down.clientX, y: down.clientY };
    let dragging = false;
    let restore: (() => void) | null = null;
    /** La bolsa que se ilumina al pasar por encima con algo (se suelta adentro). */
    let hovered: HTMLElement | null = null;
    const hover = (bag: HTMLElement | null): void => {
      if (bag === hovered) return;
      hovered?.classList.remove('item-icon--drop');
      bag?.classList.add('item-icon--drop');
      hovered = bag;
    };

    const move = (e: PointerEvent): void => {
      if (e.pointerId !== down.pointerId) return;
      if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_THRESHOLD_PX) {
        dragging = true;
        this.ghost.src = source.iconUrl;
        this.ghost.hidden = false;
        // Se levanta en el momento: no queda un duplicado donde estaba.
        restore = source.lift?.() ?? null;
      }
      if (dragging) {
        this.placeGhost(e);
        const bag = bagAt(e.clientX, e.clientY);
        hover(bag && bag.dataset.bag !== source.id ? bag : null);
      }
    };
    const up = (e: PointerEvent): void => {
      if (e.pointerId !== down.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      this.ghost.hidden = true;
      hover(null);
      if (dragging) {
        const target = resolveTarget(e.clientX, e.clientY, source.id);
        const accepted = target !== null && source.onDrop(target);
        // Si no va ahí, vuelve en el momento; si el servidor no lo acepta, enseguida.
        if (!accepted) restore?.();
        else if (restore) window.setTimeout(restore, SETTLE_MS);
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
      hover(null);
      restore?.();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }

  destroy(): void {
    this.abort.abort();
    this.ghost.remove();
  }

  private placeGhost(e: PointerEvent): void {
    this.ghost.style.transform = `translate(${e.clientX - ICON_HALF}px, ${e.clientY - ICON_HALF}px)`;
  }

  private registerTap(source: DragSource): void {
    if (this.picking) {
      const { onPick } = this.picking;
      this.picking = null;
      this.lastTap = null;
      onPick(source.id);
      return;
    }
    const now = performance.now();
    if (this.lastTap && this.lastTap.id === source.id && now - this.lastTap.at < DOUBLE_TAP_MS) {
      this.lastTap = null;
      source.onDoubleTap();
      return;
    }
    this.lastTap = { id: source.id, at: now };
  }
}

/** La bolsa (un ícono con `data-bag`) bajo el puntero, si hay. */
function bagAt(clientX: number, clientY: number): HTMLElement | null {
  return document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-bag]') ?? null;
}

/**
 * Busca el destino bajo el puntero mediante atributos `data-drop`. Soltar
 * sobre una bolsa (no sobre sí misma) la guarda adentro, como en UO.
 */
function resolveTarget(clientX: number, clientY: number, dragged: string): DropTarget | null {
  const bag = bagAt(clientX, clientY)?.dataset.bag;
  if (bag && bag !== dragged) return { kind: 'container', containerId: bag };
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
    case 'container': {
      const rect = zone.getBoundingClientRect();
      const containerId = zone.dataset.container;
      return containerId
        ? {
            kind: 'container',
            containerId,
            position: {
              x: Math.round(clientX - rect.left - ICON_HALF),
              y: Math.round(clientY - rect.top - ICON_HALF),
            },
          }
        : null;
    }
    case 'slot':
      return zone.dataset.slot ? { kind: 'slot', slot: zone.dataset.slot as EquipmentSlot } : null;
    case 'world':
      return { kind: 'world', clientX, clientY };
    case 'paperdoll':
      return { kind: 'paperdoll' };
    default:
      return null;
  }
}
