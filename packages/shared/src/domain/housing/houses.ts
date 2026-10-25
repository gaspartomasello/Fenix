import type { StaticKind } from '../world/statics';
import { Terrain } from '../world/terrain';

/**
 * Casas de los jugadores, como en Ultima Online: se compran como escritura al
 * arquitecto, se levantan en las tierras salvajes (fuera de los pueblos y de
 * los lugares con nombre) y quedan del dueño. Vienen vacías, con sus cofres:
 * lo demás lo pone cada uno. Hay casas de distintos tamaños y estilos, desde
 * una casilla de tablas hasta una fortaleza de piedra con dos pisos y azotea.
 */
export const HOUSE_KINDS = [
  'wood-shack',
  'log-cabin',
  'stone-cottage',
  'sandstone-patio',
  'plank-house',
  'stone-house',
  'basalt-tower',
  'stone-keep',
  'fortress',
] as const;
export type HouseKind = (typeof HOUSE_KINDS)[number];

export function isHouseKind(value: unknown): value is HouseKind {
  return typeof value === 'string' && (HOUSE_KINDS as readonly string[]).includes(value);
}

/** El material de las paredes: cada uno con sus ventanas, su piso, su techo y su escalera. */
export type HouseStyle = 'plank' | 'log' | 'stone' | 'basalt' | 'sandstone';

export interface HouseWalls {
  readonly x: StaticKind;
  readonly y: StaticKind;
  readonly corner: StaticKind;
  readonly post: StaticKind;
  readonly windowX: StaticKind;
  readonly windowY: StaticKind;
}

export interface HouseStyleDefinition {
  readonly name: string;
  readonly walls: HouseWalls;
  /** El piso de adentro. */
  readonly floor: Terrain;
  /** Arriba de todo: azotea de piedra con almenas o techo de tablas con baranda. */
  readonly roof: 'stone' | 'wood';
  readonly stairs: StaticKind;
}

const wallsOf = (prefix: string, window: string): HouseWalls => ({
  x: `${prefix}-x` as StaticKind,
  y: `${prefix}-y` as StaticKind,
  corner: `${prefix}-corner` as StaticKind,
  post: `${prefix}-post` as StaticKind,
  windowX: `${window}-x` as StaticKind,
  windowY: `${window}-y` as StaticKind,
});

export const HOUSE_STYLES: Readonly<Record<HouseStyle, HouseStyleDefinition>> = {
  plank: {
    name: 'tablas',
    walls: wallsOf('plank-wall', 'plank-window'),
    floor: Terrain.Wood,
    roof: 'wood',
    stairs: 'stairs-wood',
  },
  log: {
    name: 'troncos',
    walls: wallsOf('log-wall', 'log-window'),
    floor: Terrain.Wood,
    roof: 'wood',
    stairs: 'stairs-wood',
  },
  stone: {
    name: 'piedra',
    walls: wallsOf('wall', 'wall-window'),
    floor: Terrain.Flagstone,
    roof: 'stone',
    stairs: 'stairs-stone',
  },
  basalt: {
    name: 'piedra negra',
    walls: wallsOf('basalt-wall', 'basalt-window'),
    floor: Terrain.StoneTiles,
    roof: 'stone',
    stairs: 'spiral-stairs',
  },
  sandstone: {
    name: 'arenisca',
    walls: wallsOf('sandstone-wall', 'sandstone-window'),
    floor: Terrain.Sandstone,
    roof: 'stone',
    stairs: 'stairs-stone',
  },
};

