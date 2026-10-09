import { Terrain, TERRAINS } from '@fenix/shared';
import { PixelImage, seededRandom, shade, type Rgb } from './pixel-art';

/**
 * Tamaño lógico del rombo de terreno. Todo el arte se dibuja a "medio
 * pixel" y se escala x2 al renderizar, así terreno y personajes comparten
 * el mismo tamaño de pixel (44 px en pantalla, como los tiles de UO).
 */
export const TERRAIN_ART_SIZE = 22;
export const TERRAIN_VARIANTS = 4;

/** Terreno de los cuatro vecinos que comparten un borde con el tile. */
export interface TerrainNeighbors {
  readonly north?: Terrain | undefined;
  readonly east?: Terrain | undefined;
  readonly south?: Terrain | undefined;
  readonly west?: Terrain | undefined;
}

const HALF = TERRAIN_ART_SIZE / 2;

/** Coordenadas dentro del tile (u = eje x, v = eje y), cada una en [-0.5, 0.5]. */
function tileCoords(x: number, y: number): { u: number; v: number } {
  const dx = x + 0.5 - HALF;
  const dy = y + 0.5 - HALF;
  return { u: (dx + dy) / TERRAIN_ART_SIZE, v: (dy - dx) / TERRAIN_ART_SIZE };
}

function insideDiamond(x: number, y: number): boolean {
  return Math.abs(x + 0.5 - HALF) + Math.abs(y + 0.5 - HALF) <= HALF;
}

/** Pinta pixeles dentro del rombo. */
class Painter {
  readonly size = TERRAIN_ART_SIZE;

  constructor(
    readonly image: PixelImage,
    readonly random: () => number,
  ) {}

  set(x: number, y: number, color: Rgb): void {
    if (insideDiamond(x, y)) this.image.set(x, y, color);
  }

  each(fn: (x: number, y: number) => void): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) if (insideDiamond(x, y)) fn(x, y);
    }
  }

  jitter(color: Rgb, amount: number): Rgb {
    return shade(color, 1 + (this.random() - 0.5) * amount);
  }

  randomPoint(): [number, number] {
    return [Math.floor(this.random() * this.size), Math.floor(this.random() * this.size)];
  }
}

interface TerrainStyle {
  readonly base: Rgb;
  paint(p: Painter, base: Rgb): void;
}

