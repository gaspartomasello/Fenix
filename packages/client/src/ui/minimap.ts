import type { ClientGame } from '../core/client-game';
import type { TileMap } from '@fenix/shared/world/tile-map';
import { mapLabels, type MapLabel } from '../core/map-labels';
import { el } from './dom';
import { makeDraggable, type Draggable } from './draggable';
import { mapPicture } from './map-picture';

/** Lado del minimapa en pantalla (pixeles CSS); agrandado con doble clic. */
const SIZE = 196;
const BIG_SIZE = 300;
/** Dos toques en menos de esto (milisegundos) agrandan o achican el minimapa. */
const DOUBLE_TAP_MS = 320;
const BIG_KEY = 'fenix.minimapa.grande';
/** Acercamientos posibles: pixeles por tile. */
const ZOOMS = [1.2, 2, 3.2] as const;
const STORAGE_KEY = 'fenix.minimapa';
/** Dónde lo dejó el jugador (ver `makeDraggable`). */
const PLACE_KEY = 'fenix.minimapa.lugar';

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
  private big = readFlag(BIG_KEY);
  /** El toque que espera a ver si viene otro (doble toque) antes de cambiar el acercamiento. */
  private pendingTap: number | null = null;
  private readonly drag: Draggable;

  constructor(
    private readonly game: ClientGame,
    /** Se llama al abrirse o cerrarse (para el botón que queda presionado). */
    private readonly onToggle: () => void = () => undefined,
    /** Los nombres a dibujar (los descubiertos, de las categorías elegidas). */
    private readonly labels: (map: TileMap) => readonly MapLabel[] = mapLabels,
  ) {
    this.canvas = el('canvas', { className: 'minimap-canvas' }) as HTMLCanvasElement;
    this.element = el(
      'div',
      {
        className: 'minimap',
        attrs: {
          role: 'img',
          'aria-label': 'Minimapa',
          title:
            'Tocalo para acercar o alejar; dos veces seguidas para agrandarlo o achicarlo; arrastralo para moverlo.',
        },
      },
      [
        this.canvas,
        // Puntos cardinales en el aro. El minimapa está girado como la vista del
        // juego: el norte (y que baja) queda arriba a la derecha, el este abajo a
        // la derecha, el sur abajo a la izquierda y el oeste arriba a la izquierda.
        ...(['N', 'E', 'S', 'O'] as const).map((letter) =>
          el('span', {
            className: 'minimap-cardinal',
            text: letter,
            attrs: { 'data-dir': letter, 'aria-hidden': 'true' },
          }),
        ),
      ],
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
    // Tocar el minimapa cambia el acercamiento (en el celular no hay rueda);
    // dos toques seguidos lo agrandan o lo achican, como en los juegos de antes.
    this.canvas.addEventListener('click', () => {
      if (this.drag.consumeDrag()) return;
      if (this.pendingTap !== null) {
        window.clearTimeout(this.pendingTap);
        this.pendingTap = null;
        this.setBig(!this.big);
        return;
      }
      this.pendingTap = window.setTimeout(() => {
        this.pendingTap = null;
        this.zoom = (this.zoom + 1) % ZOOMS.length;
        this.draw();
      }, DOUBLE_TAP_MS);
    });
    this.setBig(this.big);
    // Como las ventanas: el clic derecho lo cierra.
    this.element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setOpen(false);
      this.onToggle();
    });
    this.setOpen(readOpen());
    this.drag = makeDraggable(this.element, PLACE_KEY);
  }

  /** Agranda o achica el círculo (lo recuerda para la próxima vez). */
  private setBig(big: boolean): void {
    this.big = big;
    this.element.classList.toggle('minimap--big', big);
    const ratio = Math.max(1, Math.ceil(window.devicePixelRatio || 1));
    this.canvas.width = this.size * ratio;
    this.canvas.height = this.size * ratio;
    try {
      localStorage.setItem(BIG_KEY, big ? '1' : '0');
    } catch {
      // Sin almacenamiento: igual funciona.
    }
    this.draw();
  }

  private get size(): number {
    return this.big ? BIG_SIZE : SIZE;
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
    this.drag.destroy();
    if (this.timer !== null) window.clearInterval(this.timer);
    if (this.pendingTap !== null) window.clearTimeout(this.pendingTap);
    this.element.remove();
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
    const size = this.size;
    const ratio = this.canvas.width / size;
    const k = (ZOOMS[this.zoom] ?? 2) / Math.SQRT2;
    const center = this.game.selfSeenAt() ?? self.position;
    // De tile a pantalla del minimapa: girado 45°, como la vista del juego.
    const project = (x: number, y: number): [number, number] => [
      size / 2 + (x - center.x - (y - center.y)) * k,
      size / 2 + (x - center.x + (y - center.y)) * k,
    ];
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#10202c';
    ctx.fillRect(0, 0, size, size);
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
      if (x < 0 || y < 0 || x > size || y > size) continue;
      ctx.fillStyle = entity.npc ? '#ffd84a' : entity.isPlayer ? '#6fc8ff' : '#e5484d';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Nombres de pueblos y lugares.
    ctx.font = '600 10px Georgia, serif';
    ctx.textAlign = 'center';
    for (const label of this.labels(map)) {
      const [x, y] = project(label.at.x, label.at.y);
      if (x < 10 || y < 8 || x > size - 10 || y > size - 4) continue;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.strokeText(label.name, x, y);
      ctx.fillStyle = label.unsafe
        ? '#ffc4a3'
        : label.kind === 'town'
          ? '#ffffff'
          : label.kind === 'dungeon'
            ? '#ff9f86'
            : '#f2d9a6';
      ctx.fillText(label.name, x, y);
    }
    // Uno mismo, en el centro.
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function readOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}