export interface HousePlan {
  readonly kind: HouseKind;
  /** "casilla de tablas", "torreón"… */
  readonly name: string;
  readonly article: 'un' | 'una';
  readonly style: HouseStyle;
  /** El piso de adentro de la planta baja (sin las paredes), en tiles. */
  readonly width: number;
  readonly height: number;
  /** Pisos altos con escalera (0: solo el techo, sin subir). */
  readonly floors: number;
  /** Patio cercado delante de la puerta, en filas (0: sin patio). */
  readonly patio: number;
  /** Una pared por el medio de la planta baja, con una puerta: dos cuartos. */
  readonly rooms: boolean;
  /** Puerta de entrada: sola, doble de madera o doble de hierro. */
  readonly door: 'single' | 'double' | 'iron';
  /** Cuántos cofres trae (lo único que no se puede sacar de la casa). */
  readonly chests: number;
  /** Lo que cuesta la escritura en el arquitecto. */
  readonly price: number;
  readonly description: string;
}

const plan = (
  kind: HouseKind,
  spec: Omit<HousePlan, 'kind' | 'patio' | 'rooms' | 'door'> &
    Partial<Pick<HousePlan, 'patio' | 'rooms' | 'door'>>,
): HousePlan => ({ kind, patio: 0, rooms: false, door: 'single', ...spec });

export const HOUSE_PLANS: Readonly<Record<HouseKind, HousePlan>> = {
  'wood-shack': plan('wood-shack', {
    name: 'casilla de tablas',
    article: 'una',
    style: 'plank',
    width: 5,
    height: 5,
    floors: 0,
    chests: 1,
    price: 3000,
    description: 'Un cuarto de tablas con techo de madera. Lo justo para empezar.',
  }),
  'log-cabin': plan('log-cabin', {
    name: 'cabaña de troncos',
    article: 'una',
    style: 'log',
    width: 6,
    height: 5,
    floors: 0,
    chests: 1,
    price: 5000,
    description: 'Troncos bien encastrados: abriga en el invierno y huele a bosque.',
  }),
  'stone-cottage': plan('stone-cottage', {
    name: 'casa chica de piedra',
    article: 'una',
    style: 'stone',
    width: 6,
    height: 6,
    floors: 0,
    chests: 1,
    price: 8000,
    description: 'Paredes de piedra y piso de laja. Firme, fresca y segura.',
  }),
  'sandstone-patio': plan('sandstone-patio', {
    name: 'casa de arenisca con patio',
    article: 'una',
    style: 'sandstone',
    width: 7,
    height: 5,
    floors: 0,
    patio: 3,
    chests: 2,
    price: 12000,
    description: 'Bloques claros con ventanas en arco y un patio cercado adelante.',
  }),
  'plank-house': plan('plank-house', {
    name: 'casa de tablas de dos plantas',
    article: 'una',
    style: 'plank',
    width: 7,
    height: 7,
    floors: 1,
    chests: 2,
    price: 15000,
    description: 'Dos plantas de madera unidas por una escalera, con techo de tablas arriba.',
  }),
  'stone-house': plan('stone-house', {
    name: 'casa de piedra de dos plantas',
    article: 'una',
    style: 'stone',
    width: 8,
    height: 8,
    floors: 1,
    chests: 2,
    price: 22000,
    description: 'Una casa de piedra con un piso alto y azotea con almenas.',
  }),
  'basalt-tower': plan('basalt-tower', {
    name: 'torre de piedra negra',
    article: 'una',
    style: 'basalt',
    width: 7,
    height: 7,
    floors: 2,
    chests: 3,
    price: 35000,
    description: 'Tres plantas de piedra volcánica y una escalera de caracol hasta la azotea.',
  }),
  'stone-keep': plan('stone-keep', {
    name: 'torreón de piedra',
    article: 'un',
    style: 'stone',
    width: 11,
    height: 11,
    floors: 2,
    rooms: true,
    door: 'double',
    chests: 4,
    price: 60000,
    description: 'Un torreón con dos cuartos abajo, dos pisos altos y puerta doble.',
  }),
  fortress: plan('fortress', {
    name: 'fortaleza',
    article: 'una',
    style: 'basalt',
    width: 15,
    height: 15,
    floors: 2,
    rooms: true,
    door: 'iron',
    chests: 5,
    price: 100000,
    description: 'Muros de piedra negra, puerta de hierro, salones amplios y azotea con almenas.',
  }),
};

