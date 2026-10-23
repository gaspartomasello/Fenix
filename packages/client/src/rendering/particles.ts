/**
 * Ayudas para dibujar partículas sin guardarlas: cada una sale de un número
 * fijo (su semilla) y del tiempo, así no hay que recordar dónde quedó.
 */

/** Número pseudoalazar fijo (0–1) para una partícula. */
export function hash(a: number, b: number, c: number): number {
  const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/** Mezcla de colores (0–1) entre dos tonos. */
export function mix(a: number, b: number, t: number): number {
  const ch = (c: number, shift: number): number => (c >> shift) & 0xff;
  const lerp = (shift: number): number =>
    Math.round(ch(a, shift) + (ch(b, shift) - ch(a, shift)) * t);
  return (lerp(16) << 16) | (lerp(8) << 8) | lerp(0);
}

/** Color a lo largo de una paleta (0 el primero, 1 el último). */
export function paletteAt(colors: readonly number[], t: number): number {
  const scaled = Math.min(0.999, Math.max(0, t)) * (colors.length - 1);
  const i = Math.floor(scaled);
  return mix(colors[i] ?? 0, colors[i + 1] ?? colors[i] ?? 0, scaled - i);
}

/** Fuego: del centro blanco y amarillo al rojo oscuro de la punta que se apaga. */
export const FIRE_COLORS: readonly number[] = [0xfff6c8, 0xffd860, 0xff9a28, 0xe85014, 0x8a2008];
/** El mismo fuego, en verde (veneno). */
export const POISON_COLORS: readonly number[] = [0xf0ffd0, 0xbaf870, 0x74d03a, 0x3c9020, 0x1a4a10];
