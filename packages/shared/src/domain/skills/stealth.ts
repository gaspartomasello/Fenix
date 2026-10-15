/**
 * Esconderse, Sigilo y Mirar, como en UO: el que se esconde desaparece de la
 * vista de los demás (personas y criaturas) hasta que ataca, lanza un
 * hechizo, habla, recibe un golpe o da más pasos de los que su Sigilo le
 * permite. Mirar busca a los escondidos cerca. Todo en décimas (0–1000).
 */

/** Habilidades que se usan a propósito (con un botón o un comando). */
export const ACTIVE_SKILLS = ['hiding', 'detect-hidden'] as const;
export type ActiveSkill = (typeof ACTIVE_SKILLS)[number];

export function isActiveSkill(value: unknown): value is ActiveSkill {
  return typeof value === 'string' && (ACTIVE_SKILLS as readonly string[]).includes(value);
}

/** Probabilidad de esconderse: 30 % sin práctica, 95 % cerca del máximo. */
export function hideChance(hiding: number): number {
  return Math.min(0.95, 0.3 + hiding / 1400);
}

/** Pasos que se pueden dar escondido sin que te descubran: uno cada 10 de Sigilo. */
export function stealthSteps(stealth: number): number {
  return Math.floor(stealth / 100);
}

/** Hasta dónde busca Mirar (en tiles): de 2 a 6. */
export function detectRange(detectHidden: number): number {
  return 2 + Math.floor(detectHidden / 250);
}

/**
 * Probabilidad de encontrar a uno escondido: 50 % a igual habilidad (Mirar
 * contra su Esconderse), más o menos según la diferencia.
 */
export function detectChance(detectHidden: number, hiding: number): number {
  return Math.max(0.1, Math.min(0.95, 0.5 + (detectHidden - hiding) / 1000));
}

/** Cuánto dura Invisibilidad: de 20 s a 50 s según la Magia. */
export function invisibilityMs(magery: number): number {
  return 20_000 + magery * 30;
}

/** Radio de Revelar (en tiles): de 1 a 6 según la Magia. */
export function revealRadius(magery: number): number {
  return 1 + Math.floor(magery / 200);
}

/** Desde qué distancia una criatura que te ataca no te deja esconderte. */
export const HIDE_BLOCK_RANGE = 2;
