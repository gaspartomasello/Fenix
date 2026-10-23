import { PixelImage, mixColors, shade, type Rgb } from './pixel-art';
import { noise } from './volume';

/**
 * Ventanas de los recipientes, como en UO: la mochila de cuero, la bolsa con
 * su cordón y el cofre abierto con fieltro verde y herrajes dorados. Cada una
 * es un dibujo (al doble de detalle) con un hueco del tamaño de la grilla de
 * la mochila donde van los objetos. Medidas en pixeles de pantalla.
 */
export interface ContainerArt {
  readonly width: number;
  readonly height: number;
  /** Dónde van los objetos (siempre del tamaño de la mochila: 240 × 160). */
  readonly interior: { readonly x: number; readonly y: number };
  draw(): PixelImage;
}

const DETAIL = 2;
const OUTLINE: Rgb = [16, 11, 8];
const INSIDE = { width: 240, height: 160 } as const;

/** Distancia con signo a un rectángulo redondeado (positiva adentro). */
function roundedBox(
  x: number,
  y: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
): number {
  const cx = Math.max(x0 + r, Math.min(x1 - r, x));
  const cy = Math.max(y0 + r, Math.min(y1 - r, y));
  const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const corner = Math.hypot(x - cx, y - cy);
  if (!inside) return -corner;
  const edge = Math.min(x - x0, x1 - x, y - y0, y1 - y);
  return corner > 0 ? r - corner : edge;
}

/** Recorre cada pixel (en medidas de pantalla) y pinta lo que devuelve `paint`. */
function paintImage(
  width: number,
  height: number,
  paint: (x: number, y: number) => Rgb | null,
): PixelImage {
  const image = new PixelImage(width * DETAIL, height * DETAIL);
  for (let py = 0; py < image.height; py++)
    for (let px = 0; px < image.width; px++) {
      const color = paint((px + 0.5) / DETAIL, (py + 0.5) / DETAIL);
      if (color) image.set(px, py, color);
    }
  image.outline(OUTLINE, 1);
  return image;
}

/** Ruido suave (interpolado entre celdas), para manchas sin bordes cuadrados. */
function smooth(x: number, y: number, size: number, seed: number): number {
  const gx = x / size;
  const gy = y / size;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = noise(x0, y0, seed) * (1 - sx) + noise(x0 + 1, y0, seed) * sx;
  const b = noise(x0, y0 + 1, seed) * (1 - sx) + noise(x0 + 1, y0 + 1, seed) * sx;
  return a * (1 - sy) + b * sy;
}

/** Cuero: grano fino, manchas de uso y una luz suave desde arriba a la izquierda. */
function leather(base: Rgb, x: number, y: number, light: number): Rgb {
  const grain = noise(Math.floor(x * 1.5), Math.floor(y * 1.5), 3) * 0.06;
  const wear = smooth(x, y, 16, 7) * 0.12 + smooth(x, y, 5, 8) * 0.05;
  return shade(base, light + grain + wear - 0.1);
}

/** Costura: puntadas claras a lo largo de una línea. */
function stitched(d: number, along: number, at: number): boolean {
  return Math.abs(d - at) < 0.7 && Math.floor(along / 4) % 2 === 0;
}

/** Herraje dorado: brillo arriba, sombra abajo. */
function gold(x: number, y: number, top: number, bottom: number): Rgb {
  const t = Math.max(0, Math.min(1, (y - top) / Math.max(1, bottom - top)));
  const shine = noise(Math.floor(x / 3), Math.floor(y / 3), 11) * 0.12;
  return mixColors([252, 214, 112], [150, 98, 30], t * 0.9 + shine);
}

// ── Mochila ───────────────────────────────────────────────────────────

const BACKPACK = { width: 292, height: 256, interior: { x: 26, y: 70 } } as const;
const PACK_LEATHER: Rgb = [132, 90, 52];

