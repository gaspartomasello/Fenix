import type { CreatureKind } from '@fenix/shared/creatures/creature-catalog';
import { PixelImage, type Rgb } from './pixel-art';

/** Cómo se tiñe una criatura de las tierras heladas: de hielo azul o de nieve blanca. */
type Frost = 'ice' | 'snow';

/**
 * Las criaturas de la nieve y del calabozo de hielo tienen el cuerpo de otra
 * (el yeti, el de un gorila; el dragón de hielo, el de un dragón joven…),
 * teñido de hielo o de nieve. Así comparten esqueleto, andares y cuerpo muerto.
 */
export const FROST_VARIANTS: Readonly<
  Partial<Record<CreatureKind, { readonly base: CreatureKind; readonly frost: Frost }>>
> = {
  yeti: { base: 'gorilla', frost: 'snow' },
  'frost-troll': { base: 'troll', frost: 'snow' },
  'ice-spider': { base: 'giant-spider', frost: 'ice' },
  'ice-elemental': { base: 'water-elemental', frost: 'ice' },
  'frost-lich': { base: 'lich', frost: 'ice' },
  'ice-wyrm': { base: 'drake', frost: 'ice' },
};

/** La criatura de la que toma el cuerpo (la misma, si no es de la nieve). */
export function frostBase(kind: CreatureKind): CreatureKind {
  return FROST_VARIANTS[kind]?.base ?? kind;
}

const GRADIENTS: Readonly<Record<Frost, readonly [Rgb, Rgb, Rgb]>> = {
  ice: [
    [26, 42, 78],
    [98, 152, 204],
    [218, 240, 255],
  ],
  snow: [
    [62, 66, 78],
    [178, 186, 200],
    [250, 252, 255],
  ],
};

/**
 * Tiñe un dibujo por su luz: lo oscuro (el contorno) queda, el resto pasa a
 * la escala de hielo o de nieve; lo que brillaba con color (ojos, fuego)
 * queda como un brillo celeste.
 */
export function frosted(image: PixelImage, kind: CreatureKind): PixelImage {
  const frost = FROST_VARIANTS[kind]?.frost;
  if (!frost) return image;
  const [dark, mid, light] = GRADIENTS[frost];
  const data = new Uint8ClampedArray(image.data);
  // La luz se estira entre lo más oscuro y lo más claro del dibujo: un cuerpo
  // oscuro (el gorila) también queda blanco como la nieve.
  const lums: number[] = [];
  for (let i = 0; i < data.length; i += 4)
    if ((data[i + 3] ?? 0) > 0) {
      const l =
        (0.3 * (data[i] ?? 0) + 0.59 * (data[i + 1] ?? 0) + 0.11 * (data[i + 2] ?? 0)) / 255;
      if (l >= 0.11) lums.push(l);
    }
  lums.sort((a, b) => a - b);
  const low = lums[Math.floor(lums.length * 0.05)] ?? 0.1;
  const high = lums[Math.floor(lums.length * 0.95)] ?? 0.82;
  const span = Math.max(0.15, high - low);
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) === 0) continue;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
    if (lum < 0.11) continue;
    const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    let out: Rgb;
    if (saturation > 0.55 && lum > 0.45) out = [176, 238, 255];
    else {
      const t = Math.max(0, Math.min(1, 0.15 + ((lum - low) / span) * 0.8));
      const [a, c, u] = t < 0.5 ? [dark, mid, t * 2] : [mid, light, (t - 0.5) * 2];
      const mix = (k: 0 | 1 | 2): number => Math.round(a[k] + (c[k] - a[k]) * u);
      out = [mix(0), mix(1), mix(2)];
    }
    data[i] = out[0];
    data[i + 1] = out[1];
    data[i + 2] = out[2];
  }
  return new PixelImage(image.width, image.height, data);
}
