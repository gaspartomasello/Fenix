import type { PixelImage } from '@fenix/art';

/** Convierte un `PixelImage` en canvas. Puente entre el arte (memoria) y el DOM. */
export function toCanvas(image: PixelImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
    0,
    0,
  );
  return canvas;
}
