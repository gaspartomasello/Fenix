/**
 * Las habilidades del ladrón, como en UO: forzar cerraduras con ganzúas,
 * fisgonear la mochila de otro y robarle. Todo en décimas (0–1000).
 */

/** A qué distancia se fisgonea, se roba o se fuerza una cerradura: al lado. */
export const THIEF_RANGE = 1;

/**
 * Dificultad de la cerradura de un cofre (en décimas, 0 si no tiene llave).
 * Sale del lugar, así que siempre es la misma: afuera de los pueblos (ruinas,
 * casas abandonadas, mazmorras) casi todos están cerrados y son difíciles;
 * en los pueblos, uno de cada tres, y más fáciles.
 */
export function lockDifficulty(x: number, y: number, wild: boolean): number {
  const h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
  if (!wild && h % 3 !== 0) return 0;
  if (wild && h % 5 === 0) return 0;
  const base = wild ? 350 : 50;
  const spread = wild ? 500 : 300;
  return base + (h % (spread + 1));
}

/**
 * Probabilidad de abrir una cerradura: a igual habilidad que la dificultad,
 * mitad y mitad; nunca segura ni imposible si se está cerca.
 */
export function pickChance(lockpicking: number, difficulty: number): number {
  return Math.max(0.03, Math.min(0.95, 0.5 + (lockpicking - difficulty) / 600));
}

/** Probabilidad de romper la ganzúa al fallar. */
export const LOCKPICK_BREAK_CHANCE = 0.35;

/** Probabilidad de fisgonear sin que te pesquen: 20 % sin práctica, 95 % en el máximo. */
export function snoopChance(snooping: number): number {
  return Math.min(0.95, 0.2 + snooping / 1300);
}

/**
 * Probabilidad de robar sin que te descubran: baja sin práctica, mejor si
 * antes fisgoneaste a la víctima (sabés dónde buscar) o si estás escondido.
 */
export function stealChance(stealing: number, snooped: boolean, hidden: boolean): number {
  const bonus = (snooped ? 0.15 : 0) + (hidden ? 0.1 : 0);
  return Math.max(0.05, Math.min(0.9, 0.1 + stealing / 1300 + bonus));
}

/** No se roba lo que pesa mucho: solo objetos chicos (una pila de oro o un objeto suelto). */
export const STEAL_MAX_STACK = 100;

/** Después de robarle (o intentar), la misma persona queda alerta un rato. */
export const STEAL_COOLDOWN_MS = 5 * 60 * 1000;
