import {
  Direction,
  type Appearance,
  type EquipmentHues,
  type EquipmentLook,
  type NpcRole,
} from '@fenix/shared';
import { drawCharacterFrame } from './character-art';
import {
  CHARACTER_ART_HEIGHT,
  CHARACTER_ART_WIDTH,
  CHARACTER_FEET_Y,
  PERSON_ZOOM,
} from './humanoid-rig';
import type { PixelImage } from './pixel-art';
import { Camera, VolumeCanvas, withSmoothShading } from './volume';

/** Cuántas veces más grande que el sprite del mundo se dibuja la ventana de personaje. */
export const PAPERDOLL_DETAIL = 4;

/** Se dibuja a este múltiplo y después se achica: bordes suaves, sin serrucho. */
const SUPERSAMPLE = 2;

/**
 * El personaje de la ventana de personaje, como en UO: de frente, grande y
 * con detalle. Es el mismo modelo 3D que se ve en el mundo, pero dibujado a
 * `PAPERDOLL_DETAIL` veces la resolución y casi sin inclinación de cámara,
 * así se ve cada prenda (no es el sprite agrandado).
 */
export function drawPaperdoll(
  appearance: Appearance,
  equipment: EquipmentLook,
  role: NpcRole | null = null,
  hues: EquipmentHues = {},
  detail = PAPERDOLL_DETAIL,
): PixelImage {
  // Grande: sombreado continuo y dibujado al doble para achicarlo con bordes suaves.
  // Chico (las máscaras para agarrar prendas): tal cual.
  const sample = detail > 1 ? SUPERSAMPLE : 1;
  const scale = detail * sample;
  const draw = (): PixelImage =>
    drawCharacterFrame(
      appearance,
      Direction.SouthEast,
      'display',
      equipment,
      role,
      null,
      (width, height) => {
        // Un poco de giro para que se lea el volumen; la cámara casi a la altura del pecho.
        const camera = new Camera(
          0.22,
          (width * scale) / 2,
          (CHARACTER_FEET_Y + 2) * scale,
          0.12,
          PERSON_ZOOM * scale,
        );
        const canvas = new VolumeCanvas(width * scale, height * scale, camera);
        canvas.detail = scale;
        return canvas;
      },
      hues,
    );
  if (sample === 1) return draw();
  return withSmoothShading(draw).downsample(sample);
}

export const PAPERDOLL_WIDTH = CHARACTER_ART_WIDTH * PAPERDOLL_DETAIL;
export const PAPERDOLL_HEIGHT = CHARACTER_ART_HEIGHT * PAPERDOLL_DETAIL;
