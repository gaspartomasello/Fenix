/** Herramientas de dibujo pixel a pixel sobre canvas, sin dependencias. */

export type Rgb = readonly [number, number, number];

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D no disponible');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

export function hexToRgb(hex: number): Rgb {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

/** Aclara (factor > 1) u oscurece (factor < 1) un color. */
export function shade([r, g, b]: Rgb, factor: number): Rgb {
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  return [clamp(r * factor), clamp(g * factor), clamp(b * factor)];
}

export function css([r, g, b]: Rgb, alpha = 1): string {
  return alpha === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

/** PRNG determinístico para que el arte generado sea siempre el mismo. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Agrega un contorno de 1 px alrededor de todo lo dibujado (estilo pixel art). */
export function outline(canvas: HTMLCanvasElement, color: Rgb, alpha = 0.85): void {
  const ctx = context2d(canvas);
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const src = new Uint8ClampedArray(image.data);
  const filled = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && (src[(y * width + x) * 4 + 3] ?? 0) > 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (filled(x, y)) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
        const i = (y * width + x) * 4;
        image.data[i] = color[0];
        image.data[i + 1] = color[1];
        image.data[i + 2] = color[2];
        image.data[i + 3] = Math.round(alpha * 255);
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}

export function mirrored(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = createCanvas(canvas.width, canvas.height);
  const ctx = context2d(out);
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(canvas, 0, 0);
  return out;
}
