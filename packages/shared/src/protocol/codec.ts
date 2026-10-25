import { isAppearance } from '../domain/character/appearance';
import { PASSWORD_MAX_LENGTH } from '../domain/character/password';
import { validateCreation } from '../domain/character/creation';
import { isEquipmentSlot } from '../domain/items/equipment';
import { isItemKind } from '../domain/items/item-catalog';
import { BOOK_PAGES, cleanBookPage, cleanBookTitle } from '../domain/items/books';
import { isDyeHue } from '../domain/items/dyes';
import { isPolymorphForm, isSpellKey } from '../domain/magic/spell-catalog';
import { isActiveSkill } from '../domain/skills/stealth';
import { isTrackingCategory } from '../domain/skills/tracking';
import { isMountKind } from '../domain/mounts/mount-catalog';
import { isChatChannel, isSocialCommand } from '../domain/social/groups';
import { isDirection } from '../domain/geometry/direction';
import { isMoveMode } from '../domain/rules/movement';
import { isShipLevel, isShipOrder } from '../domain/ships/ships';
import { parseHouseDesign } from '../domain/housing/design';
import { isHouseList } from '../domain/housing/houses';
import type { Position } from '../domain/geometry/position';
import type {
  ClientMessage,
  GmCommand,
  ItemDestination,
  ServerMessage,
  ServerMessageType,
  ShipAction,
  ShipSecurityChange,
  HouseAction,
  HouseSecurityChange,
} from './messages';

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
    case 'container': {
      if (typeof v.containerId !== 'string' || v.containerId.length > 64) return null;
      if (v.position === undefined) return { type: 'container', containerId: v.containerId };
      const position = asPosition(v.position);
      return position ? { type: 'container', containerId: v.containerId, position } : null;
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
      if (
        isString(data.name) &&
        isAppearance(data.appearance) &&
        (data.password === undefined ||
          (isString(data.password) && data.password.length <= PASSWORD_MAX_LENGTH))
      ) {
        const base = { type: 'join', name: data.name, appearance: data.appearance } as const;
        return {
          ok: true,
          message: isString(data.password) ? { ...base, password: data.password } : base,
        };
      }
      break;
    case 'login':
      if (
        isString(data.account) &&
        data.account.length <= 40 &&
        typeof data.create === 'boolean' &&
        (data.password === undefined ||
          (isString(data.password) && data.password.length <= PASSWORD_MAX_LENGTH))
      ) {
        const base = { type: 'login', account: data.account, create: data.create } as const;
        return {
          ok: true,
          message: isString(data.password) ? { ...base, password: data.password } : base,
        };
      }
      break;
    case 'createCharacter': {
      const creation = validateCreation(data.creation);
      if (creation.ok)
        return { ok: true, message: { type: 'createCharacter', creation: creation.creation } };
      break;
    }
    case 'play':
    case 'deleteCharacter':
      if (isString(data.name) && data.name.length <= 40)
        return { ok: true, message: { type: data.type, name: data.name } };
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
    case 'castSpell': {
      if (!isSpellKey(data.spell)) break;
      if (data.targetId !== undefined && !isId(data.targetId)) break;
      if (data.scrollId !== undefined && !isId(data.scrollId)) break;
      if (data.runeId !== undefined && !isId(data.runeId)) break;
      if (data.form !== undefined && !isPolymorphForm(data.form)) break;
      const position = data.position === undefined ? undefined : asPosition(data.position);
      if (position === null) break;
      return {
        ok: true,
        message: {
          type: 'castSpell',
          spell: data.spell,
          ...(isId(data.targetId) ? { targetId: data.targetId } : {}),
          ...(position ? { position } : {}),
          ...(isId(data.scrollId) ? { scrollId: data.scrollId } : {}),
          ...(isId(data.runeId) ? { runeId: data.runeId } : {}),
          ...(isPolymorphForm(data.form) ? { form: data.form } : {}),
        },
      };
    }
    case 'useOn':
      if (isId(data.itemId) && isId(data.targetId)) {
        return {
          ok: true,
          message: { type: 'useOn', itemId: data.itemId, targetId: data.targetId },
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
    case 'pickLock': {
      const position = asPosition(data.position);
      if (isId(data.toolId) && position)
        return { ok: true, message: { type: 'pickLock', toolId: data.toolId, position } };
      break;
    }
    case 'dig': {
      const position = asPosition(data.position);
      if (isId(data.toolId) && position)
        return { ok: true, message: { type: 'dig', toolId: data.toolId, position } };
      break;
    }
    case 'shipOrder':
      if (isId(data.shipId) && isShipOrder(data.order))
        return { ok: true, message: { type: 'shipOrder', shipId: data.shipId, order: data.order } };
      break;
    case 'boardShip':
      if (isId(data.shipId))
        return { ok: true, message: { type: 'boardShip', shipId: data.shipId } };
      break;
    case 'shipAction':
      if (isId(data.shipId) && isShipAction(data.action))
        return {
          ok: true,
          message: { type: 'shipAction', shipId: data.shipId, action: data.action },
        };
      break;
    case 'shipSecurity': {
      const change = asShipSecurityChange(data.change);
      if (isId(data.shipId) && change)
        return { ok: true, message: { type: 'shipSecurity', shipId: data.shipId, change } };
      break;
    }
    case 'placeHouse': {
      const position = asPosition(data.position);
      if (isId(data.deedId) && position)
        return { ok: true, message: { type: 'placeHouse', deedId: data.deedId, position } };
      break;
    }
    case 'houseAction':
      if (isId(data.houseId) && isHouseAction(data.action))
        return {
          ok: true,
          message: { type: 'houseAction', houseId: data.houseId, action: data.action },
        };
      break;
    case 'houseSecurity': {
      const change = asHouseSecurityChange(data.change);
      if (isId(data.houseId) && change)
        return { ok: true, message: { type: 'houseSecurity', houseId: data.houseId, change } };
      break;
    }
    case 'houseDesign': {
      const design = parseHouseDesign(data.design);
      if (isId(data.houseId) && design && (data.pay === 'gold' || data.pay === 'materials'))
        return {
          ok: true,
          message: { type: 'houseDesign', houseId: data.houseId, design, pay: data.pay },
        };
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
    case 'setHour':
      if (typeof data.hour === 'number' && data.hour >= 0 && data.hour < 24)
        return { ok: true, message: { type: 'setHour', hour: data.hour } };
      break;
    case 'testTravel':
      if (data.to === 'cave' || data.to === 'lair')
        return { ok: true, message: { type: 'testTravel', to: data.to } };
      if (data.to === 'place' && typeof data.place === 'string' && data.place.length <= 60)
        return { ok: true, message: { type: 'testTravel', to: 'place', place: data.place } };
      break;
    case 'toggleInvulnerable':
      return { ok: true, message: { type: 'toggleInvulnerable' } };
    case 'openContainer':
      if (typeof data.containerId === 'string' && data.containerId.length <= 64)
        return { ok: true, message: { type: 'openContainer', containerId: data.containerId } };
      break;
    case 'talkNpc':
    case 'acceptQuest':
      if (isId(data.npcId)) return { ok: true, message: { type: data.type, npcId: data.npcId } };
      break;
    case 'abandonQuest':
      if (typeof data.giver === 'string' && data.giver.length <= 60)
        return { ok: true, message: { type: 'abandonQuest', giver: data.giver } };
      break;
    case 'dye':
      if (isId(data.itemId) && typeof data.hue === 'number' && isDyeHue(data.hue))
        return { ok: true, message: { type: 'dye', itemId: data.itemId, hue: data.hue } };
      break;
    case 'tintTub':
      if (isId(data.tubId) && typeof data.hue === 'number' && isDyeHue(data.hue))
        return { ok: true, message: { type: 'tintTub', tubId: data.tubId, hue: data.hue } };
      break;
    case 'readBook':
      if (isId(data.itemId))
        return { ok: true, message: { type: 'readBook', itemId: data.itemId } };
      break;
    case 'writeBook':
      if (
        isId(data.itemId) &&
        typeof data.title === 'string' &&
        typeof data.text === 'string' &&
        typeof data.page === 'number' &&
        Number.isInteger(data.page) &&
        data.page >= 0 &&
        data.page < BOOK_PAGES
      )
        return {
          ok: true,
          message: {
            type: 'writeBook',
            itemId: data.itemId,
            title: cleanBookTitle(data.title),
            page: data.page,
            text: cleanBookPage(data.text),
          },
        };
      break;
    case 'gm': {
      const command = parseGmCommand(data.command);
      if (command) return { ok: true, message: { type: 'gm', command } };
      break;
    }
    case 'buyMount':
      if (isId(data.vendorId) && isMountKind(data.mount))
        return {
          ok: true,
          message: { type: 'buyMount', vendorId: data.vendorId, mount: data.mount },
        };
      break;
    case 'mount':
      if (isId(data.petId)) return { ok: true, message: { type: 'mount', petId: data.petId } };
      break;
    case 'dismount':
      return { ok: true, message: { type: 'dismount' } };
    case 'releasePet':
      return { ok: true, message: { type: 'releasePet' } };
    case 'setWarMode':
      if (typeof data.war === 'boolean')
        return { ok: true, message: { type: 'setWarMode', war: data.war } };
      break;
    case 'track':
      if (isTrackingCategory(data.category))
        return { ok: true, message: { type: 'track', category: data.category } };
      break;
    case 'followTrack':
      if (isId(data.targetId))
        return { ok: true, message: { type: 'followTrack', targetId: data.targetId } };
      break;
    case 'useSkill':
      if (isActiveSkill(data.skill))
        return {
          ok: true,
          message: {
            type: 'useSkill',
            skill: data.skill,
            ...(isId(data.targetId) ? { targetId: data.targetId } : {}),
          },
        };
      break;
    case 'openCorpse':
    case 'lootAll':
      if (isId(data.corpseId))
        return { ok: true, message: { type: data.type, corpseId: data.corpseId } };
      break;
    case 'useDoor': {
      const position = asPosition(data.position);
      if (position) return { ok: true, message: { type: 'useDoor', position } };
      break;
    }
    case 'useItem':
      if (isId(data.itemId)) return { ok: true, message: { type: 'useItem', itemId: data.itemId } };
      break;
  }
  return { ok: false, error: `Mensaje inválido: ${String(data.type)}` };
}

const SERVER_TYPE_FLAGS: Readonly<Record<ServerMessageType, true>> = {
  welcome: true,
  gmCatalog: true,
  tracking: true,
  trackPoint: true,
  container: true,
  containerClosed: true,
  book: true,
  treasureMap: true,
  ships: true,
  shipMoved: true,
  shipPanel: true,
  houses: true,
  houseChanged: true,
  houseRemoved: true,
  housePanel: true,
  cannonShot: true,
  questOffer: true,
  quests: true,
  legends: true,
  joinRejected: true,
  account: true,
  mobileAppeared: true,
  mobileDisappeared: true,
  mobileMoved: true,
  moveAck: true,
  moveRejected: true,
  chat: true,
  groundItems: true,
  inventory: true,
  playerEquipment: true,
  vitals: true,
  mobileHealth: true,
  combatTarget: true,
  swing: true,
  skills: true,
  castStart: true,
  spellEffect: true,
  effects: true,
  mobileTeleported: true,
  worldTime: true,
  mobileStatus: true,
  social: true,
  corpse: true,
  corpseClosed: true,
  mountChanged: true,
  mobileLook: true,
  hiddenChanged: true,
  warModeChanged: true,
  door: true,
  system: true,
};
// Con un Record el compilador exige cada tipo nuevo: si falta, el cliente lo descartaría.
const SERVER_TYPES: ReadonlySet<string> = new Set(Object.keys(SERVER_TYPE_FLAGS));

/** Decodifica un mensaje del servidor (fuente confiable: solo se verifica el tipo). */
export function decodeServerMessage(raw: string): DecodeResult<ServerMessage> {
  const data = parseObject(raw);
  if (!data || !SERVER_TYPES.has(String(data.type))) {
    return { ok: false, error: 'Mensaje del servidor desconocido' };
  }
  return { ok: true, message: data as unknown as ServerMessage };
}

/** Un comando del administrador, con textos cortos y cantidades razonables. */
function parseGmCommand(raw: unknown): GmCommand | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const c = raw as Record<string, unknown>;
  const text = (value: unknown, max = 60): value is string =>
    typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  const count = (value: unknown, max: number): value is number =>
    Number.isInteger(value) && (value as number) >= 1 && (value as number) <= max;
  const who = (): { name?: string; targetId?: string } => ({
    ...(text(c.name) ? { name: c.name } : {}),
    ...(isId(c.targetId) ? { targetId: c.targetId } : {}),
  });
  switch (c.kind) {
    case 'summon':
      return text(c.creature) && count(c.amount, 20) && typeof c.tame === 'boolean'
        ? { kind: 'summon', creature: c.creature, amount: c.amount, tame: c.tame }
        : null;
    case 'creatures':
      return { kind: 'creatures' };
    case 'item':
      return text(c.item) && count(c.amount, 60000)
        ? { kind: 'item', item: c.item, amount: c.amount }
        : null;
    case 'catalog':
      return { kind: 'catalog' };
    case 'delete':
      return isId(c.itemId) ? { kind: 'delete', itemId: c.itemId } : null;
    case 'mount':
      return text(c.mount) ? { kind: 'mount', mount: c.mount } : null;
    case 'slay':
      return isId(c.targetId) ? { kind: 'slay', targetId: c.targetId } : null;
    case 'heal':
      return { kind: 'heal', ...who() };
    case 'resurrect':
      return { kind: 'resurrect', ...who() };
    case 'bring':
      return text(c.name) ? { kind: 'bring', name: c.name } : null;
    case 'goTo':
      return text(c.name) ? { kind: 'goTo', name: c.name } : null;
    case 'clear':
      return count(c.radius, 30) ? { kind: 'clear', radius: c.radius } : null;
    case 'announce':
      return text(c.text, 300) ? { kind: 'announce', text: c.text } : null;
    default:
      return null;
  }
}

const SHIP_ACTIONS: readonly ShipAction[] = [
  'panel',
  'fire-port',
  'fire-starboard',
  'repair',
  'dock',
  'hold',
];

function isShipAction(value: unknown): value is ShipAction {
  return typeof value === 'string' && (SHIP_ACTIONS as readonly string[]).includes(value);
}

/** Nombres de personajes y de barcos que manda el capitán: texto corto. */
function asShortName(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 30
    ? value.trim()
    : null;
}

function asShipSecurityChange(value: unknown): ShipSecurityChange | null {
  if (typeof value !== 'object' || value === null) return null;
  const change = value as Record<string, unknown>;
  const name = asShortName(change.name);
  switch (change.kind) {
    case 'set':
      return name && isShipLevel(change.level) ? { kind: 'set', name, level: change.level } : null;
    case 'remove':
      return name ? { kind: 'remove', name } : null;
    case 'rename':
      return name ? { kind: 'rename', name } : null;
    case 'default':
      return (change.who === 'everyone' || change.who === 'party' || change.who === 'guild') &&
        isShipLevel(change.level)
        ? { kind: 'default', who: change.who, level: change.level }
        : null;
    default:
      return null;
  }
}

function isHouseAction(value: unknown): value is HouseAction {
  return value === 'panel' || value === 'eject' || value === 'demolish';
}

function asHouseSecurityChange(value: unknown): HouseSecurityChange | null {
  if (typeof value !== 'object' || value === null) return null;
  const change = value as Record<string, unknown>;
  const name = asShortName(change.name);
  switch (change.kind) {
    case 'add':
    case 'remove':
      return name && isHouseList(change.list)
        ? { kind: change.kind, list: change.list, name }
        : null;
    case 'rename':
      return name ? { kind: 'rename', name } : null;
    case 'public':
      return typeof change.on === 'boolean' ? { kind: 'public', on: change.on } : null;
    default:
      return null;
  }
}
