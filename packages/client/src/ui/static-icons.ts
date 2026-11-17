import { drawStatic, type PixelImage } from '@fenix/art';
import type { StaticKind } from '@fenix/shared/world/statics';
import { toCanvas } from '../platform/canvas';

const cache = new Map<StaticKind, string>();
/** Lado del cuadrado del dibujo (en píxeles). */
const ICON_SIZE = 112;

/**
 * Dibujo de una pieza fija del mundo (un mueble, un árbol, una pared) como
 * imagen para la interfaz, recortado a lo que tiene pintado: así un árbol
 * alto y una banqueta llenan su casillero igual.
 */
export function staticIconUrl(kind: StaticKind): string {
  let url = cache.get(kind);
  if (!url) {
    url = cropped(drawStatic(kind, 0)).toDataURL();
    cache.set(kind, url);
  }
  return url;
}

function cropped(image: PixelImage): HTMLCanvasElement {
  const full = toCanvas(image);
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++)
      if (image.alphaAt(x, y) > 16) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  if (right < 0) return full;
  const width = right - left + 1;
  const height = bottom - top + 1;
  // Se acomoda en un cuadrado: lo grande se achica y lo chico se agranda (hasta el triple).
  const scale = Math.min(ICON_SIZE / width, ICON_SIZE / height, 3);
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return full;
  ctx.imageSmoothingEnabled = scale < 1;
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  ctx.drawImage(full, left, top, width, height, (ICON_SIZE - w) / 2, ICON_SIZE - h, w, h);
  return canvas;
}
