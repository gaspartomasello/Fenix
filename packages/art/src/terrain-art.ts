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

/**
 * Distancia al borde más cercano entre celdas irregulares (Voronoi
 * periódico, empalma con el tile vecino): grietas y lajas.
 */
function cellEdge(u: number, v: number, seed: number, cells: number): number {
  let best = 9;
  let second = 9;
  for (let i = 0; i < cells; i++) {
    const cx = hash(i * 7 + 1, i * 13 + 2, seed);
    const cy = hash(i * 11 + 5, i * 3 + 9, seed + 1);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const d = Math.hypot(u - cx - ox, v - cy - oy);
        if (d < best) {
          second = best;
          best = d;
        } else if (d < second) second = d;
      }
    }
  }
  return second - best;
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
  [Terrain.Tundra]: {
    varies: true,
    base: [128, 132, 98],
    paint(u, v, seed) {
      // Pasto bajo y escarchado: verde grisáceo y ocre, con manchas de escarcha y musgo rojizo.
      const tone = fbm(u, v, seed, 2, 3);
      let color = mix([104, 110, 80], [150, 150, 112], tone);
      const lichen = periodicNoise(u, v, 6, seed + 13);
      if (lichen > 0.74) color = mix(color, [146, 104, 76], 0.45);
      const frost = fbm(u, v, seed + 29, 3, 2);
      if (frost > 0.66) color = mix(color, [214, 222, 230], (frost - 0.66) * 2.2);
      const blade = periodicNoise(u, v * 0.4, 20, seed + 7);
      if (blade > 0.82) color = shade(color, 1.12);
      return color;
    },
  },
  [Terrain.Jungle]: {
    varies: true,
    base: [44, 80, 38],
    paint(u, v, seed) {
      // Suelo húmedo de selva: verde profundo con hojarasca marrón y musgo brillante.
      const tone = fbm(u, v, seed, 3, 3);
      let color = mix([28, 58, 30], [56, 102, 44], tone);
      const litter = periodicNoise(u, v, 9, seed + 17);
      if (litter > 0.8) color = mix(color, [104, 74, 40], 0.6);
      else if (litter < 0.14) color = mix(color, [92, 150, 52], 0.5);
      const shadow = fbm(u, v, seed + 41, 2, 2);
      if (shadow < 0.32) color = shade(color, 0.82);
      return color;
    },
  },
  [Terrain.DryGrass]: {
    varies: true,
    base: [176, 150, 84],
    paint(u, v, seed) {
      // Pasto seco de sabana: pajizo y dorado, con matas más verdes y tierra que asoma.
      const tone = fbm(u, v, seed, 2, 3);
      let color = mix([150, 124, 66], [202, 176, 102], tone);
      const blades = periodicNoise(u, v * 0.3, 24, seed + 7);
      if (blades > 0.78) color = shade(color, 1.12);
      else if (blades < 0.2) color = shade(color, 0.86);
      const green = periodicNoise(u, v, 5, seed + 23);
      if (green > 0.8) color = mix(color, [126, 134, 70], 0.55);
      if (periodicNoise(u, v, 10, seed + 31) > 0.9) color = mix(color, [140, 104, 66], 0.6);
      return color;
    },
  },
  [Terrain.Meadow]: {
    varies: true,
    base: [92, 146, 60],
    paint(u, v, seed) {
      // Prado: verde claro y fresco, pasto alto que se mueve, con puntitos de flores.
      const tone = fbm(u, v, seed, 2, 3);
      let color = mix([74, 128, 50], [126, 176, 72], tone);
      const blades = periodicNoise(u * 0.35, v, 22, seed + 3);
      if (blades > 0.8) color = shade(color, 1.14);
      else if (blades < 0.18) color = shade(color, 0.86);
      const bloom = periodicNoise(u, v, 15, seed + 37);
      if (bloom > 0.93) color = [236, 226, 120];
      else if (bloom < 0.05) color = [236, 236, 228];
      return color;
    },
  },
  [Terrain.Clay]: {
    varies: true,
    base: [176, 98, 62],
    paint(u, v, seed) {
      // Tierra roja reseca: placas irregulares (celdas) separadas por grietas finas.
      const tone = fbm(u, v, seed, 3, 2);
      let color = mix([152, 82, 52], [198, 120, 78], tone);
      const crack = cellEdge(u, v, 503, 3);
      if (crack < 0.022) return shade(color, 0.66);
      if (crack < 0.045) color = shade(color, 1.06);
      return color;
    },
  },
  [Terrain.Ice]: {
    varies: true,
    base: [176, 210, 230],
    paint(u, v, seed) {
      // Hielo: celeste lechoso con burbujas, vetas blancas y grietas finas.
      const depth = fbm(u, v, seed, 2, 3);
      let color = mix([136, 180, 210], [208, 230, 244], depth);
      const crack = periodicNoise(u * 1.2, v, 5, seed + 11);
      if (Math.abs(crack - 0.5) < 0.012) color = [244, 250, 255];
      else if (Math.abs(crack - 0.5) < 0.03) color = shade(color, 0.9);
      if (periodicNoise(u, v, 18, seed + 7) > 0.92) color = mix(color, [250, 252, 255], 0.7);
      return color;
    },
  },
  [Terrain.Terracotta]: {
    varies: false,
    base: [178, 92, 58],
    paint(u, v, seed) {
      // Una baldosa de barro cocido por tile, con junta clara en el borde (cuadriculado).
      const edge = Math.min(u, 1 - u, v, 1 - v);
      if (edge < 0.04) return [210, 196, 168];
      const tone = fbm(u, v, seed, 3, 2);
      let color = mix([160, 78, 48], [196, 106, 66], tone);
      if (edge < 0.1) color = shade(color, u < 0.5 || v < 0.5 ? 1.08 : 0.88);
      return color;
    },
  },
  [Terrain.MarbleLight]: {
    varies: false,
    base: [222, 214, 196],
    paint(u, v, seed) {
      // Losa de mármol claro (una por tile) con vetas grises; junta fina.
      const edge = Math.min(u, 1 - u, v, 1 - v);
      if (edge < 0.025) return [120, 112, 100];
      let color = mix([210, 202, 184], [238, 232, 220], fbm(u, v, seed, 2, 2));
      const vein = Math.sin((u * 2.2 + v * 1.4 + fbm(u, v, seed + 9, 3, 3) * 1.6) * Math.PI * 2);
      if (Math.abs(vein) < 0.05) color = mix(color, [150, 144, 140], 0.6);
      return color;
    },
  },
  [Terrain.MarbleDark]: {
    varies: false,
    base: [54, 58, 66],
    paint(u, v, seed) {
      // Losa de mármol oscuro, casi negro, con vetas blancas: con la clara arma el damero.
      const edge = Math.min(u, 1 - u, v, 1 - v);
      if (edge < 0.025) return [120, 112, 100];
      let color = mix([40, 44, 52], [72, 76, 86], fbm(u, v, seed, 2, 2));
      const vein = Math.sin((u * 1.6 - v * 2 + fbm(u, v, seed + 9, 3, 3) * 1.6) * Math.PI * 2);
      if (Math.abs(vein) < 0.04) color = mix(color, [196, 196, 200], 0.55);
      return color;
    },
  },
  [Terrain.Flagstone]: {
    varies: false,
    base: [140, 132, 116],
    paint(u, v, seed) {
      // Lajas irregulares de piedra, con pasto ralo en las juntas.
      let best = 9;
      let second = 9;
      let id = 0;
      for (let i = 0; i < 5; i++) {
        const cx = 0.15 + hash(i, 1, seed) * 0.7;
        const cy = 0.15 + hash(i, 2, seed) * 0.7;
        for (const [ox, oy] of [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const d = Math.hypot(u - cx - ox, v - cy - oy);
          if (d < best) {
            second = best;
            best = d;
            id = i;
          } else if (d < second) second = d;
        }
      }
      if (second - best < 0.035) return [86, 100, 62];
      const base = mix([118, 112, 100], [168, 160, 144], hash(id, 3, seed));
      return mix(base, shade(base, 1.08), fbm(u, v, seed, 6, 2));
    },
  },
  [Terrain.OldRoad]: {
    varies: true,
    base: [128, 124, 106],
    paint(u, v, seed) {
      // Empedrado viejo del imperio: piedras gastadas, algunas faltan, pasto en las juntas.
      const crack = cellEdge(u, v, 631, 6);
      const missing = periodicNoise(u, v, 4, seed + 19) > 0.72;
      if (missing) return mix([96, 80, 56], [86, 110, 56], fbm(u, v, seed + 3, 4, 2));
      if (crack < 0.035) return mix([80, 108, 54], [64, 78, 52], fbm(u, v, seed, 8, 1));
      const tone = fbm(u, v, seed, 4, 2);
      let color = mix([112, 108, 94], [158, 152, 134], tone);
      if (periodicNoise(u, v, 9, seed + 41) > 0.8) color = mix(color, [96, 120, 70], 0.4);
      return color;
    },
  },
  [Terrain.Corrupted]: {
    varies: true,
    base: [56, 34, 60],
    paint(u, v, seed) {
      // Tierra corrupta: negra y violeta, agrietada, con vetas que brillan apenas.
      const tone = fbm(u, v, seed, 3, 3);
      let color = mix([30, 22, 34], [76, 44, 82], tone);
      const crack = cellEdge(u, v, 719, 4);
      const glow = periodicNoise(u, v, 3, seed + 27);
      if (crack < 0.02) return glow > 0.55 ? [176, 96, 220] : [18, 12, 20];
      if (crack < 0.05) color = mix(color, glow > 0.55 ? [110, 54, 130] : [24, 18, 26], 0.6);
      if (periodicNoise(u, v, 13, seed + 9) > 0.9) color = [20, 16, 22];
      return color;
    },
  },
  [Terrain.Mud]: {
    varies: true,
    base: [92, 70, 48],
    paint(u, v, seed) {
      // Barro: pardo oscuro y brilloso, con charquitos y marcas de pisadas.
      const tone = fbm(u, v, seed, 3, 3);
      let color = mix([70, 52, 36], [116, 90, 62], tone);
      const puddle = fbm(u, v, seed + 15, 3, 2);
      if (puddle > 0.64) {
        color = mix([54, 50, 44], [96, 104, 100], (puddle - 0.64) * 3);
        if (periodicNoise(u * 1.3, v, 9, seed + 2) > 0.85) color = mix(color, [170, 180, 176], 0.5);
      } else if (periodicNoise(u, v, 11, seed + 5) > 0.86) color = shade(color, 1.18);
      return color;
    },
  },
  [Terrain.Ruins]: {
    varies: true,
    base: [176, 170, 156],
    paint(u, v, seed) {
      // Mármol antiguo: losas quebradas y gastadas, con tierra y pasto donde faltan pedazos.
      const edge = Math.min(u, 1 - u, v, 1 - v);
      const broken = fbm(u, v, seed + 23, 3, 2);
      if (broken > 0.64) return mix([104, 88, 64], [92, 112, 60], fbm(u, v, seed, 6, 2));
      if (edge < 0.03) return [96, 92, 84];
      const crack = cellEdge(u, v, 811, 3);
      if (crack < 0.012) return [104, 98, 90];
      let color = mix([178, 172, 158], [214, 208, 194], fbm(u, v, seed, 2, 2));
      if (periodicNoise(u, v, 7, seed + 31) > 0.82) color = mix(color, [120, 140, 90], 0.35);
      return color;
    },
  },
  [Terrain.StoneTiles]: {
    varies: false,
    base: [132, 130, 124],
    paint(u, v, seed) {
      // Cuatro losas de piedra gris por tile, junta oscura, bordes gastados.
      return slabs(u, v, seed, 2, [112, 110, 104], [156, 152, 144], [70, 68, 64], (color) => color);
    },
  },
  [Terrain.Granite]: {
    varies: false,
    base: [150, 128, 124],
    paint(u, v, seed) {
      // Una losa de granito por tile: rosado grisáceo con granos negros y blancos.
      return slabs(u, v, seed, 1, [138, 114, 110], [168, 144, 138], [84, 72, 70], (color, x, y) => {
        const grain = hash(Math.floor(x * 40), Math.floor(y * 40), seed);
        if (grain > 0.9) return [44, 40, 42];
        if (grain < 0.07) return [232, 226, 222];
        return color;
      });
    },
  },
  [Terrain.Sandstone]: {
    varies: false,
    base: [204, 176, 128],
    paint(u, v, seed) {
      // Bloques de arenisca alargados y trabados, con vetas horizontales de color.
      const rows = 3;
      const row = Math.floor(v * rows);
      const shifted = u + (row % 2) * 0.5;
      const fu = (shifted * 2) % 1;
      const fv = v * rows - row;
      if (Math.min(fu, 1 - fu) < 0.025 || Math.min(fv, 1 - fv) < 0.05) return [150, 120, 84];
      const id = hash(Math.floor(shifted * 2), row, seed);
      let color = mix([192, 160, 112], [222, 196, 148], id);
      const band = Math.sin((v * 9 + fbm(u, v, seed, 4, 2)) * Math.PI);
      if (band > 0.8) color = shade(color, 1.06);
      else if (band < -0.85) color = mix(color, [186, 120, 84], 0.35);
      return color;
    },
  },
  [Terrain.ShallowWater]: {
    varies: true,
    base: [104, 180, 202],
    paint(u, v, seed) {
      // Agua de orilla: turquesa y clara, se ve el fondo de arena y piedritas.
      const depth = fbm(u, v, seed, 2, 3);
      let color = mix([84, 160, 190], [132, 200, 216], depth);
      if (periodicNoise(u, v, 10, seed + 5) > 0.84) color = mix(color, [176, 186, 150], 0.35);
      const wave = periodicNoise(u * 1.3 + v * 0.4, v, 6, seed + 9);
      if (Math.abs(wave - 0.5) < 0.025) color = mix(color, [214, 240, 244], 0.65);
      return color;
    },
  },
  [Terrain.Salt]: {
    varies: true,
    base: [226, 222, 210],
    paint(u, v, seed) {
      // Salina: costra blanca con polígonos levantados y manchas ocres.
      const tone = fbm(u, v, seed, 3, 2);
      let color = mix([210, 204, 190], [244, 242, 234], tone);
      const crack = cellEdge(u, v, 907, 4);
      if (crack < 0.03) color = shade(color, 1.05);
      else if (crack < 0.05) color = shade(color, 0.86);
      if (periodicNoise(u, v, 6, seed + 13) > 0.82) color = mix(color, [200, 176, 130], 0.3);
      return color;
    },
  },
  [Terrain.Lava]: {
    varies: true,
    base: [214, 82, 24],
    paint(u, v, seed) {
      // Lava: naranja que hierve, con placas de costra oscura y grietas incandescentes.
      const heat = fbm(u, v, seed, 2, 3);
      const crust = fbm(u, v, seed + 3, 2, 2);
      if (crust > 0.68) {
        const crack = cellEdge(u, v, seed + 5, 4);
        if (crack < 0.03) return [255, 170, 60];
        return mix([34, 24, 22], [78, 46, 34], fbm(u, v, seed + 7, 5, 2));
      }
      let color = mix([196, 54, 18], [255, 168, 44], heat);
      if (heat > 0.72) color = mix(color, [255, 232, 140], (heat - 0.72) * 3);
      return color;
    },
  },
  [Terrain.Ash]: {
    varies: true,
    base: [96, 92, 90],
    paint(u, v, seed) {
      // Ceniza volcánica: gris oscuro y polvoriento, con brasas apagadas y piedra pómez.
      const tone = fbm(u, v, seed, 3, 3);
      let color = mix([70, 66, 66], [128, 122, 118], tone);
      const speck = periodicNoise(u, v, 14, seed + 5);
      if (speck > 0.92) color = [168, 70, 40];
      else if (speck < 0.06) color = [40, 38, 38];
      return color;
    },
  },
  [Terrain.Gravel]: {
    varies: true,
    base: [146, 138, 126],
    paint(u, v, seed) {
      // Grava: piedras chicas sueltas de varios grises y pardos.
      const pebble = periodicNoise(u, v, 18, seed + 3);
      const tone = hash(Math.floor(u * 18), Math.floor(v * 18), seed);
      let color = mix([112, 106, 98], [184, 176, 162], tone);
      if (pebble < 0.25) color = shade(color, 0.78);
      else if (pebble > 0.8) color = shade(color, 1.12);
      return color;
    },
  },
  // ── Transiciones: dos suelos mezclados, como en el Age of Empires ──
  [Terrain.SnowyGrass]: {
    varies: true,
    base: [150, 178, 150],
    paint(u, v, seed) {
      // Pasto con nieve en los pozos: manchones blancos de borde irregular y briznas asomando.
      const grass = STYLES[Terrain.Grass].paint(u, v, seed + 3);
      const snow = STYLES[Terrain.Snow].paint(u, v, seed + 5);
      const cover = fbm(u, v, seed + 11, 3, 3) + (periodicNoise(u, v, 14, seed + 13) - 0.5) * 0.18;
      if (cover > 0.56) return snow;
      if (cover > 0.5) return mix(grass, snow, 0.55);
      return shade(mix(grass, [160, 176, 168], 0.18), 1.02);
    },
  },
  [Terrain.SandyGrass]: {
    varies: true,
    base: [164, 168, 100],
    paint(u, v, seed) {
      // Arena con matas de pasto: el pasto en manchas, ralo en los bordes.
      const sand = STYLES[Terrain.Sand].paint(u, v, seed + 3);
      const grass = STYLES[Terrain.DryGrass].paint(u, v, seed + 5);
      const tuft = fbm(u, v, seed + 17, 3, 3);
      const blade = periodicNoise(u, v * 0.4, 20, seed + 19);
      if (tuft > 0.55 || (tuft > 0.44 && blade > 0.6)) return mix(grass, [92, 132, 60], 0.3);
      if (blade > 0.86) return mix(sand, [120, 140, 70], 0.6);
      return sand;
    },
  },
  [Terrain.Leaves]: {
    varies: true,
    base: [104, 94, 52],
    paint(u, v, seed) {
      // Hojarasca de bosque: tierra oscura cubierta de hojas secas, ocres y alguna verde.
      const tone = fbm(u, v, seed, 3, 2);
      let color = mix([70, 58, 34], [112, 92, 52], tone);
      const leaf = periodicNoise(u, v, 16, seed + 3);
      const hue = periodicNoise(u, v, 7, seed + 7);
      if (leaf > 0.62) {
        const tint: Rgb = hue < 0.35 ? [168, 112, 44] : hue < 0.7 ? [140, 120, 52] : [92, 118, 46];
        color = mix(color, tint, 0.55 + (leaf - 0.62) * 1.2);
      } else if (leaf < 0.2) color = shade(color, 0.82);
      if (fbm(u, v, seed + 21, 2, 2) > 0.68) color = mix(color, [74, 112, 46], 0.4);
      return color;
    },
  },
  [Terrain.SparseGrass]: {
    varies: true,
    base: [112, 116, 64],
    paint(u, v, seed) {
      // Pasto ralo: tierra con matas de pasto (entre el pasto y la tierra o la piedra).
      const dirt = STYLES[Terrain.Dirt].paint(u, v, seed + 3);
      const grass = STYLES[Terrain.Grass].paint(u, v, seed + 5);
      const tuft = fbm(u, v, seed + 23, 3, 3);
      const blade = periodicNoise(u, v * 0.4, 22, seed + 29);
      if (tuft > 0.52) return grass;
      if (tuft > 0.4 && blade > 0.55) return mix(grass, dirt, 0.25);
      return dirt;
    },
  },
};

/**
 * Losas cuadradas (`count` × `count` por tile) con junta y un leve bisel;
 * `detail` agrega la textura propia de la piedra.
 */
function slabs(
  u: number,
  v: number,
  seed: number,
  count: number,
  dark: Rgb,
  light: Rgb,
  joint: Rgb,
  detail: (color: Rgb, u: number, v: number) => Rgb,
): Rgb {
  const cu = u * count;
  const cv = v * count;
  const fu = cu - Math.floor(cu);
  const fv = cv - Math.floor(cv);
  const edge = Math.min(fu, 1 - fu, fv, 1 - fv);
  if (edge < 0.03 * count) return joint;
  const id = hash(Math.floor(cu), Math.floor(cv), seed);
  let color = mix(dark, light, 0.3 + id * 0.5 + (fbm(u, v, seed, 4, 2) - 0.5) * 0.4);
  if (edge < 0.08 * count) color = shade(color, fu < 0.5 || fv < 0.5 ? 1.08 : 0.9);
  return detail(color, u, v);
}

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
