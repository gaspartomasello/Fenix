import { PixelImage } from './pixel-art';

/** Medidas del portal lunar parado: un poco más alto que una persona. */
export const MOONGATE_ART = { width: 52, height: 104, groundY: 98 } as const;

/**
 * El portal lunar: un óvalo de luz parado sobre el piso, blanco en el centro
 * y azul profundo hacia el borde, con un filo oscuro y un halo suave alrededor
 * (así se ve de lejos). Se dibuja pixel a pixel, sin modelo.
 */
export function drawMoongate(): PixelImage {
  const { width, height, groundY } = MOONGATE_ART;
  const image = new PixelImage(width, height);
  const cx = width / 2;
  const rx = 17;
  const ry = 44;
  const cy = groundY - ry - 2;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const r = Math.hypot(dx, dy);
      const o = (y * width + x) * 4;
      if (r <= 1) {
        // Del centro blanco al azul del borde, con un brillo que sube en diagonal.
        const core = Math.max(0, 1 - r * 1.25) ** 1.4;
        const shine = Math.max(0, 1 - Math.hypot(dx + 0.25, dy + 0.35) * 2.2) * 0.35;
        const edge = r > 0.9 ? (r - 0.9) / 0.1 : 0;
        const mix = Math.min(1, core + shine);
        image.data[o] = Math.round((28 + 227 * mix) * (1 - edge * 0.6));
        image.data[o + 1] = Math.round((54 + 201 * mix) * (1 - edge * 0.6));
        image.data[o + 2] = Math.round((196 + 59 * mix) * (1 - edge * 0.35));
        image.data[o + 3] = 255;
      } else if (r <= 1.22) {
        // El halo: azul claro que se desvanece.
        const fade = 1 - (r - 1) / 0.22;
        image.data[o] = 120;
        image.data[o + 1] = 170;
        image.data[o + 2] = 255;
        image.data[o + 3] = Math.round(150 * fade * fade);
      }
    }
  return image;
}
