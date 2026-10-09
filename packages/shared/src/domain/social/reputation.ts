/**
 * Reputación, como en UO: inocentes (azul), criminales (gris, por atacar
 * a un inocente) y asesinos (rojo, con 5 muertes de inocentes o más).
 */
export type Notoriety = 'innocent' | 'criminal' | 'murderer';

export const NOTORIETY_NAMES: Readonly<Record<Notoriety, string>> = {
  innocent: 'Inocente',
  criminal: 'Criminal',
  murderer: 'Asesino',
};

/** Cuánto dura la marca de criminal después de atacar a un inocente. */
export const CRIMINAL_MS = 2 * 60 * 1000;
/** Muertes de inocentes para ser asesino, y cada cuánto se olvida una. */
export const MURDERER_KILLS = 5;
export const MURDER_DECAY_MS = 30 * 60 * 1000;

export const FAME_MAX = 10_000;
export const KARMA_MAX = 10_000;

/** Fama y karma que da matar cada tipo de criatura. */
export const CREATURE_FAME: Readonly<Record<string, number>> = {
  rat: 5,
  wolf: 15,
  'giant-spider': 20,
  skeleton: 30,
  orc: 35,
  'skeleton-mage': 50,
  troll: 70,
  lich: 200,
  dragon: 1000,
};

export function notorietyOf(murders: number, criminalUntil: number, now: number): Notoriety {
  if (murders >= MURDERER_KILLS) return 'murderer';
  return now < criminalUntil ? 'criminal' : 'innocent';
}

/** Título según fama y karma: "el Célebre", "la Noble"… (sin género para simplificar). */
export function reputationTitle(fame: number, karma: number): string {
  const renown =
    fame >= 6000 ? 'Legendario' : fame >= 3000 ? 'Célebre' : fame >= 1000 ? 'Notable' : '';
  const virtue = karma >= 2000 ? 'Noble' : karma <= -2000 ? 'Vil' : '';
  return [virtue, renown].filter(Boolean).join(' ') || 'Aventurero';
}

export function clamp(value: number, max: number): number {
  return Math.max(-max, Math.min(max, value));
}
