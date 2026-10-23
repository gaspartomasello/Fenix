import {
  LEGEND_DONE,
  isLegendId,
  ITEMS,
  BOOK_PAGES,
  MAX_QUESTS,
  isCreatureKind,
  isDyeHue,
  isTreasureLevel,
  DEFAULT_SHIP_SECURITY,
  MAX_SHIP_MANIFEST,
  SHIPS,
  SHIP_DEEDS,
  isShipKind,
  isShipLevel,
  isShipName,
  type ShipLevel,
  type TreasureMark,
  type QuestGoal,
  type LegendId,
  type QuestProgress,
  MAX_STACK,
  cleanBookPage,
  cleanBookTitle,
  type BookText,
  PLAYER_ATTRIBUTES,
  SKILL_KEYS,
  SKILL_MAX,
  STARTING_SKILLS,
  STAT_CAP,
  isAppearance,
  isDirection,
  isEquipmentSlot,
  isItemKind,
  isMountKind,
  type Appearance,
  type Attributes,
  type Direction,
  type EquipmentSlot,
  type ItemKind,
  type RuneMark,
  type MountKind,
  type Position,
  type SkillValues,
} from '@fenix/shared';
import { Creature } from '../creatures/creature';
import type { ShipRecord } from '../ships/ship';
import type { Player } from '../player';
import type { World } from '../world';

/** Versión del formato; si cambia, se agrega una migración al leer. */
export const SAVE_VERSION = 1;

export type SavedItemLocation =
  | { readonly type: 'backpack' | 'bank'; readonly position: Position }
  | { readonly type: 'equipment'; readonly slot: EquipmentSlot };

export interface SavedItem {
  readonly kind: ItemKind;
  readonly amount: number;
  readonly location: SavedItemLocation;
  /** Runa marcada: el lugar que guarda. */
  readonly mark?: RuneMark;
  /** Libro: lo que tiene escrito. */
  readonly book?: BookText;
  /** Teñido: su color. */
  readonly hue?: number;
  /** Mapa del tesoro: dónde está enterrado. */
  readonly treasure?: TreasureMark;
  /** Maqueta de barco: el barco que guarda. */
  readonly ship?: ShipRecord;
  /** Equipo inicial: no se pierde al morir ni se puede dar. */
  readonly newbie?: true;
  /** Bolsa o caja: lo que lleva adentro (con su lugar en la ventana). */
  readonly contents?: readonly SavedItem[];
}

/** Todo lo que sobrevive a desconectarse: un personaje como datos planos (JSON). */
export interface SavedCharacter {
  readonly version: typeof SAVE_VERSION;
  readonly name: string;
  /** Hash de la contraseña; null en el modo solo, que no la pide. */
  readonly passwordHash: string | null;
  /** La cuenta a la que pertenece (los personajes viejos no la tienen). */
  readonly account?: string;
  readonly appearance: Appearance;
  readonly position: Position;
  readonly direction: Direction;
  /** En qué mundo estaba (ver `World.mapId`); los viejos no lo tienen. */
  readonly world?: string;
  readonly vitals: { readonly hits: number; readonly mana: number; readonly stamina: number };
  readonly dead: boolean;
  readonly skills: SkillValues;
  /** Atributos entrenados (los personajes viejos no los tienen: se usan los iniciales). */
  readonly attributes: Attributes;
  readonly reputation: { readonly fame: number; readonly karma: number; readonly murders: number };
  readonly guild: { readonly name: string; readonly tag: string } | null;
  readonly items: readonly SavedItem[];
  /** Su montura: montada o suelta a su lado (los personajes viejos no tienen). */
  readonly mount: { readonly kind: MountKind; readonly riding: boolean } | null;
  /** Misiones aceptadas. */
  readonly quests?: readonly QuestProgress[];
  /** Leyendas que conoce: paso en que va cada una. */
  readonly legends?: Readonly<Partial<Record<LegendId, number>>>;
}

