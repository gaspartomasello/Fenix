export const CHAT_MAX_LENGTH = 120;

/** Tiempo mínimo que un mensaje queda visible sobre la cabeza del personaje. */
export const OVERHEAD_TEXT_DURATION_MS = 4000;
/** Cuánto más dura por cada letra (según el diseño del juego: lo largo se queda más, para alcanzar a leerlo). */
export const OVERHEAD_TEXT_MS_PER_CHAR = 90;
/** Lo más que dura un mensaje sobre la cabeza. */
export const OVERHEAD_TEXT_MAX_MS = 16_000;

/** Cuánto dura sobre la cabeza un mensaje de este largo. */
export function overheadTextDurationMs(text: string): number {
  return Math.min(
    OVERHEAD_TEXT_MAX_MS,
    Math.max(OVERHEAD_TEXT_DURATION_MS, 1500 + text.length * OVERHEAD_TEXT_MS_PER_CHAR),
  );
}

/** Limpia caracteres de control y recorta. Devuelve null si no queda texto. */
export function sanitizeChatText(raw: string): string | null {
  const text = Array.from(raw)
    .filter((char) => !isControlCharacter(char))
    .join('')
    .trim()
    .slice(0, CHAT_MAX_LENGTH);
  return text.length > 0 ? text : null;
}

function isControlCharacter(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x20 || code === 0x7f;
}