export const BACKPACK_ART: ContainerArt = {
  ...BACKPACK,
  draw: () =>
    paintImage(BACKPACK.width, BACKPACK.height, (x, y) => {
      const { x: ix, y: iy } = BACKPACK.interior;
      // La tapa: una solapa redondeada arriba, con dos correas y hebillas.
      const flap = roundedBox(x, y, 36, 2, BACKPACK.width - 36, 58, 24);
      const body = roundedBox(x, y, 6, 34, BACKPACK.width - 6, BACKPACK.height - 4, 30);
      if (flap >= 0 && y < 52) {
        for (const sx of [74, BACKPACK.width - 84]) {
          if (x >= sx && x <= sx + 10 && y > 20) {
            if (y > 38 && y < 50 && (x < sx + 2 || x > sx + 8 || y < 40 || y > 48))
              return gold(x, y, 38, 50);
            return leather([96, 62, 34], x, y, 0.95);
          }
        }
        if (stitched(flap, x, 5)) return [212, 178, 128];
        return leather(PACK_LEATHER, x, y, 1.05 - y / 200 + Math.min(0.15, flap / 40));
      }
      if (body < 0) return null;
      // Adentro: el hueco oscuro donde van las cosas, con la sombra del borde.
      const inside = roundedBox(
        x,
        y,
        ix - 4,
        iy - 4,
        ix + INSIDE.width + 4,
        iy + INSIDE.height + 4,
        10,
      );
      if (inside >= 0) {
        const depth = Math.min(1, inside / 14);
        return leather([58, 38, 22], x, y, 0.62 + depth * 0.32);
      }
      if (stitched(body, x + y, 6)) return [212, 178, 128];
      if (inside > -3) return leather([74, 48, 26], x, y, 0.8);
      return leather(PACK_LEATHER, x, y, 0.9 + Math.min(0.2, body / 30) - y / 900);
    }),
};

// ── Bolsa ─────────────────────────────────────────────────────────────

const POUCH = { width: 292, height: 250, interior: { x: 26, y: 62 } } as const;
const POUCH_LEATHER: Rgb = [150, 110, 66];

export const POUCH_ART: ContainerArt = {
  ...POUCH,
  draw: () =>
    paintImage(POUCH.width, POUCH.height, (x, y) => {
      const { x: ix, y: iy } = POUCH.interior;
      const cx = POUCH.width / 2;
      // El cuello fruncido arriba, con el cordón atado.
      const neck = Math.abs(x - cx) < 70 - (y - 4) * 0.4 && y > 4 && y < 46;
      const ropeY = 40 + Math.sin((x - cx) / 9) * 1.5;
      if (Math.abs(y - ropeY) < 2.4 && Math.abs(x - cx) < 78) {
        const twist = Math.floor((x + y) / 3) % 2 ? 0.85 : 1.05;
        return shade([196, 160, 102], twist);
      }
      // El nudo y las puntas del cordón que cuelgan.
      if (Math.hypot(x - cx - 60, y - 41) < 6) return shade([196, 160, 102], 0.95);
      if (Math.abs(x - cx - 62 - (y - 44) * 0.25) < 2 && y > 44 && y < 70)
        return shade([186, 150, 96], 0.9);
      if (neck) {
        const fold = Math.sin((x - cx) / 4.5) * 0.12;
        return leather(POUCH_LEATHER, x, y, 0.9 + fold - (46 - y) / 200);
      }
      // El cuerpo: un saco ancho, bien redondeado abajo y un poco más angosto arriba.
      const pinch = Math.max(0, 52 - y) * 0.5;
      const body = roundedBox(x, y, 4 + pinch, 40, POUCH.width - 4 - pinch, POUCH.height - 4, 52);
      const nx = (x - cx) / (POUCH.width / 2);
      if (body < 0) return null;
      const inside = roundedBox(
        x,
        y,
        ix - 2,
        iy - 2,
        ix + INSIDE.width + 2,
        iy + INSIDE.height + 2,
        30,
      );
      if (inside >= 0) return leather([62, 44, 26], x, y, 0.6 + Math.min(1, inside / 16) * 0.32);
      if (inside > -3) return leather([86, 60, 34], x, y, 0.8);
      return leather(POUCH_LEATHER, x, y, 0.88 + Math.min(0.2, body / 40) - nx * 0.1);
    }),
};