const STYLES: Readonly<Record<Terrain, TerrainStyle>> = {
  [Terrain.Grass]: {
    base: [62, 112, 48],
    paint(p, base) {
      p.each((x, y) => p.set(x, y, p.jitter(base, 0.18)));
      for (let i = 0; i < 26; i++) {
        const [x, y] = p.randomPoint();
        const blade = p.random() > 0.5 ? shade(base, 1.3) : shade(base, 0.75);
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
    paint(p, base) {
      p.each((x, y) => p.set(x, y, p.jitter(base, 0.16)));
      for (let i = 0; i < 9; i++) {
        const [x, y] = p.randomPoint();
        p.set(x, y, shade(base, 0.68));
        p.set(x + 1, y, shade(base, 1.22));
      }
    },
  },
  [Terrain.Sand]: {
    base: [214, 190, 132],
    paint(p, base) {
      p.each((x, y) => p.set(x, y, p.jitter(base, 0.08)));
      for (let i = 0; i < 14; i++) {
        const [x, y] = p.randomPoint();
        p.set(x, y, shade(base, p.random() > 0.5 ? 0.86 : 1.08));
      }
    },
  },
  [Terrain.Stone]: {
    base: [128, 124, 116],
    paint(p, base) {
      // Adoquines: grilla en coordenadas del tile (no de pantalla).
      p.each((x, y) => {
        const { u, v } = tileCoords(x, y);
        const cu = (u + 0.5) * 3;
        const cv = (v + 0.5) * 3 + (Math.floor(cu) % 2) * 0.5;
        const edge = Math.min(cu % 1, 1 - (cu % 1), cv % 1, 1 - (cv % 1));
        const tone = 0.92 + ((Math.floor(cu) * 7 + Math.floor(cv) * 13) % 5) * 0.04;
        p.set(x, y, edge < 0.09 ? shade(base, 0.6) : p.jitter(shade(base, tone), 0.08));
      });
    },
  },
  [Terrain.Water]: {
    base: [38, 84, 140],
    paint(p, base) {
      p.each((x, y) => p.set(x, y, p.jitter(base, 0.08)));
      for (let i = 0; i < 5; i++) {
        const x = Math.floor(p.random() * (p.size - 4));
        const y = Math.floor(p.random() * p.size);
        for (let k = 0; k < 3; k++) p.set(x + k, y, shade(base, 1.45));
      }
    },
  },
  [Terrain.Wood]: {
    base: [132, 92, 56],
    paint(p, base) {
      // Tablones a lo largo del eje x, con juntas oscuras entre ellos.
      const tones = [1, 0.9, 1.06, 0.95].map(() => 0.88 + p.random() * 0.2);
      p.each((x, y) => {
        const { u, v } = tileCoords(x, y);
        const plank = Math.min(3, Math.floor((v + 0.5) * 4));
        const inPlank = ((v + 0.5) * 4) % 1;
        const tone = tones[plank] ?? 1;
        const seam = inPlank < 0.14 || Math.abs(((u + 0.5 + plank * 0.37) % 1) - 0.5) < 0.03;
        p.set(x, y, seam ? shade(base, 0.62) : p.jitter(shade(base, tone), 0.07));
      });
    },
  },
};

/** Color promedio del terreno (para minimapas y fondos). */
export function terrainBaseColor(terrain: Terrain): Rgb {
  return STYLES[terrain].base;
}

function paintBase(terrain: Terrain, variant: number): PixelImage {
  const image = new PixelImage(TERRAIN_ART_SIZE, TERRAIN_ART_SIZE);
  const painter = new Painter(image, seededRandom(terrain * 1000 + variant * 31 + 7));
  STYLES[terrain].paint(painter, STYLES[terrain].base);
  return image;
}

/** Hash estable por pixel para que el borde mezclado tenga un contorno irregular. */
function edgeNoise(a: number, b: number): number {
  const h = Math.imul(a + 17, 374761393) ^ Math.imul(b + 31, 668265263);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

function blends(over: Terrain | undefined, under: Terrain): over is Terrain {
  if (over === undefined) return false;
  const top = TERRAINS[over].blendPriority;
  const bottom = TERRAINS[under].blendPriority;
  return top >= 0 && bottom >= 0 && top > bottom;
}

/**
 * Dibuja una variante de un tile de terreno. Si un vecino tiene mayor
 * prioridad de mezcla, su textura se derrama sobre el borde compartido con
 * un contorno irregular, como las transiciones de UO.
 */
export function drawTerrainTile(
  terrain: Terrain,
  variant: number,
  neighbors: TerrainNeighbors = {},
): PixelImage {
  const image = paintBase(terrain, variant);
  const edges: { over: Terrain; distance: (u: number, v: number) => number }[] = [];
  if (blends(neighbors.north, terrain))
    edges.push({ over: neighbors.north, distance: (_u, v) => v + 0.5 });
  if (blends(neighbors.east, terrain))
    edges.push({ over: neighbors.east, distance: (u) => 0.5 - u });
  if (blends(neighbors.south, terrain))
    edges.push({ over: neighbors.south, distance: (_u, v) => 0.5 - v });
  if (blends(neighbors.west, terrain))
    edges.push({ over: neighbors.west, distance: (u) => u + 0.5 });
  if (edges.length === 0) return image;

  const overlays = new Map<Terrain, PixelImage>();
  for (let y = 0; y < TERRAIN_ART_SIZE; y++) {
    for (let x = 0; x < TERRAIN_ART_SIZE; x++) {
      if (!insideDiamond(x, y)) continue;
      const { u, v } = tileCoords(x, y);
      for (const edge of edges) {
        const reach = 0.14 + edgeNoise(x, y) * 0.16;
        if (edge.distance(u, v) > reach) continue;
        let overlay = overlays.get(edge.over);
        if (!overlay) {
          overlay = paintBase(edge.over, variant);
          overlays.set(edge.over, overlay);
        }
        image.set(x, y, overlay.colorAt(x, y));
        break;
      }
    }
  }
  return image;
}
