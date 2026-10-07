export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 16;

const NAME_PATTERN = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?: [A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$/;

export type NameValidation = { ok: true; name: string } | { ok: false; reason: string };

/** Normaliza y valida el nombre de un personaje (letras y espacios simples). */
export function validateCharacterName(raw: string): NameValidation {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
    return {
      ok: false,
      reason: `El nombre debe tener entre ${NAME_MIN_LENGTH} y ${NAME_MAX_LENGTH} letras.`,
    };
  }
  if (!NAME_PATTERN.test(name)) {
    return { ok: false, reason: 'El nombre solo puede tener letras y espacios.' };
  }
  return { ok: true, name };
}
