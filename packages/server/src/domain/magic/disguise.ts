import {
  CLOTH_HUES,
  FACIAL_HAIR,
  HAIR_HUES,
  HAIR_STYLES,
  SKIN_TONES,
  type Appearance,
} from '@fenix/shared/character/appearance';

/** Nombres que puede tomar quien lanza Incógnito. */
const MALE_NAMES = [
  'Bernardo',
  'Cosme',
  'Damián',
  'Evaristo',
  'Fabián',
  'Gervasio',
  'Hilario',
  'Leandro',
  'Matías',
  'Nicanor',
  'Octavio',
  'Prudencio',
  'Rufino',
  'Sebastián',
  'Valentín',
];
const FEMALE_NAMES = [
  'Amalia',
  'Beatriz',
  'Catalina',
  'Delfina',
  'Encarnación',
  'Florencia',
  'Graciela',
  'Isabela',
  'Josefina',
  'Leonor',
  'Mercedes',
  'Norma',
  'Pilar',
  'Rocío',
  'Soledad',
];

function pick<T>(list: readonly T[], random: () => number): T {
  return list[Math.floor(random() * list.length)] as T;
}

/**
 * Otra cara para Incógnito, como en UO: mismo cuerpo, pero otro nombre,
 * otra piel, otro pelo y otra ropa, todo al azar.
 */
export function randomDisguise(
  appearance: Appearance,
  random: () => number,
): { name: string; appearance: Appearance } {
  const female = appearance.gender === 'female';
  return {
    name: pick(female ? FEMALE_NAMES : MALE_NAMES, random),
    appearance: {
      ...appearance,
      clothHue: pick(CLOTH_HUES, random),
      skinTone: pick(SKIN_TONES, random),
      hairHue: pick(HAIR_HUES, random),
      hairStyle: pick(HAIR_STYLES, random),
      facialHair: female ? 'none' : pick(FACIAL_HAIR, random),
    },
  };
}
