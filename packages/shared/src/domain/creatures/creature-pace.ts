import type { CreatureDefinition } from './creature-catalog';

/**
 * Cuánto más despacio persiguen los que pelean cuerpo a cuerpo, sobre el paso
 * de su especie: así se los puede esquivar o alejarse caminando ligero.
 */
export const MELEE_CHASE_PACE = 1.2;

/**
 * Cuánto se acorta la espera entre hechizo y hechizo de los que hacen magia:
 * con esto pelean como magos y no como guerreros que a veces tiran algo.
 */
export const SPELL_COOLDOWN_FACTOR = 0.65;

/** Cada individuo camina distinto: hasta este tanto más rápido o más lento que su especie. */
export const STRIDE_VARIATION = 0.12;

/** ¿Lanza hechizos? (los demás pelean cuerpo a cuerpo, aunque algunos escupan fuego). */
export function isCaster(definition: CreatureDefinition): boolean {
  return definition.abilities?.spells !== undefined;
}

/**
 * Lo que tarda esta criatura en avanzar un tile. Parte del paso de su especie
 * (un zombi arrastra los pies, un lobo trota) y le suma su manera propia de
 * caminar, fija para cada una (sale de su id): dos lobos no van iguales. Los
 * que pelean cuerpo a cuerpo, mientras persiguen, van un poco más despacio.
 */
export function creatureStepMs(
  definition: CreatureDefinition,
  id: string,
  chasing: boolean,
): number {
  const stride = 1 + (strideOf(id) * 2 - 1) * STRIDE_VARIATION;
  const pace = chasing && !isCaster(definition) ? MELEE_CHASE_PACE : 1;
  return Math.round(definition.moveMs * stride * pace);
}

/** La espera de un mago entre hechizo y hechizo. */
export function spellCooldownMs(cooldownMs: number): number {
  return Math.round(cooldownMs * SPELL_COOLDOWN_FACTOR);
}

/** Un número entre 0 y 1 propio de cada criatura, siempre el mismo. */
function strideOf(id: string): number {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return (h % 1000) / 999;
}
