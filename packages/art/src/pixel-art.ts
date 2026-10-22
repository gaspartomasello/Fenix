/**
 * Dibujo pixel a pixel sobre un buffer RGBA en memoria. No depende del DOM:
 * el mismo arte se usa en el navegador, en tests y en las herramientas que
 * exportan tilesets para el editor de mapas.
 */

export type Rgb = readonly [number, number, number];

export interface Point {
  readonly x: number;
  readonly y: number;
}

export class PixelImage {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
    data?: Uint8ClampedArray,
  ) {
    this.data = data ?? new Uint8ClampedArray(width * height * 4);
  }

  contains(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  alphaAt(x: number, y: number): number {
    return this.contains(x, y) ? (this.data[(y * this.width + x) * 4 + 3] ?? 0) : 0;
  }

  colorAt(x: number, y: number): Rgb {
    const i = (y * this.width + x) * 4;
    return [this.data[i] ?? 0, this.data[i + 1] ?? 0, this.data[i + 2] ?? 0];
  }

  set(x: number, y: number, [r, g, b]: Rgb, alpha = 255): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.contains(x, y)) return;
    const i = (y * this.width + x) * 4;
    if (alpha >= 255) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
      return;
    }
    // Mezcla sobre lo que ya hay (para sombras y transparencias).
    const a = alpha / 255;
    const prevA = (this.data[i + 3] ?? 0) / 255;
    const outA = a + prevA * (1 - a);
    if (outA === 0) return;
    const mix = (c: number, prev: number): number => (c * a + prev * prevA * (1 - a)) / outA;
    this.data[i] = mix(r, this.data[i] ?? 0);
    this.data[i + 1] = mix(g, this.data[i + 1] ?? 0);
    this.data[i + 2] = mix(b, this.data[i + 2] ?? 0);
    this.data[i + 3] = outA * 255;
  }

  fillRect(x: number, y: number, w: number, h: number, color: Rgb, alpha = 255): void {
    for (let yy = Math.max(0, y); yy < Math.min(this.height, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.width, x + w); xx++) {
        this.set(xx, yy, color, alpha);
      }
    }
  }

  /** Rellena un polígono convexo o cóncavo (regla par-impar, muestreo en el centro del pixel). */
  fillPolygon(points: readonly Point[], color: Rgb | ((x: number, y: number) => Rgb)): void {
    const ys = points.map((p) => p.y);
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(...ys)));
    for (let y = minY; y <= maxY; y++) {
      const cy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (!a || !b || a.y === b.y) continue;
        if (cy >= Math.min(a.y, b.y) && cy < Math.max(a.y, b.y)) {
          xs.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.ceil((xs[k] ?? 0) - 0.5);
        const to = Math.floor((xs[k + 1] ?? 0) - 0.5);
        for (let x = from; x <= to; x++) {
          this.set(x, y, typeof color === 'function' ? color(x, y) : color);
        }
      }
    }
  }

  fillEllipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: Rgb | ((x: number, y: number) => Rgb),
    alpha = 255,
  ): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
          this.set(x, y, typeof color === 'function' ? color(x, y) : color, alpha);
        }
      }
    }
  }

  /** Copia otra imagen encima, respetando su transparencia. */
  draw(source: PixelImage, dx: number, dy: number): void {
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        const a = source.alphaAt(x, y);
        if (a > 0) this.set(dx + x, dy + y, source.colorAt(x, y), a);
      }
    }
  }

  mirrored(): PixelImage {
    const out = new PixelImage(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const from = (y * this.width + x) * 4;
        const to = (y * this.width + (this.width - 1 - x)) * 4;
        out.data.set(this.data.subarray(from, from + 4), to);
      }
    }
    return out;
  }

  /** Agrega un contorno de 1 px alrededor de todo lo dibujado (estilo pixel art). */
  outline(color: Rgb, alpha = 0.85): void {
    const filled = (x: number, y: number): boolean => this.alphaAt(x, y) > 0;
    const marks: [number, number][] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (filled(x, y)) continue;
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
          marks.push([x, y]);
        }
      }
    }
    for (const [x, y] of marks) this.set(x, y, color, Math.round(alpha * 255));
  }
}

export function hexToRgb(hex: number): Rgb {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

/** Aclara (factor > 1) u oscurece (factor < 1) un color. */
export function shade([r, g, b]: Rgb, factor: number): Rgb {
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  return [clamp(r * factor), clamp(g * factor), clamp(b * factor)];
}

export function mixColors(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(
    Math.round,
  ) as unknown as Rgb;
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
