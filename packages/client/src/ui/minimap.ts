import { terrainBaseColor } from '@fenix/art';
import { STATICS, type StaticKind, type TileMap } from '@fenix/shared';
import type { ClientGame } from '../core/client-game';
import { el } from './dom';

/** Lado del minimapa en pantalla (pixeles CSS). */
const SIZE = 196;
/** Acercamientos posibles: pixeles por tile. */
const ZOOMS = [1.2, 2, 3.2] as const;
const STORAGE_KEY = 'fenix.minimapa';

/** Color de cada objeto fijo en el minimapa (los que no figuran no se dibujan). */
function staticColor(kind: StaticKind): string | null {
  if (kind === 'mountain') return '#7d756b';
  if (kind === 'rock' || kind === 'rubble' || kind === 'gravestone') return '#8d8a84';
  if (kind.startsWith('wall') || kind === 'lighthouse') return '#c9c2b4';
  if (kind === 'tent') return '#c49a62';
  if (kind === 'lamp' || kind === 'campfire' || kind === 'brazier' || kind === 'shrine')
    return '#ffd36b';
  if (kind === 'cave-entrance') return '#1b1410';
  if (kind === 'reeds' || kind === 'flowers' || kind === 'bush') return null;
  // Árboles y cactus: verde oscuro.
  return STATICS[kind].blocking ? '#2c5a2c' : null;
}

/**
 * Minimapa: el mundo visto desde arriba, girado como la vista isométrica
 * (arriba en el minimapa es arriba en la pantalla), centrado en uno mismo.
 * Muestra a la gente cerca y los nombres de pueblos y lugares. Se abre y se
 * cierra con su botón o la tecla M; la rueda acerca o aleja.
 */
export class Minimap {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private base: HTMLCanvasElement | null = null;
  private baseMap: TileMap | null = null;
  private zoom = 1;
  private timer: number | null = null;

  constructor(private readonly game: ClientGame) {
    this.canvas = el('canvas', { className: 'minimap-canvas' }) as HTMLCanvasElement;
    const ratio = Math.max(1, Math.ceil(window.devicePixelRatio || 1));
    this.canvas.width = SIZE * ratio;
    this.canvas.height = SIZE * ratio;
    this.element = el(
      'div',
      { className: 'minimap', attrs: { role: 'img', 'aria-label': 'Minimapa' } },
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
      this.zoom = (this.zoom + 1) % ZOOMS.length;
      this.draw();
    });
    this.setOpen(readOpen());
  }

  get open(): boolean {
    return !this.element.hidden;
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  destroy(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
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

  /** Un pixel por tile: terreno y objetos, hecho una sola vez por mapa. */
  private baseFor(map: TileMap): HTMLCanvasElement {
    if (this.base && this.baseMap === map) return this.base;
    const canvas = document.createElement('canvas');
    canvas.width = map.width;
    canvas.height = map.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const image = ctx.createImageData(map.width, map.height);
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const terrain = map.terrainAt({ x, y });
          const [r, g, b] = terrain === undefined ? [0, 0, 0] : terrainBaseColor(terrain);
          const o = (y * map.width + x) * 4;
          image.data[o] = r;
          image.data[o + 1] = g;
          image.data[o + 2] = b;
          image.data[o + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
      for (const s of map.statics) {
        const color = staticColor(s.kind);
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(s.x, s.y, 1, 1);
      }
    }
    this.base = canvas;
    this.baseMap = map;
    return canvas;
  }

  private draw(): void {
    const map = this.game.map;
    const self = this.game.self;
    const ctx = this.canvas.getContext('2d');
    if (!map || !self || !ctx) return;
    const ratio = this.canvas.width / SIZE;
    const k = (ZOOMS[this.zoom] ?? 2) / Math.SQRT2;
    const center = self.position;
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
    ctx.drawImage(this.baseFor(map), 0, 0);
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
