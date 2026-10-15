import { TILESETS, TOWN_MAP } from '@fenix/content';
import {
  Terrain,
  TileMap,
  tileDistance,
  type CreatureKind,
  type Position,
  type StaticPlacement,
} from '@fenix/shared';
import type { IdGenerator } from '../../application/ports';
import { Creature } from '../../domain/creatures/creature';
import { Npc } from '../../domain/npcs/npc';
import { World } from '../../domain/world';
import { SeededRandom } from '../system/seeded-random';
import { generateDungeon, type DungeonRoom } from './dungeon-map';
import { generateIslandMap, type GeneratedWorld } from './procedural-map';
import { loadTiledMap } from './tiled-map-loader';

export interface WorldBuildOptions {
  readonly size: number;
  readonly seed: number;
  /** Poblar la isla con criaturas (por defecto, sí). */
  readonly creatures?: boolean;
}

/** El mundo armado: isla, pueblo, mazmorra y quién vive en la mazmorra. */
export interface BuiltWorld extends GeneratedWorld {
  /** Criaturas de la mazmorra, ya ubicadas sala por sala. */
  readonly lairs: readonly { kind: CreatureKind; home: Position }[];
  /** Boca de la cueva en la isla. */
  readonly caveEntrance: Position;
}

export const DUNGEON_NAME = 'Cueva del Lamento';
const DUNGEON_SIZE = 60;
/** Roca maciza entre la isla y la mazmorra, para que desde adentro no se vea el mar. */
const DUNGEON_GAP = 24;

/**
 * Dónde viven las criaturas: cuanto más lejos del pueblo, más peligrosas.
 * Distancias en tiles desde el punto de aparición.
 */
const CREATURE_BANDS: readonly { kind: CreatureKind; count: number; min: number; max: number }[] = [
  { kind: 'rat', count: 8, min: 16, max: 30 },
  { kind: 'wolf', count: 10, min: 26, max: 46 },
  { kind: 'giant-spider', count: 5, min: 30, max: 50 },
  { kind: 'skeleton', count: 8, min: 42, max: 70 },
  { kind: 'orc', count: 6, min: 40, max: 62 },
  { kind: 'troll', count: 3, min: 50, max: 70 },
];

/**
 * Quién vive en cada sala de la mazmorra según su profundidad (0 = la de la
 * entrada, 1 = la del fondo). Cada sala tiene al menos una de la primera
 * especie de su nivel. La última sala es la guarida del dragón.
 */
const LAIR_LEVELS: readonly { upTo: number; kinds: readonly CreatureKind[]; count: number }[] = [
  { upTo: 0.25, kinds: ['giant-spider', 'skeleton', 'skeleton'], count: 3 },
  { upTo: 0.55, kinds: ['skeleton-mage', 'orc', 'giant-spider', 'skeleton'], count: 4 },
  { upTo: 0.99, kinds: ['lich', 'troll', 'skeleton-mage'], count: 3 },
];

/** Arma el mapa completo: isla procedural con el pueblo de Tiled y la mazmorra al este. */
export function buildWorld({ size, seed }: WorldBuildOptions): BuiltWorld {
  const town = loadTiledMap('puerto-ceniza', TOWN_MAP, TILESETS);
  const island = generateIslandMap({ width: size, height: size, seed, town });
  const dungeon = generateDungeon({ width: DUNGEON_SIZE, height: DUNGEON_SIZE, seed: seed + 7 });
  const islandData = island.map.toData();

  // La mazmorra va a la derecha de la isla, en el mismo mapa; no hay forma
  // de llegar caminando: se entra y se sale por la boca de la cueva.
  const left = size + DUNGEON_GAP;
  const width = left + dungeon.width;
  const height = Math.max(size, dungeon.height);
  const terrain = new Array<Terrain>(width * height).fill(Terrain.Rock);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile =
        x < size
          ? y < size
            ? islandData.terrain[y * size + x]
            : Terrain.Water
          : x < left
            ? Terrain.Rock
            : dungeon.terrain[y * dungeon.width + (x - left)];
      terrain[y * width + x] = tile ?? Terrain.Rock;
    }
  }
  const shift = (p: Position): Position => ({ x: p.x + left, y: p.y });

  const entrance = findCaveEntrance(island.map, island.spawnPoint, seed);
  // Afuera se aparece dos pasos delante de la boca, para no volver a entrar sin querer.
  const outside = { x: entrance.x, y: entrance.y + 2 };
  const clearing = (s: StaticPlacement): boolean =>
    Math.abs(s.x - entrance.x) > 1 || Math.abs(s.y - entrance.y) > 1;
  const statics: StaticPlacement[] = [
    ...islandData.statics.filter(clearing),
    { kind: 'cave-entrance', ...entrance },
    ...dungeon.statics.map((s) => ({ ...s, ...shift(s) })),
  ];

  const map = new TileMap({
    width,
    height,
    terrain,
    statics,
    regions: [
      ...islandData.regions,
      { name: DUNGEON_NAME, x: size, y: 0, width: width - size, height, dungeon: true },
    ],
    teleporters: [
      { ...entrance, to: shift(dungeon.arrival) },
      { ...shift(dungeon.ladder), to: outside },
    ],
  });

  return {
    ...island,
    map,
    caveEntrance: entrance,
    lairs: lairHomes(
      dungeon.rooms.map((r) => ({ ...r, ...shift(r) })),
      map,
      seed,
    ),
  };
}

