import { TILESETS, TOWN_MAPS } from '@fenix/content';
import {
  Terrain,
  TileMap,
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
import { populateContinent, type Place } from './places';
import { generateIslandMap, type GeneratedWorld, type TownPlan } from './procedural-map';
import { loadTiledMap } from './tiled-map-loader';

export interface WorldBuildOptions {
  readonly size: number;
  readonly seed: number;
  /** Poblar el mundo con criaturas (por defecto, sí). */
  readonly creatures?: boolean;
}

/** El mundo armado: continente, pueblos, lugares, mazmorra y quién vive en cada parte. */
export interface BuiltWorld extends GeneratedWorld {
  /** Criaturas de la mazmorra, ya ubicadas sala por sala. */
  readonly lairs: readonly { kind: CreatureKind; home: Position }[];
  /** Criaturas de las tierras salvajes (por bioma y por lugar). */
  readonly wildlife: readonly { kind: CreatureKind; home: Position }[];
  /** Boca de la cueva en el continente. */
  readonly caveEntrance: Position;
  /** Lugares con nombre de las tierras salvajes. */
  readonly places: readonly Place[];
}

export const DUNGEON_NAME = 'Cueva del Lamento';
const DUNGEON_SIZE = 60;
/** Roca maciza entre el continente y la mazmorra, para que desde adentro no se vea el mar. */
const DUNGEON_GAP = 24;

/** Por debajo de este tamaño el mapa no da para los tres pueblos: queda solo la capital. */
const MIN_SIZE_FOR_ALL_TOWNS = 200;

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

/** Los pueblos del continente: la capital al centro, Roca Alta al noroeste, Junco Verde al este. */
function townPlans(size: number): TownPlan[] {
  const load = (name: keyof typeof TOWN_MAPS) => loadTiledMap(name, TOWN_MAPS[name], TILESETS);
  const plans: TownPlan[] = [
    { map: load('puerto-ceniza'), at: { x: 0.5, y: 0.55 }, climate: 'temperate', capital: true },
  ];
  if (size >= MIN_SIZE_FOR_ALL_TOWNS) {
    plans.push(
      { map: load('roca-alta'), at: { x: 0.27, y: 0.3 }, climate: 'mountain' },
      { map: load('junco-verde'), at: { x: 0.77, y: 0.5 }, climate: 'swamp' },
    );
  }
  return plans;
}

/** Arma el mapa completo: continente con pueblos y lugares, y la mazmorra al este. */
export function buildWorld({ size, seed }: WorldBuildOptions): BuiltWorld {
  const continent = populateContinent(
    generateIslandMap({ width: size, height: size, seed, towns: townPlans(size) }),
    seed,
  );
  const dungeon = generateDungeon({ width: DUNGEON_SIZE, height: DUNGEON_SIZE, seed: seed + 7 });
  const islandData = continent.map.toData();

  // La mazmorra va a la derecha del continente, en el mismo mapa; no hay forma
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

  const entrance = continent.caveEntrance;
  // Afuera se aparece dos pasos delante de la boca, para no volver a entrar sin querer.
  const outside = { x: entrance.x, y: entrance.y + 2 };
  const statics: StaticPlacement[] = [
    ...islandData.statics,
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
    signs: islandData.signs ?? [],
  });

  return {
    map,
    spawnPoint: continent.spawnPoint,
    items: continent.items,
    npcs: continent.npcs,
    caveEntrance: entrance,
    places: continent.places,
    wildlife: continent.homes,
    lairs: lairHomes(
      dungeon.rooms.map((r) => ({ ...r, ...shift(r) })),
      map,
      seed,
    ),
  };
}

/** Crea el mundo listo para jugar, con los objetos sueltos del mapa en el suelo. */
export function createWorld(options: WorldBuildOptions, ids: IdGenerator): World {
  const { map, spawnPoint, items, npcs, lairs, wildlife } = buildWorld(options);
  const world = new World(map, spawnPoint);
  for (const { role, position, name } of npcs)
    world.addNpc(new Npc(ids.next(), role, position, name));
  for (const { kind, amount, position } of items) {
    world.items.add(ids.next(), kind, amount, { type: 'ground', position });
  }
  if (options.creatures !== false) {
    for (const { kind, home } of [...wildlife, ...lairs]) {
      world.addCreature(new Creature(ids.next(), kind, home));
    }
  }
  return world;
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
