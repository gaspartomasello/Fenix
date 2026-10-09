/** Paleta de colores de ropa disponibles al crear un personaje. */
export const CLOTH_HUES = [
  0x8b2e2e, 0x2e4f8b, 0x2e7a3e, 0x7a5a2e, 0x5e2e7a, 0x2e7a7a, 0x8b7a2e, 0x4a4a4a,
] as const;

export const SKIN_TONES = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524] as const;

export const HAIR_HUES = [0x2b1d0e, 0x6b4423, 0xb5884b, 0xd9c27e, 0x8a8a8a, 0x8b2e1a] as const;

export interface Appearance {
  readonly clothHue: number;
  readonly skinTone: number;
  readonly hairHue: number;
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
    (HAIR_HUES as readonly unknown[]).includes(v.hairHue)
  );
}