/** Toma una foto del personaje conectado (con su mochila, equipo y banco). */
export function captureCharacter(
  player: Player,
  world: World,
  passwordHash: string | null,
  account?: string,
): SavedCharacter {
  const owned = [
    ...world.items.backpackOf(player.id),
    ...world.items.equipmentOf(player.id),
    ...world.items.bankOf(player.id),
  ];
  const guild = world.guilds.of(player.name);
  const { hits, mana, stamina } = player.combat.current;
  const pet = world.petOf(player.id);
  const petKind = pet && isMountKind(pet.body) ? pet.body : null;
  return {
    version: SAVE_VERSION,
    name: player.name,
    passwordHash,
    ...(account ? { account } : {}),
    appearance: player.appearance,
    position: player.position,
    world: world.mapId,
    direction: player.direction,
    vitals: { hits, mana, stamina },
    dead: player.combat.isDead,
    skills: player.skills.snapshot(),
    attributes: player.combat.baseAttributes,
    reputation: {
      fame: player.reputation.fame,
      karma: player.reputation.karma,
      murders: player.reputation.murders,
    },
    guild: guild ? { name: guild.name, tag: guild.tag } : null,
    items: owned
      .flatMap((item): SavedItem[] => {
        const { location } = item;
        const mark = {
          ...(item.mark ? { mark: item.mark } : {}),
          ...(item.book ? { book: item.book } : {}),
          ...(item.hue !== null ? { hue: item.hue } : {}),
          ...(item.treasure ? { treasure: item.treasure } : {}),
          ...(item.ship ? { ship: item.ship } : {}),
          ...(item.newbie ? { newbie: true as const } : {}),
          ...(ITEMS[item.kind].capacity ? { contents: savedContents(world, item.id) } : {}),
        };
        if (location.type === 'equipment')
          return [
            {
              kind: item.kind,
              amount: item.amount,
              location: { type: 'equipment', slot: location.slot },
              ...mark,
            },
          ];
        if (location.type === 'backpack' || location.type === 'bank')
          return [
            {
              kind: item.kind,
              amount: item.amount,
              location: { type: location.type, position: location.position },
              ...mark,
            },
          ];
        return [];
      })
      .concat(shipDeeds(world, player.name)),
    ...(player.quests.length > 0 ? { quests: player.quests } : {}),
    ...(player.legends.size > 0 ? { legends: Object.fromEntries(player.legends) } : {}),
    mount: player.mount
      ? { kind: player.mount, riding: true }
      : petKind
        ? { kind: petKind, riding: false }
        : null,
  };
}

/**
 * Los barcos que el personaje tiene en el agua se guardan como su maqueta en
 * el banco: si el servidor se reinicia, el barco no se pierde. Al volver a
 * entrar, si el barco sigue en el agua, la maqueta repetida se descarta.
 */
function shipDeeds(world: World, owner: string): SavedItem[] {
  return [...world.ships.values()]
    .filter((ship) => ship.owner === owner)
    .map((ship) => ({
      kind: SHIP_DEEDS[ship.kind],
      amount: 1,
      location: { type: 'bank', position: { x: 0, y: 0 } },
      ship: ship.record(),
    }));
}

// ── Lectura defensiva: los datos vienen de un archivo o del navegador ──

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isPosition = (value: unknown): value is Position =>
  isObject(value) && isNumber(value.x) && isNumber(value.y);

function parseSkills(value: unknown): SkillValues {
  const source = isObject(value) ? value : {};
  const skills = { ...STARTING_SKILLS };
  for (const key of SKILL_KEYS) {
    const raw = source[key];
    if (isNumber(raw)) skills[key] = Math.min(SKILL_MAX, Math.max(0, Math.round(raw)));
  }
  return skills;
}

function parseAttributes(value: unknown): Attributes {
  const source = isObject(value) ? value : {};
  const read = (key: keyof Attributes): number => {
    const raw = source[key];
    return isNumber(raw)
      ? Math.min(STAT_CAP, Math.max(10, Math.round(raw)))
      : PLAYER_ATTRIBUTES[key];
  };
  return {
    strength: read('strength'),
    dexterity: read('dexterity'),
    intelligence: read('intelligence'),
  };
}