/** La escritura con la que se compra y se guarda cada casa. */
export const HOUSE_DEEDS = {
  'wood-shack': 'deed-wood-shack',
  'log-cabin': 'deed-log-cabin',
  'stone-cottage': 'deed-stone-cottage',
  'sandstone-patio': 'deed-sandstone-patio',
  'plank-house': 'deed-plank-house',
  'stone-house': 'deed-stone-house',
  'basalt-tower': 'deed-basalt-tower',
  'stone-keep': 'deed-stone-keep',
  fortress: 'deed-fortress',
} as const satisfies Record<HouseKind, string>;

export type HouseDeedKind = (typeof HOUSE_DEEDS)[HouseKind];

export function houseKindOfDeed(kind: string): HouseKind | null {
  for (const house of HOUSE_KINDS) if (HOUSE_DEEDS[house] === kind) return house;
  return null;
}

/** A cuántos tiles (del centro de la casa) se puede estar para levantarla. */
export const PLACEMENT_RANGE = 16;

/** Cuántos nombres entran en cada lista de la casa (copropietarios, amigos, echados). */
export const MAX_HOUSE_LIST = 20;

/**
 * Quién es quién en una casa: el dueño (decide todo), los copropietarios
 * (todo menos demolerla y nombrar copropietarios), los amigos (abren las
 * puertas, los cofres y levantan lo que hay adentro), las visitas y los
 * echados (no pueden entrar).
 */
export type HouseLevel = 'owner' | 'co-owner' | 'friend' | 'visitor' | 'banned';

export const HOUSE_LEVEL_NAMES: Readonly<Record<HouseLevel, string>> = {
  owner: 'dueño',
  'co-owner': 'copropietario',
  friend: 'amigo',
  visitor: 'visita',
  banned: 'echado',
};

/** Las listas que maneja el dueño. */
export type HouseList = 'co-owners' | 'friends' | 'banned';

export function isHouseList(value: unknown): value is HouseList {
  return value === 'co-owners' || value === 'friends' || value === 'banned';
}

export interface HouseSecurity {
  /** Pública: cualquiera abre las puertas (menos los echados). Privada: solo los amigos. */
  readonly public: boolean;
  readonly coOwners: readonly string[];
  readonly friends: readonly string[];
  readonly banned: readonly string[];
}

export const DEFAULT_HOUSE_SECURITY: HouseSecurity = {
  public: false,
  coOwners: [],
  friends: [],
  banned: [],
};

const lower = (name: string): string => name.trim().toLocaleLowerCase();

/** El nivel de alguien (por su nombre) en una casa. */
export function houseLevel(owner: string, security: HouseSecurity, name: string): HouseLevel {
  const who = lower(name);
  if (who === lower(owner)) return 'owner';
  if (security.coOwners.some((n) => lower(n) === who)) return 'co-owner';
  if (security.friends.some((n) => lower(n) === who)) return 'friend';
  if (security.banned.some((n) => lower(n) === who)) return 'banned';
  return 'visitor';
}

const RANK: Readonly<Record<HouseLevel, number>> = {
  banned: 0,
  visitor: 1,
  friend: 2,
  'co-owner': 3,
  owner: 4,
};

export function houseLevelAtLeast(level: HouseLevel, needed: HouseLevel): boolean {
  return RANK[level] >= RANK[needed];
}

/** Nombre de una casa: de 2 a 30 letras, números, espacios y algo de puntuación. */
export function isHouseName(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const name = value.trim();
  return name.length >= 2 && name.length <= 30 && /^[\p{L}\p{N} '’.,:!¡¿?-]+$/u.test(name);
}

/** "una casilla de tablas", "un torreón de piedra". */
export function describeHouse(kind: HouseKind): string {
  const plan = HOUSE_PLANS[kind];
  return `${plan.article} ${plan.name}`;
}
