import {
  HAIR_STYLES,
  SKIN_TONES,
  type Appearance,
  type Gender,
  type HairStyle,
} from '@fenix/shared/character/appearance';
import { hexColor } from './dom';

/**
 * El retrato pintado (dibujos hechos con IA a partir de descripciones propias;
 * ver `tools/paperdoll/build.py`): el cuerpo con su tono de piel y encima el
 * peinado, pintado en gris y teñido acá con el color de pelo. Los peinados que
 * todavía no tienen dibujo no se ofrecen en el retrato.
 */
const FILES = import.meta.glob<string>('../assets/paperdoll/*.webp', {
  eager: true,
  import: 'default',
});

const file = (name: string): string | undefined => FILES[`../assets/paperdoll/${name}.webp`];

/** Los peinados con dibujo para cada cuerpo (además de pelado, que es el cuerpo solo). */
export function portraitHairStyles(gender: Gender): HairStyle[] {
  return HAIR_STYLES.filter((s) => s === 'bald' || file(`hair-${gender}-${s}`) !== undefined);
}

/** ¿Hay retrato pintado para esta apariencia? */
export function hasPortrait(appearance: Appearance): boolean {
  const gender = appearance.gender ?? 'male';
  const style = appearance.hairStyle ?? 'short';
  return (
    file(`body-${gender}-0`) !== undefined &&
    (style === 'bald' || file(`hair-${gender}-${style}`) !== undefined)
  );
}

const images = new Map<string, Promise<HTMLImageElement>>();

function load(src: string): Promise<HTMLImageElement> {
  let image = images.get(src);
  if (!image) {
    image = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      img.src = src;
    });
    images.set(src, image);
  }
  return image;
}

/** El peinado gris teñido del color de pelo (respetando su luz y su sombra). */
function tinted(hair: HTMLImageElement, color: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = hair.naturalWidth;
  canvas.height = hair.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(hair, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = hexColor(color);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(hair, 0, 0);
  return canvas;
}

let drawing = 0;

/**
 * Dibuja el retrato en el canvas (a su tamaño natural; el CSS lo achica). Si
 * mientras carga se pide otro, gana el último.
 */
export async function drawPaintedPortrait(
  canvas: HTMLCanvasElement,
  appearance: Appearance,
): Promise<void> {
  const ticket = ++drawing;
  const gender = appearance.gender ?? 'male';
  const tone = Math.max(0, SKIN_TONES.indexOf(appearance.skinTone as (typeof SKIN_TONES)[number]));
  const style = appearance.hairStyle ?? 'short';
  const bodySrc = file(`body-${gender}-${tone}`);
  const hairSrc = style === 'bald' ? undefined : file(`hair-${gender}-${style}`);
  if (!bodySrc) return;
  const [body, hair] = await Promise.all([load(bodySrc), hairSrc ? load(hairSrc) : null]);
  if (ticket !== drawing) return;
  canvas.width = body.naturalWidth;
  canvas.height = body.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(body, 0, 0);
  if (hair) ctx.drawImage(tinted(hair, appearance.hairHue), 0, 0);
}
