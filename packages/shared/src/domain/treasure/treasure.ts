import type { CreatureKind } from '../creatures/creature-catalog';
import type { ItemKind } from '../items/item-catalog';

/** Qué tan valioso (y peligroso) es un tesoro. */
export type TreasureLevel = 1 | 2 | 3 | 4;

/** Lo que marca un mapa del tesoro: dónde está enterrado y cuánto vale. */
export interface TreasureMark {
  readonly x: number;
  readonly y: number;
  readonly level: TreasureLevel;
}

export interface TreasureLevelDefinition {
  /** Cómo se llama el mapa: "mapa del tesoro gastado". */
  readonly adjective: string;
  /** Minería mínima para desenterrarlo, en décimas (300 = 30,0). */
  readonly minMining: number;
  readonly gold: readonly [number, number];
  readonly gems: readonly [number, number];
  /** Otras cosas que puede traer: [objeto, cantidad mínima, máxima, probabilidad]. */
  readonly extras: readonly (readonly [ItemKind, number, number, number])[];
  /** Los que salen a defenderlo al abrirlo. */
  readonly guardians: readonly CreatureKind[];
}

export const TREASURE_LEVELS: Readonly<Record<TreasureLevel, TreasureLevelDefinition>> = {
  1: {
    adjective: 'gastado',
    minMining: 0,
    gold: [120, 320],
    gems: [1, 2],
    extras: [
      ['healing-potion', 1, 3, 0.7],
      ['bandage', 5, 15, 0.6],
      ['blank-scroll', 2, 5, 0.4],
      ['scimitar', 1, 1, 0.25],
    ],
    guardians: ['skeleton', 'skeleton'],
  },
  2: {
    adjective: 'viejo',
    minMining: 300,
    gold: [350, 750],
    gems: [2, 4],
    extras: [
      ['healing-potion', 2, 4, 0.7],
      ['cure-potion', 1, 3, 0.5],
      ['ringmail', 1, 1, 0.3],
      ['longsword', 1, 1, 0.3],
    ],
    guardians: ['orc', 'orc', 'zombie'],
  },
  3: {
    adjective: 'antiguo',
    minMining: 500,
    gold: [800, 1600],
    gems: [3, 6],
    extras: [
      ['strength-potion', 1, 2, 0.5],
      ['agility-potion', 1, 2, 0.5],
      ['metal-shield', 1, 1, 0.35],
      ['halberd', 1, 1, 0.3],
    ],
    guardians: ['skeleton-mage', 'wraith', 'troll'],
  },
  4: {
    adjective: 'legendario',
    minMining: 700,
    gold: [1800, 3500],
    gems: [5, 9],
    extras: [
      ['strength-potion', 2, 3, 0.6],
      ['agility-potion', 2, 3, 0.6],
      ['bone-armor', 1, 1, 0.4],
      ['war-axe', 1, 1, 0.4],
    ],
    guardians: ['lich', 'drake', 'wraith', 'skeleton-mage'],
  },
};

export const TREASURE_GEMS: readonly ItemKind[] = [
  'amethyst',
  'sapphire',
  'emerald',
  'ruby',
  'diamond',
];

/** Qué criaturas pueden llevar un mapa encima, de qué nivel y con qué probabilidad. */
export const TREASURE_MAP_DROPS: Readonly<
  Partial<Record<CreatureKind, { readonly level: TreasureLevel; readonly chance: number }>>
> = {
  orc: { level: 1, chance: 0.06 },
  brigand: { level: 1, chance: 0.1 },
  barbarian: { level: 1, chance: 0.08 },
  'tribal-warrior': { level: 1, chance: 0.06 },
  'tribal-rider': { level: 2, chance: 0.1 },
  'tribal-shaman': { level: 2, chance: 0.12 },
  pirate: { level: 2, chance: 0.15 },
  corsair: { level: 2, chance: 0.12 },
  troll: { level: 2, chance: 0.1 },
  'skeleton-mage': { level: 3, chance: 0.1 },
  wraith: { level: 3, chance: 0.08 },
  drake: { level: 3, chance: 0.15 },
  lich: { level: 4, chance: 0.15 },
  dragon: { level: 4, chance: 0.3 },
};

/** A qué distancia de la marca hay que cavar para dar con el cofre. */
export const DIG_RANGE = 2;
/** Cuánto queda el cofre abierto en el suelo antes de desaparecer. */
export const TREASURE_CHEST_MS = 10 * 60 * 1000;

export function isTreasureLevel(value: unknown): value is TreasureLevel {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

/** "mapa del tesoro antiguo". */
export function treasureMapName(level: TreasureLevel): string {
  return `mapa del tesoro ${TREASURE_LEVELS[level].adjective}`;
}

/** Probabilidad de sacar el cofre en una palada, según la minería (en décimas). */
export function digChance(mining: number, level: TreasureLevel): number {
  const over = mining - TREASURE_LEVELS[level].minMining;
  return Math.max(0.2, Math.min(0.9, 0.35 + over / 1000));
}

const COMPASS = [
  'al este',
  'al sudeste',
  'al sur',
  'al sudoeste',
  'al oeste',
  'al noroeste',
  'al norte',
  'al noreste',
] as const;

/**
 * Pista del mapa: "al noreste de Puerto Ceniza". Los puntos cardinales son
 * los del mapa del mundo, que está girado como la vista del juego.
 */
export function treasureHint(
  mark: { readonly x: number; readonly y: number },
  landmark: { readonly name: string; readonly x: number; readonly y: number },
): string {
  // Girado 45° como el minimapa: en pantalla, x va hacia abajo a la derecha.
  const sx = mark.x - landmark.x - (mark.y - landmark.y);
  const sy = mark.x - landmark.x + (mark.y - landmark.y);
  if (Math.hypot(sx, sy) < 12) return `cerca de ${landmark.name}`;
  const angle = Math.atan2(sy, sx);
  const index = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return `${COMPASS[index]} de ${landmark.name}`;
}
