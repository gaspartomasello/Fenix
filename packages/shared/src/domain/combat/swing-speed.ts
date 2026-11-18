import type { Weapon } from './weapons';

/**
 * Velocidad de los golpes, como en Sphere (y en UO antes de Age of Shadows):
 *
 *   segundos entre golpes = 15000 ÷ ((destreza + 100) × velocidad del arma)
 *
 * Cada arma guarda en `swingMs` cuánto tarda con la destreza de un personaje
 * nuevo (40); de ahí sale su velocidad al estilo UO. Con más destreza se pega
 * más rápido con cualquier arma (de 40 a 100, un 30 % más rápido).
 *
 * Y como en OSI, cuenta la energía que queda: cansado se pega más lento. La
 * destreza vale entera con la energía llena y en proporción a lo que queda
 * (con media energía, como si tuviera media destreza).
 */

/** Destreza con la que cada arma tarda lo que dice su `swingMs`. */
export const REFERENCE_DEXTERITY = 40;
/** El escalado de Sphere y de UO. */
const SPEED_SCALE = 15000;
/** Nadie pega más seguido que esto (ni con muchísima destreza). */
export const MIN_SWING_MS = 1000;

/** La velocidad del arma al estilo UO: más alta, más rápida (la daga 71, la alabarda 33). */
export function weaponSpeed(weapon: Weapon): number {
  return (SPEED_SCALE * 1000) / ((REFERENCE_DEXTERITY + 100) * weapon.swingMs);
}

/**
 * Cuánto tarda entre golpes alguien con esta destreza (en milisegundos);
 * `energy` es la parte de la energía que le queda (1 = llena, 0 = agotado).
 */
export function swingDelayMs(weapon: Weapon, dexterity: number, energy = 1): number {
  const quickness = Math.max(0, dexterity * Math.max(0, Math.min(1, energy)));
  const ms = (SPEED_SCALE * 1000) / ((quickness + 100) * weaponSpeed(weapon));
  return Math.max(MIN_SWING_MS, Math.round(ms));
}
