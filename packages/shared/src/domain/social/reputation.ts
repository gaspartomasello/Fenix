/**
 * Reputación, como en UO: inocentes (azul), criminales (gris, por atacar
 * a un inocente) y asesinos (rojo, con 5 muertes de inocentes o más). Los
 * invulnerables (amarillo) son como los administradores del juego: no se los
 * puede lastimar.
 */
export type Notoriety = 'innocent' | 'criminal' | 'murderer' | 'invulnerable';

export const NOTORIETY_NAMES: Readonly<Record<Notoriety, string>> = {
  innocent: 'Inocente',
  criminal: 'Criminal',
  murderer: 'Asesino',
  invulnerable: 'Invulnerable',
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
  zombie: 35,
  ghoul: 45,
  wraith: 60,
  troll: 70,
  lich: 200,
  dragon: 1000,
  // Fauna (del bestiario, en la misma escala)
  rabbit: 3,
  raven: 3,
  swallow: 3,
  hind: 10,
  'great-hart': 10,
  goat: 5,
  'mountain-goat': 10,
  sheep: 5,
  cow: 8,
  bull: 20,
  boar: 8,
  eagle: 10,
  bullfrog: 10,
  walrus: 5,
  gorilla: 15,
  'wild-elephant': 60,
  'black-bear': 15,
  'brown-bear': 15,
  grizzly: 35,
  'polar-bear': 50,
  cougar: 15,
  panther: 18,
  jaguar: 20,
  'snow-leopard': 15,
  'white-wolf': 15,
  snake: 15,
  'king-cobra': 40,
  python: 100,
  scorpion: 60,
  'king-scorpion': 90,
  alligator: 20,
  crocodile: 25,
  lizardman: 30,
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
