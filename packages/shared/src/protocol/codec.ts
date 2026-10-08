import { isAppearance } from '../domain/character/appearance';
import { isEquipmentSlot } from '../domain/items/equipment';
import { isItemKind } from '../domain/items/item-catalog';
import { isSpellKey } from '../domain/magic/spell-catalog';
import { isChatChannel, isSocialCommand } from '../domain/social/groups';
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
    case 'bank': {
      if (v.position === undefined) return { type: 'bank' };
      const position = asPosition(v.position);
      return position ? { type: 'bank', position } : null;
    }
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
      if (!isString(data.text)) break;
      if (data.channel === undefined)
        return { ok: true, message: { type: 'chat', text: data.text } };
      if (isChatChannel(data.channel)) {
        return { ok: true, message: { type: 'chat', text: data.text, channel: data.channel } };
      }
      break;
    case 'social': {
      if (!isSocialCommand(data.command)) break;
      const name =
        data.name === undefined
          ? undefined
          : isString(data.name) && data.name.length <= 40
            ? data.name
            : null;
      const tag =
        data.tag === undefined
          ? undefined
          : isString(data.tag) && data.tag.length <= 8
            ? data.tag
            : null;
      if (name === null || tag === null) break;
      return {
        ok: true,
        message: {
          type: 'social',
          command: data.command,
          ...(name !== undefined ? { name } : {}),
          ...(tag !== undefined ? { tag } : {}),
        },
      };
    }
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
    case 'castSpell':
      if (!isSpellKey(data.spell)) break;
      if (data.targetId === undefined)
        return { ok: true, message: { type: 'castSpell', spell: data.spell } };
      if (isId(data.targetId)) {
        return {
          ok: true,
          message: { type: 'castSpell', spell: data.spell, targetId: data.targetId },
        };
      }
      break;
    case 'gather': {
      const position = asPosition(data.position);
      if (isId(data.toolId) && position) {
        return { ok: true, message: { type: 'gather', toolId: data.toolId, position } };
      }
      break;
    }
    case 'buy':
      if (
        isId(data.vendorId) &&
        isItemKind(data.kind) &&
        Number.isInteger(data.amount) &&
        (data.amount as number) >= 1 &&
        (data.amount as number) <= 1000
      ) {
        return {
          ok: true,
          message: {
            type: 'buy',
            vendorId: data.vendorId,
            kind: data.kind,
            amount: data.amount as number,
          },
        };
      }
      break;
    case 'sell':
      if (isId(data.vendorId) && isId(data.itemId)) {
        return {
          ok: true,
          message: { type: 'sell', vendorId: data.vendorId, itemId: data.itemId },
        };
      }
      break;
    case 'craft':
      if (typeof data.recipe === 'string' && data.recipe.length <= 40) {
        return { ok: true, message: { type: 'craft', recipe: data.recipe } };
      }
      break;
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
  'skills',
  'castStart',
  'spellEffect',
  'mobileStatus',
  'social',
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