/** Crea el mundo listo para jugar, con los objetos sueltos del mapa en el suelo. */
export function createWorld(options: WorldBuildOptions, ids: IdGenerator): World {
  const { map, spawnPoint, items, npcs, lairs } = buildWorld(options);
  const world = new World(map, spawnPoint);
  for (const { role, position } of npcs) world.addNpc(new Npc(ids.next(), role, position));
  for (const { kind, amount, position } of items) {
    world.items.add(ids.next(), kind, amount, { type: 'ground', position });
  }
  if (options.creatures !== false) {
    for (const { kind, home } of [...creatureHomes(map, spawnPoint, options.seed), ...lairs]) {
      world.addCreature(new Creature(ids.next(), kind, home));
    }
  }
  return world;
}

/**
 * Un claro en el pasto, lejos del pueblo, para la boca de la cueva: el tile
 * y sus vecinos tienen que ser tierra firme (los árboles se sacan).
 */
function findCaveEntrance(map: TileMap, spawn: Position, seed: number): Position {
  const random = new SeededRandom(seed + 17);
  const firm = (p: Position): boolean => {
    const t = map.terrainAt(p);
    return t === Terrain.Grass || t === Terrain.Dirt;
  };
  for (let attempt = 0; attempt < 5000; attempt++) {
    const angle = random.next() * Math.PI * 2;
    const distance = 30 + random.next() * 14;
    const at = {
      x: Math.round(spawn.x + Math.cos(angle) * distance),
      y: Math.round(spawn.y + Math.sin(angle) * distance),
    };
    let ok = !map.regionAt(at);
    for (let dy = -2; dy <= 2 && ok; dy++) {
      for (let dx = -2; dx <= 2 && ok; dx++) ok = firm({ x: at.x + dx, y: at.y + dy });
    }
    if (ok) return at;
  }
  throw new Error('No hay lugar en la isla para la entrada de la cueva');
}

/** Criaturas de cada sala de la mazmorra, más fuertes cuanto más hondo. */
function lairHomes(
  rooms: readonly DungeonRoom[],
  map: TileMap,
  seed: number,
): { kind: CreatureKind; home: Position }[] {
  const random = new SeededRandom(seed + 31);
  const taken = new Set<string>();
  const free = (p: Position): boolean => map.isWalkable(p) && !taken.has(`${p.x},${p.y}`);
  const homes: { kind: CreatureKind; home: Position }[] = [];
  const last = rooms.length - 1;
  for (const room of rooms) {
    if (room.depth === 0) continue; // La sala de la escalera queda tranquila.
    const centre = {
      x: room.x + Math.floor(room.width / 2),
      y: room.y + Math.floor(room.height / 2),
    };
    if (room.depth === last) {
      homes.push({ kind: 'dragon', home: centre });
      continue;
    }
    const level = LAIR_LEVELS.find((l) => room.depth / last <= l.upTo) ?? LAIR_LEVELS[0];
    if (!level) continue;
    for (let i = 0, tries = 0; i < level.count && tries < 50; tries++) {
      const home = {
        x: room.x + 1 + Math.floor(random.next() * (room.width - 2)),
        y: room.y + 1 + Math.floor(random.next() * (room.height - 2)),
      };
      if (!free(home)) continue;
      taken.add(`${home.x},${home.y}`);
      // La primera es la criatura típica del nivel; el resto, al azar.
      const pick = i === 0 ? 0 : Math.floor(random.next() * level.kinds.length);
      const kind = level.kinds[pick] ?? 'skeleton';
      homes.push({ kind, home });
      i += 1;
    }
  }
  return homes;
}

/** Elige lugares transitables y fuera de las zonas con nombre para cada criatura. */
export function creatureHomes(
  map: TileMap,
  spawn: Position,
  seed: number,
): { kind: CreatureKind; home: Position }[] {
  const random = new SeededRandom(seed + 99);
  const taken = new Set<string>();
  const homes: { kind: CreatureKind; home: Position }[] = [];
  for (const band of CREATURE_BANDS) {
    let placed = 0;
    for (let attempt = 0; attempt < 2000 && placed < band.count; attempt++) {
      const angle = random.next() * Math.PI * 2;
      const distance = band.min + random.next() * (band.max - band.min);
      const home = {
        x: Math.round(spawn.x + Math.cos(angle) * distance),
        y: Math.round(spawn.y + Math.sin(angle) * distance),
      };
      const key = `${home.x},${home.y}`;
      if (taken.has(key) || !map.isWalkable(home) || map.regionAt(home)) continue;
      if (tileDistance(home, spawn) < band.min) continue;
      taken.add(key);
      homes.push({ kind: band.kind, home });
      placed += 1;
    }
  }
  return homes;
}
