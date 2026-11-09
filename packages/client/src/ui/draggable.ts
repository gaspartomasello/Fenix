/** Cuánto hay que mover el dedo para que sea arrastrar y no tocar. */
const DRAG_THRESHOLD = 8;

export interface Draggable {
  /** El último toque fue para arrastrar (y no para tocar): se pregunta una vez y se olvida. */
  consumeDrag(): boolean;
  /** Lo vuelve a su lugar de siempre (el de la hoja de estilos) y olvida el guardado. */
  reset(): void;
  destroy(): void;
}

/**
 * Hace que un elemento de la pantalla (el minimapa, la barra de reactivos…)
 * se pueda llevar a cualquier lado con el dedo o el mouse, agarrándolo de
 * `handle`. Queda donde se suelta, sin salirse de la pantalla, y lo recuerda
 * en fracciones de la pantalla (así sirve al girar el celular). Mientras está
 * en un lugar elegido lleva la clase `placedClass`.
 */
export function makeDraggable(
  element: HTMLElement,
  storageKey: string,
  options: {
    readonly handle?: HTMLElement;
    readonly placedClass?: string;
    /** Se llama cuando cambia de lugar (al soltarlo o al volverlo a su lugar). */
    readonly onChange?: () => void;
  } = {},
): Draggable {
  const abort = new AbortController();
  const signal = abort.signal;
  const handle = options.handle ?? element;
  let dragged = false;

  const place = (left: number, top: number): void => {
    const width = element.offsetWidth || 120;
    const height = element.offsetHeight || 40;
    const x = Math.max(0, Math.min(window.innerWidth - width, left));
    const y = Math.max(0, Math.min(window.innerHeight - height, top));
    Object.assign(element.style, {
      left: `${Math.round(x)}px`,
      top: `${Math.round(y)}px`,
      right: 'auto',
      bottom: 'auto',
    });
    if (options.placedClass) element.classList.add(options.placedClass);
    options.onChange?.();
  };

  const save = (): void => {
    const rect = element.getBoundingClientRect();
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ x: rect.left / window.innerWidth, y: rect.top / window.innerHeight }),
      );
    } catch {
      // Sin almacenamiento (ventana privada): queda ahí hasta recargar.
    }
  };

  const restore = (): void => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as {
        x?: unknown;
        y?: unknown;
      } | null;
      if (typeof saved?.x !== 'number' || typeof saved.y !== 'number') return;
      place(saved.x * window.innerWidth, saved.y * window.innerHeight);
    } catch {
      // Lo guardado no sirve: queda en su lugar de siempre.
    }
  };

  handle.addEventListener(
    'pointerdown',
    (down) => {
      if (down.button !== 0) return;
      down.stopPropagation();
      const start = element.getBoundingClientRect();
      dragged = false;
      const move = (e: PointerEvent): void => {
        const dx = e.clientX - down.clientX;
        const dy = e.clientY - down.clientY;
        if (!dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragged = true;
        element.classList.add('dragging');
        place(start.left + dx, start.top + dy);
      };
      const up = (): void => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        element.classList.remove('dragging');
        if (dragged) save();
      };
      window.addEventListener('pointermove', move, { signal });
      window.addEventListener('pointerup', up, { signal });
      window.addEventListener('pointercancel', up, { signal });
    },
    { signal },
  );
  window.addEventListener('resize', restore, { signal });
  requestAnimationFrame(restore);

  return {
    consumeDrag: () => {
      const was = dragged;
      dragged = false;
      return was;
    },
    reset: () => {
      for (const side of ['left', 'top', 'right', 'bottom'] as const) element.style[side] = '';
      if (options.placedClass) element.classList.remove(options.placedClass);
      options.onChange?.();
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Nada que olvidar.
      }
    },
    destroy: () => abort.abort(),
  };
}
