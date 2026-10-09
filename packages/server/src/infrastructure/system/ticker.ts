/** Intervalo del ciclo del juego. */
export const TICK_MS = 100;

/** Llama a `onTick` con la hora actual a intervalos regulares. */
export function startTicker(onTick: (now: number) => void, now: () => number): () => void {
  const handle = setInterval(() => onTick(now()), TICK_MS);
  return () => clearInterval(handle);
}
