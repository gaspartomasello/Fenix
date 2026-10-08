import type { ChatChannel, SocialCommand } from '@fenix/shared';

/** Lo que significa una línea escrita en el chat. */
export type ChatInput =
  | { readonly kind: 'chat'; readonly channel: ChatChannel; readonly text: string }
  | {
      readonly kind: 'social';
      readonly command: SocialCommand;
      readonly name?: string;
      readonly tag?: string;
    }
  /** `/aceptar` y `/rechazar`: el cliente decide si es para el grupo o el gremio. */
  | { readonly kind: 'answer'; readonly accept: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'error'; readonly text: string };

export const CHAT_HELP = [
  'Comandos del chat:',
  '/g mensaje — hablar a tu grupo',
  '/gr mensaje — hablar a tu gremio',
  '/invitar nombre — invitar a alguien a tu grupo',
  '/aceptar o /rechazar — responder una invitación',
  '/salir — dejar el grupo',
  '/fundar SIGLAS Nombre del gremio — fundar un gremio',
  '/reclutar nombre — invitar a alguien a tu gremio',
  '/dejargremio — dejar el gremio',
] as const;

/** Interpreta una línea del chat: texto común o un comando que empieza con "/". */
export function parseChatInput(raw: string): ChatInput {
  const line = raw.trim();
  if (!line.startsWith('/')) return { kind: 'chat', channel: 'say', text: line };
  const [word = '', ...rest] = line.slice(1).split(/\s+/);
  const args = rest.join(' ');
  const needs = (what: string): ChatInput => ({ kind: 'error', text: `Falta ${what}.` });

  switch (word.toLocaleLowerCase()) {
    case 'g':
    case 'grupo':
      return args ? { kind: 'chat', channel: 'party', text: args } : needs('el mensaje');
    case 'gr':
    case 'gremio':
      return args ? { kind: 'chat', channel: 'guild', text: args } : needs('el mensaje');
    case 'invitar':
      return args ? { kind: 'social', command: 'party-invite', name: args } : needs('el nombre');
    case 'aceptar':
      return { kind: 'answer', accept: true };
    case 'rechazar':
      return { kind: 'answer', accept: false };
    case 'salir':
      return { kind: 'social', command: 'party-leave' };
    case 'fundar': {
      const [tag = '', ...name] = rest;
      return tag && name.length > 0
        ? { kind: 'social', command: 'guild-create', tag, name: name.join(' ') }
        : needs('las siglas y el nombre (por ejemplo: /fundar FNX Orden del Fénix)');
    }
    case 'reclutar':
      return args ? { kind: 'social', command: 'guild-invite', name: args } : needs('el nombre');
    case 'dejargremio':
      return { kind: 'social', command: 'guild-leave' };
    case 'ayuda':
    case '?':
      return { kind: 'help' };
    default:
      return { kind: 'error', text: `No conozco el comando /${word}. Escribí /ayuda.` };
  }
}
