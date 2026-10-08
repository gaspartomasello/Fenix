/**
 * Primeros auxilios con vendas, como en UO: cuánto tarda, cuánto cura y
 * cuándo saca el veneno, según Primeros auxilios y Anatomía.
 */

/** Distancia máxima para vendar a otro. */
export const BANDAGE_RANGE = 2;

/** Vendarse uno mismo tarda más que vendar a otro; la destreza lo acelera. */
export function bandageDelayMs(dexterity: number, self: boolean): number {
  const base = self ? 9_000 : 4_000;
  return Math.max(2_000, base - dexterity * 40);
}

/** Probabilidad de que la venda sirva: 40 % sin práctica, 90 % al máximo. */
export function bandageChance(healing: number): number {
  return Math.min(0.9, 0.4 + healing / 2000);
}

/** Vida que devuelve una venda bien puesta. */
export function rollBandageHeal(healing: number, anatomy: number, random: () => number): number {
  const min = 3 + Math.floor(healing / 60) + Math.floor(anatomy / 100);
  const max = min + 4 + Math.floor(healing / 100);
  return min + Math.floor(random() * (max - min + 1));
}

/** Con 60 de Primeros auxilios y de Anatomía, la venda puede sacar el veneno. */
export function canCurePoison(healing: number, anatomy: number): boolean {
  return healing >= 600 && anatomy >= 600;
}

/** Fuerza de la cura con vendas (0–1), para comparar con el nivel del veneno. */
export function bandageCurePower(healing: number, anatomy: number): number {
  return (healing + anatomy) / 2000;
}
