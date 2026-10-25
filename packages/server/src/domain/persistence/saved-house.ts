import type { Position } from '@fenix/shared/geometry/position';
import {
  MAX_HOUSE_LIST,
  isHouseKind,
  isHouseName,
  type HouseKind,
  type HouseSecurity,
} from '@fenix/shared/housing/houses';
import { House } from '../housing/house';
import type { World } from '../world';
import { captureItem, parseSavedItem, restoreItem, type SavedItem } from './saved-character';

/** Versión del formato de las casas guardadas. */
export const HOUSE_SAVE_VERSION = 1;

/** Una casa como datos planos: dónde está, de quién es, quién entra y lo que tiene adentro. */
export interface SavedHouse {
  readonly version: typeof HOUSE_SAVE_VERSION;
  readonly id: string;
  readonly kind: HouseKind;
  readonly x: number;
  readonly y: number;
  readonly slots: readonly Position[];
  readonly name: string;
  readonly owner: string;
  readonly security: HouseSecurity;
  /** En qué mundo está (ver `World.mapId`): en otro mundo, la casa vuelve a ser escritura. */
  readonly world: string;
  /** Lo que hay en el piso (con el tile donde está). */
  readonly floor: readonly { readonly at: Position; readonly item: SavedItem }[];
  /** Lo de adentro de cada cofre, en el orden de los cofres del plano. */
  readonly chests: readonly (readonly SavedItem[])[];
}

/** Toma una foto de la casa con lo que tiene adentro. */
export function captureHouse(world: World, house: House): SavedHouse {
  const chests = new Set(house.chestIds);
  const floor: { at: Position; item: SavedItem }[] = [];
  for (const item of world.items.all()) {
    if (item.location.type !== 'ground' || chests.has(item.id)) continue;
    const at = item.location.position;
    if (house.contains(at)) floor.push({ at, item: captureItem(world, item, { x: 0, y: 0 }) });
  }
  return {
    version: HOUSE_SAVE_VERSION,
    id: house.id,
    kind: house.kind,
    x: house.origin.x,
    y: house.origin.y,
    slots: house.slots,
    name: house.name,
    owner: house.owner,
    security: house.security,
    world: world.mapId,
    floor,
    chests: house.chestIds.map((id) =>
      world.items
        .contentsOf(id)
        .flatMap((item) =>
          item.location.type === 'container'
            ? [captureItem(world, item, item.location.position)]
            : [],
        ),
    ),
  };
}

/** Pone en el mundo lo que la casa tenía en el piso y en los cofres (los cofres ya están). */
export function restoreHouseItems(
  world: World,
  house: House,
  saved: SavedHouse,
  nextId: () => string,
): void {
  for (const { at, item } of saved.floor)
    if (house.contains(at)) restoreItem(world, item, { type: 'ground', position: at }, nextId);
  saved.chests.forEach((contents, i) => {
    const chestId = house.chestIds[i];
    if (!chestId) return;
    for (const item of contents)
      restoreItem(
        world,
        item,
        {
          type: 'container',
          containerId: chestId,
          position: item.location.type === 'equipment' ? { x: 0, y: 0 } : item.location.position,
        },
        nextId,
      );
  });
}

// ── Lectura defensiva ────────────────────────────────────────────────

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isInt = (value: unknown): value is number => Number.isSafeInteger(value);
const asPosition = (value: unknown): Position | null =>
  isObject(value) && isInt(value.x) && isInt(value.y) ? { x: value.x, y: value.y } : null;

function names(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0 && n.length <= 30)
    .slice(0, MAX_HOUSE_LIST);
}

/** Valida una casa leída de almacenamiento (null si está dañada). */
export function parseSavedHouse(value: unknown): SavedHouse | null {
  if (!isObject(value) || value.version !== HOUSE_SAVE_VERSION) return null;
  const { id, kind, x, y, name, owner, world } = value;
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null;
  if (!isHouseKind(kind) || !isInt(x) || !isInt(y)) return null;
  if (!isHouseName(name) || typeof owner !== 'string' || owner.length === 0) return null;
  if (typeof world !== 'string') return null;
  const slots = Array.isArray(value.slots) ? value.slots.map(asPosition) : [];
  if (slots.some((s) => s === null)) return null;
  const security = isObject(value.security) ? value.security : {};
  const floor = Array.isArray(value.floor)
    ? value.floor.flatMap((entry) => {
        if (!isObject(entry)) return [];
        const at = asPosition(entry.at);
        const item = parseSavedItem(entry.item);
        return at && item ? [{ at, item }] : [];
      })
    : [];
  const chests = Array.isArray(value.chests)
    ? value.chests.map((contents) =>
        Array.isArray(contents) ? contents.flatMap((item) => parseSavedItem(item) ?? []) : [],
      )
    : [];
  return {
    version: HOUSE_SAVE_VERSION,
    id,
    kind,
    x,
    y,
    slots: slots as Position[],
    name: name.trim(),
    owner,
    security: {
      public: security.public === true,
      coOwners: names(security.coOwners),
      friends: names(security.friends),
      banned: names(security.banned),
    },
    world,
    floor,
    chests,
  };
}

/** Lee la lista de casas guardadas (descarta las dañadas). */
export function parseHouseList(raw: string): SavedHouse[] {
  const value: unknown = JSON.parse(raw);
  return Array.isArray(value) ? value.flatMap((h) => parseSavedHouse(h) ?? []) : [];
}

/** La casa guardada, de nuevo como casa (sin poner todavía lo de adentro). */
export function houseOf(saved: SavedHouse): House {
  return new House(
    saved.id,
    saved.kind,
    { x: saved.x, y: saved.y },
    saved.slots,
    saved.name,
    saved.owner,
    saved.security,
  );
}
