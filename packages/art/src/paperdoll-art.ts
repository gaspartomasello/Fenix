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
import { Camera, VolumeCanvas } from './volume';

/** Cuántas veces más grande que el sprite del mundo se dibuja la ventana de personaje. */
export const PAPERDOLL_DETAIL = 4;

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
  return drawCharacterFrame(
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
        (width * detail) / 2,
        (CHARACTER_FEET_Y + 2) * detail,
        0.12,
        PERSON_ZOOM * detail,
      );
      const canvas = new VolumeCanvas(width * detail, height * detail, camera);
      canvas.detail = detail;
      return canvas;
    },
    hues,
  );
}

export const PAPERDOLL_WIDTH = CHARACTER_ART_WIDTH * PAPERDOLL_DETAIL;
export const PAPERDOLL_HEIGHT = CHARACTER_ART_HEIGHT * PAPERDOLL_DETAIL;
