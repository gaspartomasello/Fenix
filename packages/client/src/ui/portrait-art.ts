import {
  FACE_COUNT,
  FACIAL_HAIR,
  HAIR_STYLES,
  SKIN_TONES,
  type Appearance,
  type FacialHair,
  type Gender,
  type HairStyle,
} from '@fenix/shared/character/appearance';

/**
 * El retrato pintado (dibujos hechos con IA a partir de descripciones propias;
 * ver `tools/paperdoll/build.py`): el cuerpo y el rostro con su tono de piel,
 * la barba y el peinado. Por ahora el pelo y la barba conservan el color con
 * que se pintaron. Lo que todavía no tiene dibujo no se ofrece en el retrato.
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

/** Las barbas con dibujo para cada cuerpo (además de sin barba). */
export function portraitBeards(gender: Gender): FacialHair[] {
  return FACIAL_HAIR.filter((b) => b === 'none' || file(`beard-${gender}-${b}`) !== undefined);
}

/** Cuántos rostros hay para cada cuerpo (0: el del cuerpo, sin elegir). */
export function portraitFaces(gender: Gender): number {
  let count = 0;
  while (count < FACE_COUNT && file(`face-${gender}-${count}-0`) !== undefined) count++;
  return count;
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

/** El busto (cabeza y hombros) dentro del retrato entero, en píxeles del dibujo. */
const BUST = { x: 120, y: 24, width: 184, height: 210 };

let drawing = 0;

/**
 * Dibuja el retrato en el canvas: entero, o solo el busto para elegir rostro,
 * peinado y barba (a su tamaño natural; el CSS lo achica). Si mientras carga
 * se pide otro, gana el último.
 */
export async function drawPaintedPortrait(
  canvas: HTMLCanvasElement,
  appearance: Appearance,
  framing: 'full' | 'bust' = 'full',
): Promise<void> {
  const ticket = ++drawing;
  const gender = appearance.gender ?? 'male';
  const tone = Math.max(0, SKIN_TONES.indexOf(appearance.skinTone as (typeof SKIN_TONES)[number]));
  const style = appearance.hairStyle ?? 'short';
  const beard = gender === 'male' ? (appearance.facialHair ?? 'none') : 'none';
  const sources = [
    file(`body-${gender}-${tone}`),
    file(`face-${gender}-${appearance.face ?? 0}-${tone}`),
    beard === 'none' ? undefined : file(`beard-${gender}-${beard}`),
    style === 'bald' ? undefined : file(`hair-${gender}-${style}`),
  ];
  if (!sources[0]) return;
  const layers = await Promise.all(sources.map((src) => (src ? load(src) : null)));
  if (ticket !== drawing) return;
  const body = layers[0];
  if (!body) return;
  const area =
    framing === 'bust'
      ? BUST
      : { x: 0, y: 0, width: body.naturalWidth, height: body.naturalHeight };
  canvas.width = area.width;
  canvas.height = area.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Cuerpo, rostro, barba y peinado, en ese orden.
  for (const layer of layers) if (layer) ctx.drawImage(layer, -area.x, -area.y);
}
