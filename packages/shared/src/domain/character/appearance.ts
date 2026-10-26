/** Paleta de colores de ropa disponibles al crear un personaje. */
export const CLOTH_HUES = [
  0x8b2e2e, 0x2e4f8b, 0x2e7a3e, 0x7a5a2e, 0x5e2e7a, 0x2e7a7a, 0x8b7a2e, 0x4a4a4a,
] as const;

export const SKIN_TONES = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524] as const;

export const HAIR_HUES = [0x2b1d0e, 0x6b4423, 0xb5884b, 0xd9c27e, 0x8a8a8a, 0x8b2e1a] as const;

/** Peinados y barbas. Son opcionales para que los personajes guardados antes sigan valiendo. */
export const HAIR_STYLES = [
  'short',
  'long',
  'ponytail',
  'bald',
  'bob',
  'bun',
  'braid',
  'curly',
  'pigtails',
  'buzz',
  'receding',
  'spiky',
  'mohawk',
  'topknot',
  'shoulder',
  'wavy',
  'side-braid',
  'twin-buns',
] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export const HAIR_STYLE_NAMES: Readonly<Record<HairStyle, string>> = {
  short: 'Corto',
  long: 'Largo',
  ponytail: 'Cola de caballo',
  bald: 'Pelado',
  bob: 'Melena corta',
  bun: 'Rodete',
  braid: 'Trenza',
  curly: 'Rulos',
  pigtails: 'Dos coletas',
  buzz: 'Rapado',
  receding: 'Con entradas',
  spiky: 'En punta',
  mohawk: 'Cresta',
  topknot: 'Moño alto',
  shoulder: 'A los hombros',
  wavy: 'Largo ondulado',
  'side-braid': 'Trenza al costado',
  'twin-buns': 'Dos rodetes',
};

/** Cuerpo de hombre o de mujer. */
export const GENDERS = ['male', 'female'] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_NAMES: Readonly<Record<Gender, string>> = { male: 'Hombre', female: 'Mujer' };

export const FACIAL_HAIR = [
  'none',
  'mustache',
  'beard',
  'goatee',
  'long-beard',
  'walrus',
  'mutton-chops',
  'sideburns',
  'chin-strap',
  'braided-beard',
  'twin-braids',
  'three-braids',
  'wild-beard',
  'full-beard',
  'curled-beard',
  'trimmed-beard',
  'forked-beard',
  'chin-curtain',
  'boxed-beard',
  'chin-braid',
  'braided-mustache',
] as const;
export type FacialHair = (typeof FACIAL_HAIR)[number];
export const FACIAL_HAIR_NAMES: Readonly<Record<FacialHair, string>> = {
  none: 'Sin barba',
  mustache: 'Bigote',
  beard: 'Barba',
  goatee: 'Chivita',
  'long-beard': 'Barba larga',
  walrus: 'Bigote grueso',
  'mutton-chops': 'Patillas con bigote',
  sideburns: 'Patillas',
  'chin-strap': 'Barba de mentón',
  'braided-beard': 'Barba con trenza',
  'twin-braids': 'Dos trenzas',
  'three-braids': 'Tres trenzas',
  'wild-beard': 'Barba salvaje',
  'full-beard': 'Barba tupida',
  'curled-beard': 'Bigote rizado',
  'trimmed-beard': 'Barba recortada',
  'forked-beard': 'Barba partida',
  'chin-curtain': 'Barba sin bigote',
  'boxed-beard': 'Barba corta',
  'chin-braid': 'Trenza en el mentón',
  'braided-mustache': 'Bigote con trenzas',
};

/** Las barbas que sabe dibujar el personaje chico del mundo. */
export type WorldFacialHair = 'none' | 'mustache' | 'beard' | 'goatee' | 'long-beard';

/** Cómo se ve cada barba en el mundo: la más parecida de las que tiene el personaje chico. */
export const WORLD_FACIAL_HAIR: Readonly<Record<FacialHair, WorldFacialHair>> = {
  none: 'none',
  mustache: 'mustache',
  beard: 'beard',
  goatee: 'goatee',
  'long-beard': 'long-beard',
  walrus: 'mustache',
  'mutton-chops': 'mustache',
  sideburns: 'none',
  'chin-strap': 'beard',
  'braided-beard': 'long-beard',
  'twin-braids': 'long-beard',
  'three-braids': 'long-beard',
  'wild-beard': 'long-beard',
  'full-beard': 'beard',
  'curled-beard': 'beard',
  'trimmed-beard': 'beard',
  'forked-beard': 'long-beard',
  'chin-curtain': 'beard',
  'boxed-beard': 'beard',
  'chin-braid': 'goatee',
  'braided-mustache': 'mustache',
};

/** Cuántos rostros hay para elegir (los del retrato pintado). */
export const FACE_COUNT = 6;

export interface Appearance {
  readonly clothHue: number;
  readonly skinTone: number;
  readonly hairHue: number;
  readonly gender?: Gender;
  readonly hairStyle?: HairStyle;
  readonly facialHair?: FacialHair;
  /** El rostro del retrato pintado (0 a FACE_COUNT - 1). */
  readonly face?: number;
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
    (v.gender === undefined || (GENDERS as readonly unknown[]).includes(v.gender)) &&
    (v.hairStyle === undefined || (HAIR_STYLES as readonly unknown[]).includes(v.hairStyle)) &&
    (v.facialHair === undefined || (FACIAL_HAIR as readonly unknown[]).includes(v.facialHair)) &&
    (v.face === undefined ||
      (Number.isInteger(v.face) && (v.face as number) >= 0 && (v.face as number) < FACE_COUNT))
  );
}
