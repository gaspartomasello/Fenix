import type { TileMap } from '@fenix/shared';
import type { ClientGame } from '../core/client-game';
import { el } from './dom';
import { mapPicture } from './map-picture';

/** Lugar que ocupa el mapa en la pantalla, como fracción de la ventana. */
const SCREEN_FILL = { width: 0.92, height: 0.82 };

/**
 * El mapa del mundo entero, como el de UO: el continente y las islas de una
 * vez, con los nombres de pueblos y lugares y dónde está uno. Se abre con la
 * segunda vez que se aprieta M (la primera abre el minimapa); un clic lo cierra.
 */
export class WorldMap {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private timer: number | null = null;
  private readonly onResize = (): void => this.layout();

  constructor(
    private readonly game: ClientGame,
    /** Se llama al cerrarse con un clic (para el botón que queda presionado). */
    private readonly onClose: () => void = () => undefined,
  ) {
    this.canvas = el('canvas', { className: 'world-map-canvas' }) as HTMLCanvasElement;
    this.element = el(
      'div',
      { className: 'world-map', attrs: { role: 'dialog', 'aria-label': 'Mapa del mundo' } },
      [
        el('div', { className: 'world-map-frame' }, [
          el('div', { className: 'world-map-title', text: 'Mapa del mundo' }),
          this.canvas,
          el('div', { className: 'world-map-hint', text: 'M o un clic para cerrar' }),
        ]),
      ],
    );
    this.element.hidden = true;
    const close = (e: Event): void => {
      e.preventDefault();
      e.stopPropagation();
      this.show(false);
      this.onClose();
    };
    this.element.addEventListener('click', close);
    this.element.addEventListener('contextmenu', close);
  }

  get open(): boolean {
    return !this.element.hidden;
  }

  show(open: boolean): void {
    this.element.hidden = !open;
    if (open && this.timer === null) {
      window.addEventListener('resize', this.onResize);
      this.timer = window.setInterval(() => this.draw(), 500);
      this.layout();
    } else if (!open && this.timer !== null) {
      window.removeEventListener('resize', this.onResize);
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  destroy(): void {
    this.show(false);
    this.element.remove();
  }

  /** Ajusta el lienzo a la ventana sin deformar el mapa. */
  private layout(): void {
    const map = this.game.map;
    if (!map) return;
    const { width, height } = overworld(map);
    const scale = Math.min(
      (window.innerWidth * SCREEN_FILL.width) / width,
      (window.innerHeight * SCREEN_FILL.height) / height,
    );
    const cssWidth = Math.max(1, Math.floor(width * scale));
    const cssHeight = Math.max(1, Math.floor(height * scale));
    const ratio = Math.max(1, Math.ceil(window.devicePixelRatio || 1));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.canvas.width = cssWidth * ratio;
    this.canvas.height = cssHeight * ratio;
    this.draw();
  }

  private draw(): void {
    const map = this.game.map;
    const ctx = this.canvas.getContext('2d');
    if (!map || !ctx) return;
    const area = overworld(map);
    const k = this.canvas.width / area.width;
    const ratio = this.canvas.width / parseFloat(this.canvas.style.width || '1');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      mapPicture(map),
      0,
      0,
      area.width,
      area.height,
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
    // Nombres: los pueblos en blanco y grandes; los lugares salvajes, color arena.
    // Van primero los pueblos; un nombre que se pisa con otro se corre abajo o no se pone.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const small = this.canvas.width / ratio < 360 ? 0.85 : 1;
    const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const regions = map.regions
      .filter((r) => !r.dungeon && r.x < area.width)
      .sort((a, b) => Number(!!a.wild) - Number(!!b.wild));
    for (const region of regions) {
      const size = (region.wild ? 11 : 13) * small * ratio;
      ctx.font = `${region.wild ? 'italic 600' : '700'} ${size}px Georgia, serif`;
      const half = ctx.measureText(region.name).width / 2 + 2 * ratio;
      const x = (region.x + region.width / 2) * k;
      const y0 = (region.y + region.height / 2) * k;
      const y = [y0, y0 + size * 1.1, y0 - size * 1.1].find((cy) =>
        taken.every(
          (t) => x + half < t.x0 || x - half > t.x1 || cy + size / 2 < t.y0 || cy - size / 2 > t.y1,
        ),
      );
      if (y === undefined) continue;
      taken.push({ x0: x - half, y0: y - size / 2, x1: x + half, y1: y + size / 2 });
      ctx.lineWidth = 3 * ratio;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.strokeText(region.name, x, y);
      ctx.fillStyle = region.wild ? '#f2d9a6' : '#ffffff';
      ctx.fillText(region.name, x, y);
    }
    // Uno mismo: un punto con un anillo que late, para encontrarse de un vistazo.
    const self = this.game.self;
    if (self && self.position.x < area.width) {
      const x = self.position.x * k;
      const y = self.position.y * k;
      const pulse = (Date.now() % 1000) / 1000;
      ctx.strokeStyle = `rgba(255, 255, 255, ${1 - pulse})`;
      ctx.lineWidth = 2 * ratio;
      ctx.beginPath();
      ctx.arc(x, y, (5 + pulse * 9) * ratio, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ff4d4d';
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 4 * ratio, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

/** La parte del mapa a la luz del día: sin la franja de la mazmorra, que queda aparte. */
function overworld(map: TileMap): { width: number; height: number } {
  const dungeons = map.regions.filter((r) => r.dungeon && r.x > 0).map((r) => r.x);
  const width = dungeons.length > 0 ? Math.min(...dungeons) : map.width;
  return { width, height: map.height };
}
