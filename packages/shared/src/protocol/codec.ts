import { isAppearance } from '../domain/character/appearance';
import { isDirection } from '../domain/geometry/direction';
import { isMoveMode } from '../domain/rules/movement';
import type { ClientMessage, ServerMessage, ServerMessageType } from './messages';

/** Tamaño máximo aceptado para un mensaje entrante del cliente (bytes). */
export const MAX_CLIENT_MESSAGE_BYTES = 1024;

export type DecodeResult<T> = { ok: true; message: T } | { ok: false; error: string };

export function encodeMessage(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}

function parseObject(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isSeq = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/**
 * Decodifica y valida un mensaje del cliente. Todo lo que llega del cliente
 * se considera no confiable: se valida la forma completa antes de usarlo.
 */
export function decodeClientMessage(raw: string): DecodeResult<ClientMessage> {
  if (raw.length > MAX_CLIENT_MESSAGE_BYTES)
    return { ok: false, error: 'Mensaje demasiado grande' };
  const data = parseObject(raw);
  if (!data) return { ok: false, error: 'JSON inválido' };

  switch (data.type) {
    case 'join':
      if (isString(data.name) && isAppearance(data.appearance)) {
        return {
          ok: true,
          message: { type: 'join', name: data.name, appearance: data.appearance },
        };
      }
      break;
    case 'move':
      if (isDirection(data.direction) && isMoveMode(data.mode) && isSeq(data.seq)) {
        return {
          ok: true,
          message: { type: 'move', direction: data.direction, mode: data.mode, seq: data.seq },
        };
      }
      break;
    case 'chat':
      if (isString(data.text)) return { ok: true, message: { type: 'chat', text: data.text } };
      break;
  }
  return { ok: false, error: `Mensaje inválido: ${String(data.type)}` };
}

const SERVER_TYPES: ReadonlySet<ServerMessageType> = new Set<ServerMessageType>([
  'welcome',
  'joinRejected',
  'playerJoined',
  'playerLeft',
  'playerMoved',
  'moveAck',
  'moveRejected',
  'chat',
  'system',
]);

/** Decodifica un mensaje del servidor (fuente confiable: solo se verifica el tipo). */
export function decodeServerMessage(raw: string): DecodeResult<ServerMessage> {
  const data = parseObject(raw);
  if (!data || !SERVER_TYPES.has(data.type as ServerMessageType)) {
    return { ok: false, error: 'Mensaje del servidor desconocido' };
  }
  return { ok: true, message: data as unknown as ServerMessage };
}
