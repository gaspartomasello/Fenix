/** Paleta de colores de ropa disponibles al crear un personaje. */
export const CLOTH_HUES = [
  0x8b2e2e, 0x2e4f8b, 0x2e7a3e, 0x7a5a2e, 0x5e2e7a, 0x2e7a7a, 0x8b7a2e, 0x4a4a4a,
] as const;

export const SKIN_TONES = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524] as const;

export const HAIR_HUES = [0x2b1d0e, 0x6b4423, 0xb5884b, 0xd9c27e, 0x8a8a8a, 0x8b2e1a] as const;

/** Peinados y barbas. Son opcionales para que los personajes guardados antes sigan valiendo. */
export const HAIR_STYLES = ['short', 'long', 'ponytail', 'bald'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export const HAIR_STYLE_NAMES: Readonly<Record<HairStyle, string>> = {
  short: 'Corto',
  long: 'Largo',
  ponytail: 'Cola de caballo',
  bald: 'Pelado',
};

export const FACIAL_HAIR = ['none', 'mustache', 'beard'] as const;
export type FacialHair = (typeof FACIAL_HAIR)[number];
export const FACIAL_HAIR_NAMES: Readonly<Record<FacialHair, string>> = {
  none: 'Sin barba',
  mustache: 'Bigote',
  beard: 'Barba',
};

export interface Appearance {
  readonly clothHue: number;
  readonly skinTone: number;
  readonly hairHue: number;
  readonly hairStyle?: HairStyle;
  readonly facialHair?: FacialHair;
}

export const DEFAULT_APPEARANCE: Appearance = {
  clothHue: CLOTH_HUES[0],
  skinTone: SKIN_TONES[0],
  hairHue: HAIR_HUES[1],
};

export function isAppearance(value: unknown): value is Appearance {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (CLOTH_HUES as readonly unknown[]).includes(v.clothHue) &&
    (SKIN_TONES as readonly unknown[]).includes(v.skinTone) &&
    (HAIR_HUES as readonly unknown[]).includes(v.hairHue) &&
    (v.hairStyle === undefined || (HAIR_STYLES as readonly unknown[]).includes(v.hairStyle)) &&
    (v.facialHair === undefined || (FACIAL_HAIR as readonly unknown[]).includes(v.facialHair))
  );
}
