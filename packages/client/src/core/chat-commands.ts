import type { ActiveSkill } from '@fenix/shared/skills/stealth';
import type { GmCommand } from '@fenix/shared/protocol/messages';
import type { ChatChannel, SocialCommand } from '@fenix/shared/social/groups';

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
  /** `/desconectar`: salir del juego (vuelve a la pantalla de ingreso). */
  | { readonly kind: 'logout' }
  /** `/desmontar`: bajarse de la montura. */
  | { readonly kind: 'dismount' }
  /** `/subir`: subir al barco más cercano; `/barco`: abrir la ventana del barco. */
  | { readonly kind: 'ship'; readonly action: 'board' | 'panel' }
  /** `/liberar`: dejar ir a la montura para siempre. */
  | { readonly kind: 'releasePet' }
  /** `/esconderse`, `/mirar`: usar esas habilidades. */
  | { readonly kind: 'useSkill'; readonly skill: ActiveSkill }
  /** `/hora 22`: mover la hora del mundo (solo personajes de prueba). */
  | { readonly kind: 'hour'; readonly hour: number }
  /** `/cueva` y `/cueva fondo`: viajar a la mazmorra (solo personajes de prueba). */
  | { readonly kind: 'travel'; readonly to: 'cave' | 'lair' }
  /** `/ir Roca Alta`: viajar a un lugar con nombre (solo personajes de prueba). */
  | { readonly kind: 'goto'; readonly place: string }
  /** `/invul`: volverse invulnerable o dejar de serlo (solo personajes de prueba). */
  | { readonly kind: 'invulnerable' }
  /** Comandos del administrador del juego (el servidor revisa que lo sea). */
  | { readonly kind: 'gm'; readonly command: GmCommand }
  /** `/rastrear`: abrir la ventana de Rastrear. */
  | { readonly kind: 'tracking' }
  /** `/eliminar`: tocar un objeto propio para borrarlo (el servidor revisa que sea administrador). */
  | { readonly kind: 'gmDelete' }
  /** `/matar`, y `/curar` o `/resucitar` sin nombre: sobre el blanco elegido. */
  | { readonly kind: 'gmTarget'; readonly action: 'slay' | 'heal' | 'resurrect' }
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
  '/desconectar — salir del juego (se guarda tu personaje)',
  '/desmontar — bajarte de tu montura',
  '/subir — subir al barco más cercano; /barco — abrir la ventana del barco',
  '/liberar — dejar ir a tu montura (para siempre)',
  '/esconderse — esconderte (habilidad Esconderse)',
  '/mirar — buscar a los escondidos cerca (habilidad Mirar)',
  '/rastrear — buscar rastros de animales, monstruos, personas o vecinos (habilidad Rastrear)',
  '/hora 22 — cambiar la hora del mundo (solo personajes de prueba)',
  '/cueva o /cueva fondo — ir a la mazmorra (solo personajes de prueba)',
  '/invul — volverte invulnerable (nombre amarillo) o dejar de serlo (solo personajes de prueba)',
  'Administrador del juego:',
  '/crear criatura [cantidad] — hacer aparecer criaturas salvajes al lado (/criaturas, la lista)',
  '/invocar criatura [cantidad] — criaturas que te siguen y pelean para vos',
  '/objeto nombre [cantidad] — crear objetos en tu mochila',
  '/objetos — ventana con todos los objetos del juego (un clic los crea en tu mochila)',
  '/eliminar — tocar un objeto de tu mochila (o lo que tenés puesto) para borrarlo',
  '/montura tipo — darte una montura',
  '/matar — matar a tu blanco; /curar y /resucitar [nombre] — a tu blanco, a alguien o a vos',
  '/traer nombre — traer a alguien a tu lado; /irjunto nombre — ir hasta alguien',
  '/limpiar [radio] — sacar las criaturas creadas cerca; /anuncio texto — avisar a todos',
  '/ir lugar — ir a un pueblo o lugar con nombre, o a unas coordenadas (/ir 120 300); /ir solo, la lista (solo personajes de prueba)',
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
    case 'desconectar':
      return { kind: 'logout' };
    case 'desmontar':
      return { kind: 'dismount' };
    case 'liberar':
      return { kind: 'releasePet' };
    case 'subir':
    case 'abordar':
      return { kind: 'ship', action: 'board' };
    case 'barco':
      return { kind: 'ship', action: 'panel' };
    case 'esconderse':
    case 'esconder':
      return { kind: 'useSkill', skill: 'hiding' };
    case 'mirar':
      return { kind: 'useSkill', skill: 'detect-hidden' };
    case 'rastrear':
      return { kind: 'tracking' };
    case 'hora': {
      const hour = Number(args.replace(',', '.'));
      return args && Number.isFinite(hour) && hour >= 0 && hour < 24
        ? { kind: 'hour', hour }
        : needs('la hora, de 0 a 23 (por ejemplo: /hora 22)');
    }
    case 'cueva':
      return { kind: 'travel', to: args.toLocaleLowerCase() === 'fondo' ? 'lair' : 'cave' };
    case 'ir':
      return { kind: 'goto', place: args };
    case 'invul':
    case 'invulnerable':
      return { kind: 'invulnerable' };
    case 'crear':
    case 'invocar': {
      const { text, amount } = withAmount(rest);
      return text
        ? {
            kind: 'gm',
            command: {
              kind: 'summon',
              creature: text,
              amount: Math.min(amount, 20),
              tame: word.toLocaleLowerCase() === 'invocar',
            },
          }
        : needs('la criatura (por ejemplo: /crear dragón)');
    }
    case 'criaturas':
      return { kind: 'gm', command: { kind: 'creatures' } };
    case 'objeto': {
      const { text, amount } = withAmount(rest);
      return text
        ? { kind: 'gm', command: { kind: 'item', item: text, amount } }
        : needs('el objeto (por ejemplo: /objeto oro 1000)');
    }
    case 'objetos':
      return { kind: 'gm', command: { kind: 'catalog' } };
    case 'eliminar':
      return { kind: 'gmDelete' };
    case 'montura':
      return args
        ? { kind: 'gm', command: { kind: 'mount', mount: args } }
        : needs('la montura (por ejemplo: /montura elefante)');
    case 'matar':
      return { kind: 'gmTarget', action: 'slay' };
    case 'curar':
      return args
        ? { kind: 'gm', command: { kind: 'heal', name: args } }
        : { kind: 'gmTarget', action: 'heal' };
    case 'resucitar':
      return args
        ? { kind: 'gm', command: { kind: 'resurrect', name: args } }
        : { kind: 'gmTarget', action: 'resurrect' };
    case 'traer':
      return args ? { kind: 'gm', command: { kind: 'bring', name: args } } : needs('el nombre');
    case 'irjunto':
    case 'ira':
      return args ? { kind: 'gm', command: { kind: 'goTo', name: args } } : needs('el nombre');
    case 'limpiar': {
      const radius = Number(args || 12);
      return Number.isInteger(radius) && radius >= 1 && radius <= 30
        ? { kind: 'gm', command: { kind: 'clear', radius } }
        : needs('un radio de 1 a 30 tiles');
    }
    case 'anuncio':
      return args ? { kind: 'gm', command: { kind: 'announce', text: args } } : needs('el texto');
    case 'ayuda':
    case '?':
      return { kind: 'help' };
    default:
      return { kind: 'error', text: `No conozco el comando /${word}. Escribí /ayuda.` };
  }
}

/** "lobo gris 3" → nombre "lobo gris" y cantidad 3 (1 si no hay número al final). */
function withAmount(words: readonly string[]): { text: string; amount: number } {
  const last = words[words.length - 1] ?? '';
  const amount = /^\d+$/.test(last) ? Number(last) : NaN;
  return Number.isInteger(amount) && amount >= 1
    ? { text: words.slice(0, -1).join(' '), amount }
    : { text: words.join(' '), amount: 1 };
}
