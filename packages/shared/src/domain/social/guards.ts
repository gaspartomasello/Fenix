/**
 * Llamar a la guardia, como el "guards" de UO: decir "¡guardia!" (o pedir
 * auxilio) dentro de un pueblo protegido hace venir al guardia más cercano,
 * que ajusticia a los criminales, asesinos y fieras que haya alrededor de
 * quien llamó. Fuera de los pueblos (y en el Refugio de los Bandidos) no
 * viene nadie.
 */

/** Alrededor de quien llama, hasta dónde busca la guardia. */
export const GUARD_CALL_RANGE = 12;
/** Cada cuánto puede llamar un mismo jugador. */
export const GUARD_CALL_COOLDOWN_MS = 5000;

/**
 * ¿Lo dicho es un llamado a la guardia? `words` en minúsculas y sin acentos
 * ni signos. Cuenta si pide auxilio o socorro, o si es un grito corto con
 * "guardia" ("¡guardia!", "guardias", "a la guardia"). Preguntar por los
 * guardias ("¿qué opinás de los guardias?") no es llamarlos.
 */
export function isGuardCall(words: string): boolean {
  if (/\b(auxilio|socorro)\b/.test(words)) return true;
  if (!/\bguardias?\b/.test(words)) return false;
  return (
    words.split(' ').length <= 4 && !/\b(que|como|donde|quien|los guardias|de los)\b/.test(words)
  );
}
