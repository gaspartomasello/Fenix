import type { Position } from '@fenix/shared/geometry/position';
import type { TreasureMark } from '@fenix/shared/treasure/treasure';
import type { TileMap } from '@fenix/shared/world/tile-map';
import { el } from './dom';
import { GameWindow } from './game-window';
import { mapPicture } from './map-picture';

/** Lado del dibujo del mapa (pixeles CSS). */
const SIZE = 240;
/** Pixeles por tile: se ve una zona de unos 60 tiles alrededor de la cruz. */
const ZOOM = 4;

/** Lo que muestra un mapa del tesoro abierto. */
export interface TreasureMapContents {
  readonly name: string;
  readonly mark: TreasureMark;
  readonly hint: string;
}

/**
 * Un mapa del tesoro abierto: un trozo del mundo dibujado en pergamino, girado
 * como la vista del juego, con una cruz roja donde está enterrado el cofre y
 * una pista escrita abajo. Si uno anda cerca, se ve dónde está parado.
 */
export class TreasureMapWindow {
  readonly window: GameWindow;
  private readonly canvas: HTMLCanvasElement;
  private readonly hint: HTMLElement;

  constructor(
    private readonly map: () => TileMap | null,
    private readonly self: () => Position | null,
  ) {
    this.window = new GameWindow('mapa-tesoro', 'Mapa del tesoro', { x: 300, y: 120 });
    this.window.element.classList.add('treasure-map-window');
    this.canvas = el('canvas', { className: 'treasure-map-canvas' }) as HTMLCanvasElement;
    const ratio = Math.max(1, Math.ceil(window.devicePixelRatio || 1));
    this.canvas.width = SIZE * ratio;
    this.canvas.height = SIZE * ratio;
    this.hint = el('p', { className: 'treasure-map-hint' });
    this.window.body.append(
      this.canvas,
      this.hint,
      el('p', {
        className: 'window-hint',
        text: 'Con el mapa encima, cavá con una pala cerca de la cruz.',
      }),
    );
  }

  open(contents: TreasureMapContents): void {
    this.window.setTitle(capitalize(contents.name));
    this.hint.textContent = `El tesoro está ${contents.hint}.`;
    this.draw(contents.mark);
    this.window.show();
  }

  private draw(mark: TreasureMark): void {
    const map = this.map();
    const ctx = this.canvas.getContext('2d');
    if (!map || !ctx) return;
    const ratio = this.canvas.width / SIZE;
    const k = ZOOM / Math.SQRT2;
    // La cruz no queda justo en el medio: cada mapa la corre un poco.
    const center = {
      x: mark.x + ((mark.x * 7 + mark.y * 3) % 9) - 4,
      y: mark.y + ((mark.y * 5) % 9) - 4,
    };
    const project = (x: number, y: number): [number, number] => [
      SIZE / 2 + (x - center.x - (y - center.y)) * k,
      SIZE / 2 + (x - center.x + (y - center.y)) * k,
    ];
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#d8c39a';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.save();
    // Tinta vieja sobre pergamino: el mundo en tonos sepia.
    ctx.filter = 'sepia(0.8) saturate(0.9) contrast(1.15)';
    ctx.imageSmoothingEnabled = false;
    const [ox, oy] = project(0, 0);
    ctx.setTransform(k * ratio, k * ratio, -k * ratio, k * ratio, ox * ratio, oy * ratio);
    ctx.drawImage(mapPicture(map), 0, 0);
    ctx.restore();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    // Bordes gastados.
    const fade = ctx.createRadialGradient(
      SIZE / 2,
      SIZE / 2,
      SIZE * 0.3,
      SIZE / 2,
      SIZE / 2,
      SIZE * 0.75,
    );
    fade.addColorStop(0, 'rgba(216, 195, 154, 0)');
    fade.addColorStop(1, 'rgba(120, 84, 46, 0.85)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, SIZE, SIZE);

    const self = this.self();
    if (self) {
      const [x, y] = project(self.x, self.y);
      if (x > 6 && y > 6 && x < SIZE - 6 && y < SIZE - 6) {
        ctx.fillStyle = '#2b4f7a';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const [x, y] = project(mark.x + 0.5, mark.y + 0.5);
    ctx.strokeStyle = '#a3201a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 6);
    ctx.lineTo(x + 6, y + 6);
    ctx.moveTo(x + 6, y - 6);
    ctx.lineTo(x - 6, y + 6);
    ctx.stroke();
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
