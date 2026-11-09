import type { ClientGame } from '../core/client-game';
import { el } from './dom';
import { mapPicture } from './map-picture';

/** Lado del minimapa en pantalla (pixeles CSS). */
const SIZE = 196;
/** Acercamientos posibles: pixeles por tile. */
const ZOOMS = [1.2, 2, 3.2] as const;
const STORAGE_KEY = 'fenix.minimapa';
/** Dónde lo dejó el jugador, en fracciones de la pantalla (sirve si gira el celular). */
const PLACE_KEY = 'fenix.minimapa.lugar';
/** Cuánto hay que mover el dedo para que sea arrastrar y no tocar. */
const DRAG_THRESHOLD = 8;

/**
 * Minimapa: el mundo visto desde arriba, girado como la vista isométrica
 * (arriba en el minimapa es arriba en la pantalla), centrado en uno mismo.
 * Muestra a la gente cerca y los nombres de pueblos y lugares. La tecla M (o
 * su botón) pasa del minimapa al mapa del mundo y después lo cierra; el clic
 * derecho lo cierra y la rueda acerca o aleja. Es redondo y se arrastra a
 * cualquier lugar de la pantalla (recuerda dónde quedó).
 */
export class Minimap {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private zoom = 1;
  private timer: number | null = null;
  /** El último toque fue para arrastrarlo (no para acercar). */
  private dragged = false;
  private readonly abort = new AbortController();

