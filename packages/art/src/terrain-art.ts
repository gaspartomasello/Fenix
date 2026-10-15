import { Terrain, TERRAINS } from '@fenix/shared';
import { PixelImage, shade, type Rgb } from './pixel-art';

/**
 * Tamaño del rombo de terreno, en pixeles de pantalla (44×44 como los tiles
 * de UO). Se dibuja a resolución completa y se muestra sin escalar.
 */
export const TERRAIN_ART_SIZE = 44;
export const TERRAIN_VARIANTS = 4;

/** Terreno de los cuatro vecinos que comparten un borde con el tile. */
export interface TerrainNeighbors {
  readonly north?: Terrain | undefined;
  readonly east?: Terrain | undefined;
  readonly south?: Terrain | undefined;
  readonly west?: Terrain | undefined;
}

const HALF = TERRAIN_ART_SIZE / 2;

/** Coordenadas dentro del tile (u = eje x del mapa, v = eje y), cada una en [0, 1). */
function tileCoords(x: number, y: number): { u: number; v: number } {
  const dx = x + 0.5 - HALF;
  const dy = y + 0.5 - HALF;
  return { u: (dx + dy) / TERRAIN_ART_SIZE + 0.5, v: (dy - dx) / TERRAIN_ART_SIZE + 0.5 };
}

function insideDiamond(x: number, y: number): boolean {
  return Math.abs(x + 0.5 - HALF) + Math.abs(y + 0.5 - HALF) <= HALF;
}

// ── Ruido periódico: se repite exacto en cada tile, así no hay costuras ──