/** Lo de adentro de una bolsa, con lo de adentro de sus bolsas (lugar en la ventana como posición). */
function savedContents(world: World, containerId: string, depth = 0): SavedItem[] {
  if (depth > 5) return [];
  return world.items.contentsOf(containerId).flatMap((inner): SavedItem[] => {
    if (inner.location.type !== 'container') return [];
    return [
      {
        kind: inner.kind,
        amount: inner.amount,
        location: { type: 'backpack', position: inner.location.position },
        ...(inner.mark ? { mark: inner.mark } : {}),
        ...(inner.book ? { book: inner.book } : {}),
        ...(inner.hue !== null ? { hue: inner.hue } : {}),
        ...(inner.newbie ? { newbie: true as const } : {}),
        ...(inner.treasure ? { treasure: inner.treasure } : {}),
        ...(inner.ship ? { ship: inner.ship } : {}),
        ...(ITEMS[inner.kind].capacity
          ? { contents: savedContents(world, inner.id, depth + 1) }
          : {}),
      },
    ];
  });
}

function parseShipRecord(value: unknown): ShipRecord | undefined {
  if (!isObject(value) || typeof value.id !== 'string' || !isShipKind(value.kind)) return undefined;
  if (!isShipName(value.name) || !isNumber(value.hits)) return undefined;
  const security = isObject(value.security) ? value.security : {};
  const level = (v: unknown, fallback: ShipLevel): ShipLevel => (isShipLevel(v) ? v : fallback);
  const manifest: Record<string, ShipLevel> = {};
  if (isObject(security.manifest))
    for (const [name, v] of Object.entries(security.manifest).slice(0, MAX_SHIP_MANIFEST))
      if (isShipLevel(v) && name.length <= 30) manifest[name.toLowerCase()] = v;
  return {
    id: value.id.slice(0, 40),
    kind: value.kind,
    name: value.name.trim(),
    hits: Math.max(1, Math.min(SHIPS[value.kind].maxHits, Math.round(value.hits))),
    security: {
      manifest,
      everyone: level(security.everyone, DEFAULT_SHIP_SECURITY.everyone),
      party: level(security.party, DEFAULT_SHIP_SECURITY.party),
      guild: level(security.guild, DEFAULT_SHIP_SECURITY.guild),
    },
  };
}

function parseTreasure(value: unknown): TreasureMark | undefined {
  if (!isObject(value) || !isNumber(value.x) || !isNumber(value.y)) return undefined;
  if (!isTreasureLevel(value.level)) return undefined;
  return { x: Math.round(value.x), y: Math.round(value.y), level: value.level };
}

function parseItem(value: unknown, depth = 0): SavedItem | null {
  if (!isObject(value) || !isItemKind(value.kind) || !isNumber(value.amount)) return null;
  const amount = Math.min(MAX_STACK, Math.max(1, Math.round(value.amount)));
  const location = value.location;
  if (!isObject(location)) return null;
  const mark = parseMark(value.mark);
  const contents =
    Array.isArray(value.contents) && depth < 5
      ? value.contents.flatMap((inner) => parseItem(inner, depth + 1) ?? [])
      : [];
  const book = parseBook(value.book);
  const hue = isNumber(value.hue) && isDyeHue(value.hue) ? value.hue : undefined;
  const treasure = parseTreasure(value.treasure);
  const ship = parseShipRecord(value.ship);
  const extra = {
    ...(mark ? { mark } : {}),
    ...(book ? { book } : {}),
    ...(hue !== undefined ? { hue } : {}),
    ...(treasure ? { treasure } : {}),
    ...(ship ? { ship } : {}),
    ...(value.newbie === true ? { newbie: true as const } : {}),
    ...(contents.length > 0 ? { contents } : {}),
  };
  if (location.type === 'equipment' && isEquipmentSlot(location.slot))
    return {
      kind: value.kind,
      amount,
      location: { type: 'equipment', slot: location.slot },
      ...extra,
    };
  if ((location.type === 'backpack' || location.type === 'bank') && isPosition(location.position))
    return {
      kind: value.kind,
      amount,
      location: { type: location.type, position: location.position },
      ...extra,
    };
  return null;
}

function parseBook(value: unknown): BookText | null {
  if (!isObject(value) || typeof value.title !== 'string' || !Array.isArray(value.pages))
    return null;
  const pages = value.pages
    .slice(0, BOOK_PAGES)
    .map((p) => (typeof p === 'string' ? cleanBookPage(p) : ''));
  return {
    title: cleanBookTitle(value.title),
    author: typeof value.author === 'string' ? value.author.slice(0, 40) : '',
    pages,
    ...(value.sealed === true ? { sealed: true } : {}),
  };
}