// ── Cofre ─────────────────────────────────────────────────────────────

const CHEST = { width: 300, height: 300, interior: { x: 30, y: 116 } } as const;
const CHEST_WOOD: Rgb = [104, 62, 30];
const FELT: Rgb = [40, 96, 50];

/** Fieltro verde: un tejido muy fino, más oscuro hacia los bordes. */
function felt(x: number, y: number, depth: number): Rgb {
  const fiber = noise(Math.floor(x * 1.6), Math.floor(y * 1.6), 5) * 0.08;
  return shade(FELT, 0.7 + Math.min(1, depth / 18) * 0.35 + fiber);
}

/** Madera del cofre: vetas horizontales. */
function chestWood(x: number, y: number, light: number): Rgb {
  const grain = noise(Math.floor(x / 14), Math.floor(y * 0.9), 9) * 0.16;
  return shade(CHEST_WOOD, light + grain);
}

export const CHEST_ART: ContainerArt = {
  ...CHEST,
  draw: () =>
    paintImage(CHEST.width, CHEST.height, (x, y) => {
      const { x: ix, y: iy } = CHEST.interior;
      const w = CHEST.width;
      // La tapa abierta, arriba: madera con fieltro y un herraje en cada esquina.
      const lid = roundedBox(x, y, 12, 4, w - 12, 100, 8);
      if (lid >= 0) {
        if (lid < 3) return gold(x, y, 4, 100);
        const panel = roundedBox(x, y, 30, 18, w - 30, 92, 4);
        if (panel >= 0) return felt(x, y, panel);
        if (panel > -3) return gold(x, y, 18, 92);
        // Herrajes de las esquinas (un ángulo dorado con remaches).
        const cornerX = Math.min(x - 12, w - 12 - x);
        const cornerY = Math.min(y - 4, 100 - y);
        if (cornerX < 22 && cornerY < 22 && (cornerX < 6 || cornerY < 6)) return gold(x, y, 4, 100);
        // La cerradura del borde de arriba.
        if (Math.abs(x - w / 2) < 12 && y < 16) return gold(x, y, 4, 16);
        return chestWood(x, y, 0.95 - y / 400);
      }
      // La caja.
      const box = roundedBox(x, y, 4, 102, w - 4, CHEST.height - 4, 6);
      if (box < 0) return null;
      if (box < 3) return gold(x, y, 102, CHEST.height);
      const inside = roundedBox(
        x,
        y,
        ix - 2,
        iy - 2,
        ix + INSIDE.width + 2,
        iy + INSIDE.height + 2,
        3,
      );
      if (inside >= 0) return felt(x, y, inside);
      if (inside > -3) return gold(x, y, iy, iy + INSIDE.height);
      const cornerX = Math.min(x - 4, w - 4 - x);
      const cornerY = Math.min(y - 102, CHEST.height - 4 - y);
      if (cornerX < 24 && cornerY < 24 && (cornerX < 7 || cornerY < 7))
        return gold(x, y, 102, CHEST.height);
      // El cerrojo del frente.
      if (Math.abs(x - w / 2) < 14 && y > CHEST.height - 18) {
        if (Math.abs(x - w / 2) < 4 && y > CHEST.height - 14 && y < CHEST.height - 8)
          return [40, 26, 10];
        return gold(x, y, CHEST.height - 18, CHEST.height - 4);
      }
      // Remaches dorados a lo largo del borde.
      if (
        box > 5 &&
        box < 11 &&
        Math.floor((x + y) / 22) % 2 === 0 &&
        Math.hypot((x % 22) - 11, 0) < 2.4
      )
        return gold(x, y, 102, CHEST.height);
      return chestWood(x, y, 0.92 - (y - 102) / 900);
    }),
};
