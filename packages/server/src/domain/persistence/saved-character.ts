import {
  MAX_STACK,
  PLAYER_ATTRIBUTES,
  SKILL_KEYS,
  SKILL_MAX,
  STARTING_SKILLS,
  STAT_CAP,
  isAppearance,
  isDirection,
  isEquipmentSlot,
  isItemKind,
  type Appearance,
  type Attributes,
  type Direction,
  type EquipmentSlot,
  type ItemKind,
  type Position,
  type SkillValues,
} from '@fenix/shared';
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
}

/** Todo lo que sobrevive a desconectarse: un personaje como datos planos (JSON). */
export interface SavedCharacter {
  readonly version: typeof SAVE_VERSION;
  readonly name: string;
  /** Hash de la contraseña; null en el modo solo, que no la pide. */
  readonly passwordHash: string | null;
  readonly appearance: Appearance;
  readonly position: Position;
  readonly direction: Direction;
  readonly vitals: { readonly hits: number; readonly mana: number; readonly stamina: number };
  readonly dead: boolean;
  readonly skills: SkillValues;
  /** Atributos entrenados (los personajes viejos no los tienen: se usan los iniciales). */
  readonly attributes: Attributes;
  readonly reputation: { readonly fame: number; readonly karma: number; readonly murders: number };
  readonly guild: { readonly name: string; readonly tag: string } | null;
  readonly items: readonly SavedItem[];
}

/** Toma una foto del personaje conectado (con su mochila, equipo y banco). */
export function captureCharacter(
  player: Player,
  world: World,
  passwordHash: string | null,
): SavedCharacter {
  const owned = [
    ...world.items.backpackOf(player.id),
    ...world.items.equipmentOf(player.id),
    ...world.items.bankOf(player.id),
  ];
  const guild = world.guilds.of(player.name);
  const { hits, mana, stamina } = player.combat.current;
  return {
    version: SAVE_VERSION,
    name: player.name,
    passwordHash,
    appearance: player.appearance,
    position: player.position,
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
    items: owned.flatMap((item): SavedItem[] => {
      const { location } = item;
      if (location.type === 'equipment')
        return [
          {
            kind: item.kind,
            amount: item.amount,
            location: { type: 'equipment', slot: location.slot },
          },
        ];
      if (location.type === 'backpack' || location.type === 'bank')
        return [
          {
            kind: item.kind,
            amount: item.amount,
            location: { type: location.type, position: location.position },
          },
        ];
      return [];
    }),
  };
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

function parseItem(value: unknown): SavedItem | null {
  if (!isObject(value) || !isItemKind(value.kind) || !isNumber(value.amount)) return null;
  const amount = Math.min(MAX_STACK, Math.max(1, Math.round(value.amount)));
  const location = value.location;
  if (!isObject(location)) return null;
  if (location.type === 'equipment' && isEquipmentSlot(location.slot))
    return { kind: value.kind, amount, location: { type: 'equipment', slot: location.slot } };
  if ((location.type === 'backpack' || location.type === 'bank') && isPosition(location.position))
    return {
      kind: value.kind,
      amount,
      location: { type: location.type, position: location.position },
    };
  return null;
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
    appearance,
    position: { x: Math.round(position.x), y: Math.round(position.y) },
    direction,
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
    { position: saved.position, direction: saved.direction },
  );
  player.combat.restore(saved.vitals, saved.dead);
  player.reputation.restore(saved.reputation, now);
  if (saved.guild) world.guilds.restore(saved.name, saved.guild.name, saved.guild.tag);

  const usedSlots = new Set<EquipmentSlot>();
  for (const item of saved.items) {
    const { location } = item;
    if (location.type === 'equipment' && !usedSlots.has(location.slot)) {
      usedSlots.add(location.slot);
      world.items.add(nextId(), item.kind, item.amount, {
        type: 'equipment',
        ownerId: player.id,
        slot: location.slot,
      });
    } else {
      world.items.add(nextId(), item.kind, item.amount, {
        type: location.type === 'bank' ? 'bank' : 'backpack',
        ownerId: player.id,
        position: location.type === 'equipment' ? { x: 0, y: 0 } : location.position,
      });
    }
  }
  return player;
}