const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' ? value.slice(0, max) : null;

function parseQuest(value: unknown): QuestProgress | null {
  if (!isObject(value) || !isObject(value.goal) || !isObject(value.reward)) return null;
  const giver = text(value.giver, 60);
  const town = text(value.town, 60);
  const title = text(value.title, 80);
  const story = text(value.story, 600);
  if (!giver || !town || !title || story === null) return null;
  const g = value.goal;
  const count = isNumber(g.count) ? Math.max(1, Math.min(100, Math.round(g.count))) : 1;
  let goal: QuestGoal;
  if (g.kind === 'slay' && isCreatureKind(g.creature))
    goal = { kind: 'slay', creature: g.creature, count };
  else if (g.kind === 'gather' && isItemKind(g.item))
    goal = { kind: 'gather', item: g.item, count };
  else if (g.kind === 'deliver' && text(g.to, 60) && text(g.town, 60))
    goal = { kind: 'deliver', to: String(g.to).slice(0, 60), town: String(g.town).slice(0, 60) };
  else return null;
  const r = value.reward;
  const gold = isNumber(r.gold) ? Math.max(0, Math.min(10000, Math.round(r.gold))) : 0;
  const reward =
    isItemKind(r.item) && isNumber(r.amount)
      ? { gold, item: r.item, amount: Math.max(1, Math.min(100, Math.round(r.amount))) }
      : { gold };
  const progress = isNumber(value.progress)
    ? Math.max(0, Math.min(count, Math.round(value.progress)))
    : 0;
  return { giver, town, title, story, goal, reward, progress };
}

function parseMark(value: unknown): RuneMark | null {
  if (!isObject(value) || !isNumber(value.x) || !isNumber(value.y)) return null;
  const label = typeof value.label === 'string' ? value.label.slice(0, 60) : 'Tierras salvajes';
  return { x: Math.round(value.x), y: Math.round(value.y), label };
}

/** Valida un personaje leído de almacenamiento. Devuelve null si está dañado. */
export function parseSavedCharacter(value: unknown): SavedCharacter | null {
  if (!isObject(value) || value.version !== SAVE_VERSION) return null;
  const { name, passwordHash, appearance, position, direction, vitals, reputation, guild } = value;
  if (typeof name !== 'string' || !isAppearance(appearance) || !isPosition(position)) return null;
  if (passwordHash !== null && typeof passwordHash !== 'string') return null;
  if (!isDirection(direction) || !isObject(vitals) || !isObject(reputation)) return null;
  const number = (source: Json, key: string): number => {
    const raw = source[key];
    return isNumber(raw) ? raw : 0;
  };
  const items = Array.isArray(value.items) ? value.items : [];
  return {
    version: SAVE_VERSION,
    name,
    passwordHash,
    ...(typeof value.account === 'string' ? { account: value.account } : {}),
    appearance,
    position: { x: Math.round(position.x), y: Math.round(position.y) },
    direction,
    ...(typeof value.world === 'string' ? { world: value.world } : {}),
    vitals: {
      hits: number(vitals, 'hits'),
      mana: number(vitals, 'mana'),
      stamina: number(vitals, 'stamina'),
    },
    dead: value.dead === true,
    skills: parseSkills(value.skills),
    attributes: parseAttributes(value.attributes),
    reputation: {
      fame: number(reputation, 'fame'),
      karma: number(reputation, 'karma'),
      murders: Math.max(0, Math.round(number(reputation, 'murders'))),
    },
    guild:
      isObject(guild) && typeof guild.name === 'string' && typeof guild.tag === 'string'
        ? { name: guild.name, tag: guild.tag }
        : null,
    items: items.flatMap((item) => parseItem(item) ?? []),
    ...(Array.isArray(value.quests)
      ? { quests: value.quests.slice(0, MAX_QUESTS).flatMap((q) => parseQuest(q) ?? []) }
      : {}),
    ...(isObject(value.legends)
      ? {
          legends: Object.fromEntries(
            Object.entries(value.legends).filter(
              ([id, step]) =>
                isLegendId(id) && typeof step === 'number' && step >= 0 && step <= LEGEND_DONE,
            ),
          ),
        }
      : {}),
    mount:
      isObject(value.mount) && isMountKind(value.mount.kind)
        ? { kind: value.mount.kind, riding: value.mount.riding === true }
        : null,
  };
}