function hash(x: number, y: number, seed: number): number {
  const h = Math.imul(x * 374761393 + y * 668265263 + seed * 2246822519, 3266489917);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Ruido suave con período `cells` en u y v (las celdas del borde se repiten). */
function periodicNoise(u: number, v: number, cells: number, seed: number): number {
  const x = u * cells;
  const y = v * cells;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const at = (i: number, j: number): number =>
    hash((((i % cells) + cells) % cells) | 0, (((j % cells) + cells) % cells) | 0, seed);
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
}

/** Varias octavas de ruido periódico (0–1). */
function fbm(u: number, v: number, seed: number, base = 3, octaves = 3): number {
  let total = 0;
  let weight = 0;
  for (let i = 0; i < octaves; i++) {
    const w = 1 / 2 ** i;
    total += periodicNoise(u, v, base * 2 ** i, seed + i * 101) * w;
    weight += w;
  }
  return total / weight;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

/** Cómo se pinta cada pixel de un terreno (u, v en el tile; `seed` cambia por variante). */
type TerrainPaint = (u: number, v: number, seed: number) => Rgb;

interface TerrainStyle {
  readonly base: Rgb;
  readonly paint: TerrainPaint;
  /**
   * Las variantes cambian el centro del tile (manchones, piedritas) pero
   * comparten los bordes, así los tiles vecinos empalman sin costura. Los
   * dibujos regulares (adoquines, tablones) son iguales en todas.
   */
  readonly varies: boolean;
}

const STYLES: Readonly<Record<Terrain, TerrainStyle>> = {
  [Terrain.Grass]: {
    varies: true,
    base: [70, 120, 52],
    paint(u, v, seed) {
      // Manchones claros y oscuros, briznas finas y algún trébol.
      const patch = fbm(u, v, seed, 2, 3);
      let color = mix([52, 98, 40], [96, 146, 62], patch);
      const blades = periodicNoise(u, v * 0.35, 22, seed + 7);
      if (blades > 0.78) color = shade(color, 1.16);
      else if (blades < 0.18) color = shade(color, 0.84);
      if (periodicNoise(u, v, 9, seed + 31) > 0.86) color = mix(color, [124, 168, 70], 0.5);
      return color;
    },
  },
  [Terrain.Dirt]: {
    varies: true,
    base: [124, 92, 60],
    paint(u, v, seed) {
      const tone = fbm(u, v, seed, 3, 3);
      let color = mix([98, 70, 44], [146, 112, 76], tone);
      // Piedritas: un punto claro con sombra abajo.
      const pebble = periodicNoise(u, v, 11, seed + 5);
      if (pebble > 0.87) color = mix(color, [176, 160, 136], 0.7);
      else if (pebble > 0.83) color = shade(color, 0.78);
      return color;
    },
  },
  [Terrain.Sand]: {
    varies: true,
    base: [214, 192, 138],
    paint(u, v, seed) {
      const tone = fbm(u, v, seed, 3, 2);
      let color = mix([196, 172, 118], [230, 210, 158], tone);
      // Ondas de viento suaves en diagonal.
      const ripple = Math.sin((u + v * 0.6 + fbm(u, v, seed + 3, 2, 2) * 0.3) * Math.PI * 8);
      if (ripple > 0.85) color = shade(color, 1.06);
      else if (ripple < -0.9) color = shade(color, 0.94);
      return color;
    },
  },
  [Terrain.Stone]: {
    varies: false,
    base: [130, 126, 118],
    paint(u, v, seed) {
      // Adoquines redondeados: luz arriba a la izquierda, sombra abajo a la derecha, junta oscura.
      const cells = 3;
      const cu = u * cells;
      const row = Math.floor(cu);
      const cv = v * cells + (row % 2) * 0.5;
      const fu = cu - row;
      const fv = cv - Math.floor(cv);
      const edge = Math.min(fu, 1 - fu, fv, 1 - fv);
      const id = hash(row, Math.floor(cv) % cells, seed);
      const base = mix([108, 104, 98], [156, 150, 140], id);
      if (edge < 0.07) return [72, 68, 64];
      const bevel = edge < 0.18 ? (fu < 0.5 || fv < 0.5 ? 1.14 : 0.82) : 1;
      return shade(mix(base, shade(base, 1.1), fbm(u, v, seed, 6, 2)), bevel);
    },
  },
  [Terrain.Water]: {
    varies: true,
    base: [40, 88, 140],
    paint(u, v, seed) {
      const depth = fbm(u, v, seed, 2, 3);
      let color = mix([28, 66, 116], [52, 112, 164], depth);
      // Reflejos: crestas finas del ruido.
      const wave = periodicNoise(u * 1.3 + v * 0.4, v, 6, seed + 9);
      if (Math.abs(wave - 0.5) < 0.025) color = mix(color, [170, 210, 236], 0.6);
      else if (Math.abs(wave - 0.5) < 0.05) color = shade(color, 1.12);
      return color;
    },
  },
  [Terrain.Wood]: {
    varies: false,
    base: [136, 96, 60],
    paint(u, v, seed) {
      // Tablones a lo largo del eje x, con veta, juntas y clavos.
      const planks = 4;
      const index = Math.min(planks - 1, Math.floor(v * planks));
      const inPlank = v * planks - index;
      const tone = 0.88 + hash(index, 0, seed) * 0.22;
      const offset = hash(index, 1, seed);
      const along = (u + offset) % 1;
      if (inPlank < 0.08) return [70, 46, 28];
      if (Math.abs(along - 0.5) < 0.012) return [84, 56, 34];
      const grain = Math.sin((inPlank * 9 + periodicNoise(u, v, 4, seed) * 3) * Math.PI);
      let color = shade([138, 96, 58], tone * (1 + grain * 0.05));
      if (inPlank < 0.16) color = shade(color, 1.1);
      if (Math.abs(along - 0.45) < 0.02 && Math.abs(inPlank - 0.5) < 0.08) color = [60, 52, 48];
      return color;
    },
  },
  [Terrain.Cave]: {
    varies: true,
    base: [100, 90, 78],
    paint(u, v, seed) {
      // Suelo de roca y tierra apisonada, con grietas y piedritas.
      const tone = fbm(u, v, seed, 3, 3);
      let color = mix([78, 70, 60], [124, 112, 96], tone);
      const crack = periodicNoise(u, v, 7, seed + 13);
      if (Math.abs(crack - 0.5) < 0.018) color = shade(color, 0.62);
      const pebble = periodicNoise(u, v, 12, seed + 5);
      if (pebble > 0.88) color = mix(color, [132, 124, 112], 0.6);
      return color;
    },
  },
  [Terrain.Rock]: {
    varies: true,
    base: [40, 36, 34],
    paint(u, v, seed) {
      // Roca maciza: casi negra, solo se ve por los bordes de las paredes.
      return mix([26, 24, 22], [52, 48, 44], fbm(u, v, seed, 3, 2));
    },
  },
  [Terrain.Snow]: {
    varies: true,
    base: [226, 232, 240],
    paint(u, v, seed) {
      // Nieve: blanca con sombras azuladas en los pozos, montículos y algún brillo.
      const drift = fbm(u, v, seed, 2, 3);
      let color = mix([186, 198, 218], [242, 246, 250], drift);
      const sparkle = periodicNoise(u, v, 17, seed + 3);
      if (sparkle > 0.9) color = [252, 253, 255];
      // Huellas de viento: surcos finos en diagonal.
      const furrow = Math.sin((u * 0.7 + v + fbm(u, v, seed + 9, 2, 2) * 0.4) * Math.PI * 6);
      if (furrow < -0.93) color = shade(color, 0.92);
      return color;
    },
  },
  [Terrain.Swamp]: {
    varies: true,
    base: [70, 82, 54],
    paint(u, v, seed) {
      // Barro verdoso con charcos oscuros que reflejan y matas de pasto ralo.
      const mud = fbm(u, v, seed, 2, 3);
      let color = mix([54, 60, 40], [92, 98, 60], mud);
      const puddle = fbm(u, v, seed + 21, 3, 2);
      if (puddle > 0.62) {
        color = mix([38, 56, 52], [60, 84, 74], (puddle - 0.62) * 3);
        if (periodicNoise(u * 1.4, v, 8, seed + 4) > 0.86) color = mix(color, [128, 150, 130], 0.5);
      } else if (periodicNoise(u, v * 0.4, 20, seed + 7) > 0.8) {
        color = mix(color, [104, 128, 60], 0.7);
      }
      return color;
    },
  },
};

/** Color promedio del terreno (para minimapas y fondos). */
export function terrainBaseColor(terrain: Terrain): Rgb {
  return STYLES[terrain].base;
}

function seedFor(terrain: Terrain, variant: number): number {
  return terrain * 1000 + (variant % TERRAIN_VARIANTS) * 37 + 11;
}

/** Color de un terreno en (u, v): la variante en el centro, lo compartido en los bordes. */
function terrainColor(terrain: Terrain, variant: number, u: number, v: number): Rgb {
  const style = STYLES[terrain];
  const shared = style.paint(u, v, seedFor(terrain, 0));
  if (!style.varies || variant % TERRAIN_VARIANTS === 0) return shared;
  const edge = Math.min(u, 1 - u, v, 1 - v);
  const t = Math.min(1, edge / 0.3);
  return mix(shared, style.paint(u, v, seedFor(terrain, variant)), t * t * (3 - 2 * t));
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
 * un contorno irregular y una sombra suave, como las transiciones de UO.
 */
export function drawTerrainTile(
  terrain: Terrain,
  variant: number,
  neighbors: TerrainNeighbors = {},
): PixelImage {
  const image = new PixelImage(TERRAIN_ART_SIZE, TERRAIN_ART_SIZE);
  const seed = seedFor(terrain, 0);
  const edges: { over: Terrain; distance: (u: number, v: number) => number }[] = [];
  if (blends(neighbors.north, terrain))
    edges.push({ over: neighbors.north, distance: (_u, v) => v });
  if (blends(neighbors.east, terrain)) edges.push({ over: neighbors.east, distance: (u) => 1 - u });
  if (blends(neighbors.south, terrain))
    edges.push({ over: neighbors.south, distance: (_u, v) => 1 - v });
  if (blends(neighbors.west, terrain)) edges.push({ over: neighbors.west, distance: (u) => u });

  for (let y = 0; y < TERRAIN_ART_SIZE; y++) {
    for (let x = 0; x < TERRAIN_ART_SIZE; x++) {
      if (!insideDiamond(x, y)) continue;
      const { u, v } = tileCoords(x, y);
      let color = terrainColor(terrain, variant, u, v);
      for (const edge of edges) {
        // Borde irregular con ruido periódico (empalma con el tile vecino).
        const reach = 0.16 + fbm(u, v, seed + 77, 4, 2) * 0.2;
        const d = edge.distance(u, v);
        if (d < reach) {
          color = terrainColor(edge.over, 0, u, v);
          break;
        }
        // Sombra fina del terreno de arriba sobre el de abajo.
        if (d < reach + 0.04) color = shade(color, 0.86);
      }
      image.set(x, y, color);
    }
  }
  return image;
}