  constructor(
    private readonly game: ClientGame,
    /** Se llama al abrirse o cerrarse (para el botón que queda presionado). */
    private readonly onToggle: () => void = () => undefined,
  ) {
    this.canvas = el('canvas', { className: 'minimap-canvas' }) as HTMLCanvasElement;
    const ratio = Math.max(1, Math.ceil(window.devicePixelRatio || 1));
    this.canvas.width = SIZE * ratio;
    this.canvas.height = SIZE * ratio;
    this.element = el(
      'div',
      {
        className: 'minimap',
        attrs: {
          role: 'img',
          'aria-label': 'Minimapa',
          title: 'Tocalo para acercar o alejar; arrastralo para moverlo.',
        },
      },
      [this.canvas],
    );
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom = Math.max(0, Math.min(ZOOMS.length - 1, this.zoom + (e.deltaY < 0 ? 1 : -1)));
        this.draw();
      },
      { passive: false },
    );
    // Tocar el minimapa cambia el acercamiento (en el celular no hay rueda).
    this.canvas.addEventListener('click', () => {
      if (this.dragged) {
        this.dragged = false;
        return;
      }
      this.zoom = (this.zoom + 1) % ZOOMS.length;
      this.draw();
    });
    // Como las ventanas: el clic derecho lo cierra.
    this.element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setOpen(false);
      this.onToggle();
    });
    this.setOpen(readOpen());
    this.enableDrag();
    requestAnimationFrame(() => this.restorePlace());
    window.addEventListener('resize', () => this.restorePlace(), { signal: this.abort.signal });
  }

  get open(): boolean {
    return !this.element.hidden;
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  /** Abre o cierra (lo recuerda para la próxima vez). */
  show(open: boolean): void {
    this.setOpen(open);
  }

  destroy(): void {
    this.abort.abort();
    if (this.timer !== null) window.clearInterval(this.timer);
    this.element.remove();
  }

  /** Arrastrar con el dedo o el mouse: se mueve con él y queda donde se suelta. */
  private enableDrag(): void {
    const signal = this.abort.signal;
    this.element.addEventListener(
      'pointerdown',
      (down) => {
        if (down.button !== 0) return;
        down.stopPropagation();
        const start = this.element.getBoundingClientRect();
        this.dragged = false;
        const move = (e: PointerEvent): void => {
          const dx = e.clientX - down.clientX;
          const dy = e.clientY - down.clientY;
          if (!this.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
          this.dragged = true;
          this.element.classList.add('minimap--dragging');
          this.place(start.left + dx, start.top + dy);
        };
        const up = (): void => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          this.element.classList.remove('minimap--dragging');
          if (this.dragged) this.savePlace();
        };
        window.addEventListener('pointermove', move, { signal });
        window.addEventListener('pointerup', up, { signal });
        window.addEventListener('pointercancel', up, { signal });
      },
      { signal },
    );
  }

  /** Lo pone con la esquina de arriba a la izquierda en (left, top), sin salirse de la pantalla. */
  private place(left: number, top: number): void {
    const width = this.element.offsetWidth || 120;
    const height = this.element.offsetHeight || 120;
    const x = Math.max(0, Math.min(window.innerWidth - width, left));
    const y = Math.max(0, Math.min(window.innerHeight - height, top));
    Object.assign(this.element.style, {
      left: `${Math.round(x)}px`,
      top: `${Math.round(y)}px`,
      right: 'auto',
      bottom: 'auto',
    });
  }

  private savePlace(): void {
    const rect = this.element.getBoundingClientRect();
    try {
      localStorage.setItem(
        PLACE_KEY,
        JSON.stringify({ x: rect.left / window.innerWidth, y: rect.top / window.innerHeight }),
      );
    } catch {
      // Sin almacenamiento: queda ahí hasta recargar.
    }
  }

  private restorePlace(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(PLACE_KEY) ?? 'null') as {
        x?: unknown;
        y?: unknown;
      } | null;
      if (typeof saved?.x !== 'number' || typeof saved.y !== 'number') return;
      this.place(saved.x * window.innerWidth, saved.y * window.innerHeight);
    } catch {
      // Lo guardado no sirve: queda en su lugar de siempre.
    }
  }

  private setOpen(open: boolean): void {
    this.element.hidden = !open;
    try {
      localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
    } catch {
      // Sin almacenamiento (ventana privada): igual funciona.
    }
    if (open && this.timer === null) {
      this.timer = window.setInterval(() => this.draw(), 250);
      this.draw();
    } else if (!open && this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private draw(): void {
    const map = this.game.map;
    const self = this.game.self;
    const ctx = this.canvas.getContext('2d');
    if (!map || !self || !ctx) return;
    const ratio = this.canvas.width / SIZE;
    const k = (ZOOMS[this.zoom] ?? 2) / Math.SQRT2;
    const center = this.game.selfSeenAt() ?? self.position;
    // De tile a pantalla del minimapa: girado 45°, como la vista del juego.
    const project = (x: number, y: number): [number, number] => [
      SIZE / 2 + (x - center.x - (y - center.y)) * k,
      SIZE / 2 + (x - center.x + (y - center.y)) * k,
    ];
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#10202c';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const [ox, oy] = project(0, 0);
    ctx.setTransform(k * ratio, k * ratio, -k * ratio, k * ratio, ox * ratio, oy * ratio);
    ctx.drawImage(mapPicture(map), 0, 0);
    ctx.restore();

    // Gente cerca: criaturas en rojo, gente del pueblo en amarillo, jugadores en celeste.
    for (const entity of this.game.allEntities()) {
      if (entity.id === self.id || entity.dead) continue;
      const [x, y] = project(entity.position.x, entity.position.y);
      if (x < 0 || y < 0 || x > SIZE || y > SIZE) continue;
      ctx.fillStyle = entity.npc ? '#ffd84a' : entity.isPlayer ? '#6fc8ff' : '#e5484d';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Nombres de pueblos y lugares.
    ctx.font = '600 10px Georgia, serif';
    ctx.textAlign = 'center';
    for (const region of map.regions) {
      // Los pisos altos se ven encima de su edificio, no con su nombre aparte.
      if (region.floor) continue;
      if (region.dungeon) continue;
      const [x, y] = project(region.x + region.width / 2, region.y + region.height / 2);
      if (x < 10 || y < 8 || x > SIZE - 10 || y > SIZE - 4) continue;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.strokeText(region.name, x, y);
      ctx.fillStyle = region.wild ? '#f2d9a6' : '#ffffff';
      ctx.fillText(region.name, x, y);
    }
    // Uno mismo, en el centro.
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function readOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}