/** Vuelve a poner en el mundo un personaje guardado, con sus objetos. */
export function restoreCharacter(
  saved: SavedCharacter,
  world: World,
  nextId: () => string,
  random: () => number,
  now: number,
): Player {
  const player = world.spawn(
    {
      id: nextId(),
      name: saved.name,
      appearance: saved.appearance,
      skills: saved.skills,
      attributes: saved.attributes,
    },
    random,
    // Si el mundo cambió desde que se guardó, el lugar guardado no sirve: a la capital.
    (saved.world ?? '') === world.mapId
      ? { position: saved.position, direction: saved.direction }
      : undefined,
  );
  player.combat.restore(saved.vitals, saved.dead);
  player.reputation.restore(saved.reputation, now);
  if (saved.guild) world.guilds.restore(saved.name, saved.guild.name, saved.guild.tag);

  const usedSlots = new Set<EquipmentSlot>();
  for (const item of saved.items) {
    const { location } = item;
    if (location.type === 'equipment' && !usedSlots.has(location.slot)) {
      usedSlots.add(location.slot);
      const restored = world.items.add(nextId(), item.kind, item.amount, {
        type: 'equipment',
        ownerId: player.id,
        slot: location.slot,
      });
      restored.mark = item.mark ?? null;
      restored.book = item.book ?? null;
      restored.hue = item.hue ?? null;
      restored.treasure = item.treasure ?? null;
      restored.ship = item.ship ?? null;
      restored.newbie = item.newbie === true;
    } else {
      const restored = world.items.add(nextId(), item.kind, item.amount, {
        type: location.type === 'bank' ? 'bank' : 'backpack',
        ownerId: player.id,
        position: location.type === 'equipment' ? { x: 0, y: 0 } : location.position,
      });
      restored.mark = item.mark ?? null;
      restored.book = item.book ?? null;
      restored.hue = item.hue ?? null;
      restored.treasure = item.treasure ?? null;
      restored.ship = item.ship ?? null;
      restored.newbie = item.newbie === true;
      restoreContents(world, restored.id, item.contents ?? [], nextId);
    }
  }
  player.quests = [...(saved.quests ?? [])];
  player.legends = new Map(
    Object.entries(saved.legends ?? {}).flatMap(([id, step]) =>
      isLegendId(id) && step !== undefined ? [[id, step] as const] : [],
    ),
  );
  if (saved.mount?.riding) player.mount = saved.mount.kind;
  else if (saved.mount)
    world.addCreature(
      new Creature(nextId(), saved.mount.kind, freeSpotNear(world, player.position), {
        ownerId: player.id,
        expiresAt: null,
      }),
    );
  return player;
}

/** Un tile libre al lado (para que aparezca la montura); si no hay, el mismo. */
export function freeSpotNear(world: World, at: Position): Position {
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    const spot = { x: at.x + dx, y: at.y + dy };
    if (world.map.isWalkable(spot) && !world.isOccupied(spot)) return spot;
  }
  return at;
}

/** Vuelve a poner adentro de una bolsa lo que tenía guardado. */
function restoreContents(
  world: World,
  containerId: string,
  contents: readonly SavedItem[],
  nextId: () => string,
): void {
  for (const inner of contents) {
    const restored = world.items.add(nextId(), inner.kind, inner.amount, {
      type: 'container',
      containerId,
      position: inner.location.type === 'equipment' ? { x: 0, y: 0 } : inner.location.position,
    });
    restored.mark = inner.mark ?? null;
    restored.book = inner.book ?? null;
    restored.hue = inner.hue ?? null;
    restored.treasure = inner.treasure ?? null;
    restored.ship = inner.ship ?? null;
    restored.newbie = inner.newbie === true;
    restoreContents(world, restored.id, inner.contents ?? [], nextId);
  }
}
