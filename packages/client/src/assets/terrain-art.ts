import { Terrain } from '@fenix/shared';
import { context2d, createCanvas, seededRandom, shade, type Rgb } from './pixel-art';

/**
 * Tamaño lógico del rombo de terreno. Todo el arte se dibuja a "medio
 * pixel" y se escala x2 al renderizar, así terreno y personajes comparten
 * el mismo tamaño de pixel (44 px en pantalla, como los tiles de UO).
 */
export const TERRAIN_ART_SIZE = 22;
export const TERRAIN_VARIANTS = 4;

interface TerrainPalette {
  readonly base: Rgb;
  readonly paint: (ctx: PixelPainter) => void;
}

/** Pinta pixeles dentro del rombo usando coordenadas locales. */
class PixelPainter {
  readonly size = TERRAIN_ART_SIZE;

  constructor(
    private readonly image: ImageData,
    readonly random: () => number,
  ) {}

  inside(x: number, y: number): boolean {
    const half = this.size / 2;
    return Math.abs(x + 0.5 - half) + Math.abs(y + 0.5 - half) <= half;
  }

  set(x: number, y: number, [r, g, b]: Rgb): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size || !this.inside(x, y)) return;
    const i = (y * this.size + x) * 4;
    this.image.data[i] = r;
    this.image.data[i + 1] = g;
    this.image.data[i + 2] = b;
    this.image.data[i + 3] = 255;
  }

  /** Recorre cada pixel del rombo. */
  each(fn: (x: number, y: number) => void): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) if (this.inside(x, y)) fn(x, y);
    }
  }

  /** Variación de brillo aleatoria alrededor de un color. */
  jitter(color: Rgb, amount: number): Rgb {
    return shade(color, 1 + (this.random() - 0.5) * amount);
  }
}

const PALETTES: Readonly<Record<Terrain, TerrainPalette>> = {
  [Terrain.Grass]: {
    base: [62, 112, 48],
    paint(p) {
      p.each((x, y) => p.set(x, y, p.jitter(this.base, 0.18)));
      for (let i = 0; i < 26; i++) {
        const x = Math.floor(p.random() * p.size);
        const y = Math.floor(p.random() * p.size);
        const blade = p.random() > 0.5 ? shade(this.base, 1.3) : shade(this.base, 0.75);
        p.set(x, y, blade);
        p.set(x, y - 1, shade(blade, 1.1));
      }
      if (p.random() > 0.6) {
        const x = 4 + Math.floor(p.random() * 14);
        const y = 6 + Math.floor(p.random() * 10);
        p.set(x, y, p.random() > 0.5 ? [228, 214, 92] : [214, 120, 160]);
      }
    },
  },
  [Terrain.Dirt]: {
    base: [120, 88, 56],
    paint(p) {
      p.each((x, y) => p.set(x, y, p.jitter(this.base, 0.16)));
      for (let i = 0; i < 9; i++) {
        const x = Math.floor(p.random() * p.size);
        const y = Math.floor(p.random() * p.size);
        p.set(x, y, shade(this.base, 0.68));
        p.set(x + 1, y, shade(this.base, 1.22));
      }
    },
  },
  [Terrain.Sand]: {
    base: [214, 190, 132],
    paint(p) {
      p.each((x, y) => p.set(x, y, p.jitter(this.base, 0.08)));
      for (let i = 0; i < 14; i++) {
        const x = Math.floor(p.random() * p.size);
        const y = Math.floor(p.random() * p.size);
        p.set(x, y, shade(this.base, p.random() > 0.5 ? 0.86 : 1.08));
      }
    },
  },
  [Terrain.Stone]: {
    base: [128, 124, 116],
    paint(p) {
      // Adoquines: grilla en coordenadas del tile (no de pantalla).
      const half = p.size / 2;
      p.each((x, y) => {
        const u = (x + 0.5 - half) / half / 2 + (y + 0.5 - half) / half / 2 + 0.5;
        const v = (y + 0.5 - half) / half / 2 - (x + 0.5 - half) / half / 2 + 0.5;
        const cu = u * 3;
        const cv = v * 3 + (Math.floor(u * 3) % 2) * 0.5;
        const edge = Math.min(cu % 1, 1 - (cu % 1), cv % 1, 1 - (cv % 1));
        const stone = shade(
          this.base,
          0.92 + ((Math.floor(cu) * 7 + Math.floor(cv) * 13) % 5) * 0.04,
        );
        p.set(x, y, edge < 0.09 ? shade(this.base, 0.6) : p.jitter(stone, 0.08));
      });
    },
  },
  [Terrain.Water]: {
    base: [38, 84, 140],
    paint(p) {
      p.each((x, y) => p.set(x, y, p.jitter(this.base, 0.08)));
      for (let i = 0; i < 5; i++) {
        const x = Math.floor(p.random() * (p.size - 4));
        const y = Math.floor(p.random() * p.size);
        for (let k = 0; k < 3; k++) p.set(x + k, y, shade(this.base, 1.45));
      }
    },
  },
};

/** Base para fondos y minimapas: el color promedio del terreno. */
export function terrainBaseColor(terrain: Terrain): Rgb {
  return PALETTES[terrain].base;
}

/** Dibuja una variante de un tile de terreno en un canvas de 22×22. */
export function drawTerrainTile(terrain: Terrain, variant: number): HTMLCanvasElement {
  const canvas = createCanvas(TERRAIN_ART_SIZE, TERRAIN_ART_SIZE);
  const ctx = context2d(canvas);
  const image = ctx.createImageData(TERRAIN_ART_SIZE, TERRAIN_ART_SIZE);
  const painter = new PixelPainter(image, seededRandom(terrain * 1000 + variant * 31 + 7));
  PALETTES[terrain].paint(painter);
  ctx.putImageData(image, 0, 0);
  return canvas;
}
