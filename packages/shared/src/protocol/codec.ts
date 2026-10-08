import { isAppearance } from '../domain/character/appearance';
import { isEquipmentSlot } from '../domain/items/equipment';
import { isDirection } from '../domain/geometry/direction';
import { isMoveMode } from '../domain/rules/movement';
import type { Position } from '../domain/geometry/position';
import type { ClientMessage, ItemDestination, ServerMessage, ServerMessageType } from './messages';

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
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;

function asPosition(value: unknown): Position | null {
  if (typeof value !== 'object' || value === null) return null;
  const { x, y } = value as Record<string, unknown>;
  return Number.isInteger(x) && Number.isInteger(y) ? { x: x as number, y: y as number } : null;
}

function asDestination(value: unknown): ItemDestination | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  switch (v.type) {
    case 'ground': {
      const position = asPosition(v.position);
      return position ? { type: 'ground', position } : null;
    }
    case 'backpack': {
      if (v.position === undefined) return { type: 'backpack' };
      const position = asPosition(v.position);
      return position ? { type: 'backpack', position } : null;
    }
    case 'equipment':
      return isEquipmentSlot(v.slot) ? { type: 'equipment', slot: v.slot } : null;
    default:
      return null;
  }
}

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
    case 'moveItem': {
      const to = asDestination(data.to);
      if (isId(data.itemId) && to) {
        return { ok: true, message: { type: 'moveItem', itemId: data.itemId, to } };
      }
      break;
    }
    case 'attack':
      if (isId(data.targetId))
        return { ok: true, message: { type: 'attack', targetId: data.targetId } };
      break;
    case 'stopAttack':
      return { ok: true, message: { type: 'stopAttack' } };
    case 'useItem':
      if (isId(data.itemId)) return { ok: true, message: { type: 'useItem', itemId: data.itemId } };
      break;
  }
  return { ok: false, error: `Mensaje inválido: ${String(data.type)}` };
}

const SERVER_TYPES: ReadonlySet<ServerMessageType> = new Set<ServerMessageType>([
  'welcome',
  'joinRejected',
  'mobileAppeared',
  'mobileDisappeared',
  'mobileMoved',
  'moveAck',
  'moveRejected',
  'chat',
  'groundItems',
  'inventory',
  'playerEquipment',
  'vitals',
  'mobileHealth',
  'combatTarget',
  'swing',
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
