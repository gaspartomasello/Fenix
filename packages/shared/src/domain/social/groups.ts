/** Reglas de grupos y gremios. */
export const PARTY_MAX = 6;
/** Cuánto dura una invitación sin responder. */
export const INVITE_MS = 60 * 1000;

export const GUILD_NAME = { min: 3, max: 24 } as const;
export const GUILD_TAG = { min: 2, max: 4 } as const;

export type GuildValidation =
  { ok: true; name: string; tag: string } | { ok: false; reason: string };

/** Valida el nombre (letras y espacios) y las siglas (letras, en mayúsculas) de un gremio. */
export function validateGuild(rawName: string, rawTag: string): GuildValidation {
  const name = rawName.trim().replace(/\s+/g, ' ');
  const tag = rawTag.trim().toUpperCase();
  if (name.length < GUILD_NAME.min || name.length > GUILD_NAME.max || !/^[\p{L} ]+$/u.test(name)) {
    return {
      ok: false,
      reason: `El nombre del gremio debe tener entre ${GUILD_NAME.min} y ${GUILD_NAME.max} letras.`,
    };
  }
  if (tag.length < GUILD_TAG.min || tag.length > GUILD_TAG.max || !/^\p{Lu}+$/u.test(tag)) {
    return {
      ok: false,
      reason: `Las siglas deben tener entre ${GUILD_TAG.min} y ${GUILD_TAG.max} letras.`,
    };
  }
  return { ok: true, name, tag };
}

/** Canal del chat: decir en voz alta (cerca), al grupo o al gremio. */
export type ChatChannel = 'say' | 'party' | 'guild';

export function isChatChannel(value: unknown): value is ChatChannel {
  return value === 'say' || value === 'party' || value === 'guild';
}

export const SOCIAL_COMMANDS = [
  'party-invite',
  'party-accept',
  'party-decline',
  'party-leave',
  'guild-create',
  'guild-invite',
  'guild-accept',
  'guild-decline',
  'guild-leave',
] as const;

export type SocialCommand = (typeof SOCIAL_COMMANDS)[number];

export function isSocialCommand(value: unknown): value is SocialCommand {
  return typeof value === 'string' && (SOCIAL_COMMANDS as readonly string[]).includes(value);
}
