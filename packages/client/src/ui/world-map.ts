import { isWater } from '@fenix/shared/world/terrain';
import type { TileMap } from '@fenix/shared/world/tile-map';
import type { ClientGame } from '../core/client-game';
import { el } from './dom';
import { mapPicture } from './map-picture';

/** Ancho máximo del mapa, como fracción de la ventana. */
const SCREEN_FILL_WIDTH = 0.97;
/** Lo que no es mapa, a lo alto y a lo ancho: el marco fino y un poco de aire (pixeles CSS). */
const FRAME_EXTRA = 20;

/**
 * El mapa del mundo entero, como el de UO: el continente y las islas de una
 * vez, con los nombres de pueblos y lugares y dónde está uno. Se abre con la
 * segunda vez que se aprieta M (la primera abre el minimapa); un clic lo cierra.
 */
export class WorldMap {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  /** La esquina del mapa donde va la rosa de los vientos (la que tiene solo mar), por mapa. */
  private compassCorner: { map: TileMap; corner: Corner } | null = null;
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
      [el('div', { className: 'world-map-frame' }, [this.canvas])],
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
    // Lo más grande que entre: casi toda la pantalla, menos el marco fino.
    const scale = Math.min(
      Math.min(window.innerWidth * SCREEN_FILL_WIDTH, window.innerWidth - FRAME_EXTRA) / width,
      (window.innerHeight - FRAME_EXTRA) / height,
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

  private cornerFor(map: TileMap, area: { width: number; height: number }, side: number): Corner {
    if (this.compassCorner?.map !== map)
      this.compassCorner = { map, corner: seaCorner(map, area, side) };
    return this.compassCorner.corner;
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
    // Los lugares a los que mandan las leyendas: una cruz roja con borde dorado, como en un mapa de tesoro.
    for (const name of this.game.legendPlaces) {
      const region = map.regions.find((r) => r.name === name && r.x < area.width);
      if (!region) continue;
      const x = (region.x + region.width / 2) * k;
      const y = (region.y + region.height / 2) * k - 14 * small * ratio;
      const arm = 5 * small * ratio;
      ctx.lineCap = 'round';
      for (const [color, width] of [
        ['#2a1608', 5],
        ['#e8b84a', 3.4],
        ['#c0261a', 2],
      ] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width * ratio;
        ctx.beginPath();
        ctx.moveTo(x - arm, y - arm);
        ctx.lineTo(x + arm, y + arm);
        ctx.moveTo(x + arm, y - arm);
        ctx.lineTo(x - arm, y + arm);
        ctx.stroke();
      }
    }
    // La rosa de los vientos, chica, en la esquina que tiene solo mar.
    const cssSide = Math.min(this.canvas.width, this.canvas.height) / ratio;
    const r = Math.max(14, Math.min(26, cssSide * 0.045)) * ratio;
    const corner = this.cornerFor(map, area, (r * 2.9) / k);
    const margin = r * 1.55;
    drawCompass(
      ctx,
      corner.right ? this.canvas.width - margin : margin,
      corner.bottom ? this.canvas.height - margin : margin,
      r,
      ratio,
    );
    // Uno mismo: un punto con un anillo que late, para encontrarse de un vistazo.
    const self = this.game.selfSeenAt();
    if (self && self.x < area.width) {
      const x = self.x * k;
      const y = self.y * k;
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
interface Corner {
  readonly right: boolean;
  readonly bottom: boolean;
}

/** Las esquinas, en el orden en que se prefieren si varias son solo mar. */
const CORNERS: readonly Corner[] = [
  { right: true, bottom: true },
  { right: false, bottom: true },
  { right: true, bottom: false },
  { right: false, bottom: false },
];

/** La esquina con más mar (en un cuadrado de `side` tiles): ahí la rosa no tapa tierra ni nombres. */
function seaCorner(map: TileMap, area: { width: number; height: number }, side: number): Corner {
  const tiles = Math.max(4, Math.ceil(side));
  const step = Math.max(1, Math.floor(tiles / 12));
  let best = CORNERS[0] as Corner;
  let bestSea = -1;
  for (const corner of CORNERS) {
    const x0 = corner.right ? area.width - tiles : 0;
    const y0 = corner.bottom ? area.height - tiles : 0;
    let sea = 0;
    for (let y = y0; y < y0 + tiles; y += step)
      for (let x = x0; x < x0 + tiles; x += step) if (isWater(map.terrainAt({ x, y }))) sea++;
    if (sea > bestSea) {
      best = corner;
      bestSea = sea;
    }
  }
  return best;
}

function overworld(map: TileMap): { width: number; height: number } {
  const dungeons = map.regions.filter((r) => r.dungeon && r.x > 0).map((r) => r.x);
  const width = dungeons.length > 0 ? Math.min(...dungeons) : map.width;
  return { width, height: map.height };
}

/**
 * Rosa de los vientos chica sobre el mapa, en (cx, cy): una estrella de bronce de
 * cuatro puntas con N, E, S y O (el mapa del mundo tiene el norte arriba).
 */
function drawCompass(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  ratio: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  // El disco, como una tapa de bronce.
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(28, 18, 10, 0.72)';
  ctx.fill();
  ctx.lineWidth = 1.5 * ratio;
  ctx.strokeStyle = '#c9a45c';
  ctx.stroke();
  // Las cuatro puntas: cada una con una mitad clara y una oscura, como en relieve.
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const tip = [Math.sin(angle) * r * 0.82, -Math.cos(angle) * r * 0.82] as const;
    const side = r * 0.18;
    const left = [Math.sin(angle - Math.PI / 2) * side, -Math.cos(angle - Math.PI / 2) * side];
    const right = [Math.sin(angle + Math.PI / 2) * side, -Math.cos(angle + Math.PI / 2) * side];
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tip[0], tip[1]);
    ctx.lineTo(left[0] ?? 0, left[1] ?? 0);
    ctx.closePath();
    ctx.fillStyle = i === 0 ? '#e86a3a' : '#f0d48c';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tip[0], tip[1]);
    ctx.lineTo(right[0] ?? 0, right[1] ?? 0);
    ctx.closePath();
    ctx.fillStyle = i === 0 ? '#9a3418' : '#8a6a3a';
    ctx.fill();
  }
  // Las letras, por fuera de las puntas.
  ctx.font = `700 ${Math.round(r * 0.42)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3 * ratio;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  for (const [letter, dx, dy] of [
    ['N', 0, -1],
    ['E', 1, 0],
    ['S', 0, 1],
    ['O', -1, 0],
  ] as const) {
    const x = dx * r * 1.38;
    const y = dy * r * 1.38;
    ctx.strokeText(letter, x, y);
    ctx.fillStyle = letter === 'N' ? '#ff9a6a' : '#f3d58a';
    ctx.fillText(letter, x, y);
  }
  ctx.restore();
}
