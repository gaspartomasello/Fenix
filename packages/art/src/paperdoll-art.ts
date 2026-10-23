import type { Appearance } from '@fenix/shared/character/appearance';
import type { NpcRole } from '@fenix/shared/economy/vendors';
import { Direction } from '@fenix/shared/geometry/direction';
import type { EquipmentHues, EquipmentLook } from '@fenix/shared/protocol/messages';
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

/**
 * Los últimos dibujos hechos, por aspecto y equipo: volver a mostrar el mismo
 * personaje (o las siluetas para agarrar prendas) es instantáneo.
 */
const CACHE_SIZE = 32;
const cache = new Map<string, PixelImage>();

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
  const key = JSON.stringify([
    appearance,
    sortedEntries(equipment),
    role,
    sortedEntries(hues),
    detail,
  ]);
  const cached = cache.get(key);
  if (cached) {
    // Al frente de la cola: es el último usado.
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const scale = detail;
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
  // Grande: con sombreado continuo (sin franjas). Chico (las siluetas para agarrar prendas): tal cual.
  const image = detail > 1 ? withSmoothShading(draw) : draw();
  cache.set(key, image);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return image;
}

/** Las entradas en orden fijo, para que el mismo equipo dé siempre la misma clave. */
function sortedEntries(record: Readonly<Record<string, unknown>>): [string, unknown][] {
  return Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

export const PAPERDOLL_WIDTH = CHARACTER_ART_WIDTH * PAPERDOLL_DETAIL;
export const PAPERDOLL_HEIGHT = CHARACTER_ART_HEIGHT * PAPERDOLL_DETAIL;
