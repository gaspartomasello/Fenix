/**
 * Ciclo de día y noche. El servidor es dueño de la hora del mundo; el
 * cliente la extrapola con su reloj a partir de lo que recibe al entrar.
 */

/** Duración de un día completo del juego en tiempo real. */
export const DAY_LENGTH_MS = 24 * 60 * 1000;

export interface WorldTime {
  /** Momento del día en [0, 1): 0 = medianoche, 0.5 = mediodía. */
  readonly dayProgress: number;
  readonly dayLengthMs: number;
}

/** Avanza la hora del mundo `elapsedMs` milisegundos. */
export function advanceTime(time: WorldTime, elapsedMs: number): WorldTime {
  const progress = (time.dayProgress + elapsedMs / time.dayLengthMs) % 1;
  return { ...time, dayProgress: progress < 0 ? progress + 1 : progress };
}

/**
 * Nivel de luz ambiente en [0, 1]: 1 de día, ~0.25 de noche, con amanecer
 * (05:00–07:00) y atardecer (18:00–20:00) graduales.
 */
export function daylight(dayProgress: number): number {
  const hour = dayProgress * 24;
  const night = 0.25;
  if (hour < 5 || hour >= 20) return night;
  if (hour < 7) return night + (1 - night) * smooth((hour - 5) / 2);
  if (hour < 18) return 1;
  return 1 - (1 - night) * smooth((hour - 18) / 2);
}

/** Hora del juego como "HH:MM". */
export function formatGameTime(dayProgress: number): string {
  const totalMinutes = Math.floor(dayProgress * 24 * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
