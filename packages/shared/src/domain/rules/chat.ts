export const CHAT_MAX_LENGTH = 120;

/** Tiempo que un mensaje queda visible sobre la cabeza del personaje. */
export const OVERHEAD_TEXT_DURATION_MS = 5000;

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
