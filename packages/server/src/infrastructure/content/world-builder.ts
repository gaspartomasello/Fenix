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
import {
  BANDIT_ISLAND,
  ISLAND_CITY,
  generateIslandMap,
  type GeneratedWorld,
  type TownPlan,
} from './procedural-map';
import { buildCity } from './city-builder';
import { generateCrypt, generateSewer, type Underground } from './underground';

/**
 * Versión de la forma del mundo: si cambia, los personajes guardados en el
 * mundo anterior aparecen en la capital (su posición vieja ya no sirve).
 */
const WORLD_VERSION = 5;

export interface WorldBuildOptions {
  /** Ancho del continente (y alto, si no se da `height`). */
  readonly size: number;
  /** Alto: si es bastante mayor que el ancho, el continente es alargado de norte a sur. */
  readonly height?: number;
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
  { upTo: 0.99, kinds: ['lich', 'drake', 'troll', 'skeleton-mage'], count: 3 },
];

/**
 * Las ciudades del continente, cada una con el estilo de su región. En el
 * continente alargado, la capital queda en el norte templado cerca de la
 * costa este, Roca Alta al pie de la cordillera del oeste y Junco Verde más
 * al sur, en lo bajo y húmedo; Puerto Brasa en la isla grande, frente a las
 * Tierras de Ceniza, y el refugio de los bandidos en la Malvina del oeste.
 * En uno cuadrado: la capital al centro, Roca Alta al noroeste, Junco Verde
 * al este.
 */
function townPlans(width: number, height: number, seed: number): TownPlan[] {
  const elongated = height > width * 1.2;
  const big = Math.min(width, height) >= MIN_SIZE_FOR_ALL_TOWNS;
  const plans: TownPlan[] = [
    {
      map: buildCity({
        name: 'Puerto Ceniza',
        style: 'capital',
        seed: seed + 100,
        // La capital grande (con el río) necesita un continente grande.
        size: Math.min(width, height) >= 600 ? 'large' : 'medium',
        starterItems: true,
      }),
      at: elongated ? { x: 0.6, y: 0.27 } : { x: 0.5, y: 0.55 },
      climate: 'temperate',
      capital: true,
    },
  ];
  if (big) {
    plans.push(
      {
        map: buildCity({
          name: 'Roca Alta',
          style: 'mountain',
          seed: seed + 101,
          size: 'medium',
          people: {
            blacksmith: 'Anselmo el herrero',
            banker: 'Rosaura la banquera',
            innkeeper: 'Fermín el tabernero',
            mage: 'Ercilia la maga',
            stablemaster: 'Odón el caballerizo',
          },
        }),
        at: elongated ? { x: 0.36, y: 0.215 } : { x: 0.27, y: 0.3 },
        climate: 'mountain',
      },
      {
        map: buildCity({
          name: 'Junco Verde',
          style: 'swamp',
          seed: seed + 102,
          size: 'medium',
          people: {
            mage: 'Clementina la hechicera',
            innkeeper: 'Ramiro el tabernero',
            blacksmith: 'Dalmiro el herrero',
            banker: 'Eulalia la banquera',
            stablemaster: 'Nicanor el caballerizo',
          },
        }),
        at: elongated ? { x: 0.5, y: 0.39 } : { x: 0.77, y: 0.5 },
        climate: 'swamp',
      },
    );
    if (elongated)
      plans.push(
        // La ciudad de la isla grande, frente a la entrada de las Tierras de Ceniza.
        {
          map: buildCity({
            name: 'Puerto Brasa',
            style: 'volcanic',
            seed: seed + 103,
            size: 'medium',
            people: {
              blacksmith: 'Cosme el herrero',
              mage: 'Brígida la maga',
              innkeeper: 'Teodoro el tabernero',
              banker: 'Leonor la banquera',
              stablemaster: 'Lisandro el caballerizo',
            },
          }),
          at: ISLAND_CITY,
          climate: 'temperate',
        },
        // Los bandidos, en una isla lejos de todo: ahí no hay ley.
        {
          map: buildCity({
            name: 'Refugio de los Bandidos',
            style: 'bandit',
            seed: seed + 104,
            size: 'small',
            people: {
              innkeeper: 'Ruperto el contrabandista',
              blacksmith: 'Tuerto el herrero',
            },
          }),
          at: BANDIT_ISLAND,
          climate: 'temperate',
        },
      );
  }
  return plans;
}

/** Arma el mapa completo: continente con pueblos y lugares, y la mazmorra al este. */
export function buildWorld({ size, height: tall, seed }: WorldBuildOptions): BuiltWorld {
  const landHeight = tall ?? size;
  const continent = populateContinent(
    generateIslandMap({
      width: size,
      height: landHeight,
      seed,
      towns: townPlans(size, landHeight, seed),
    }),
    seed,
  );
  const dungeon = generateDungeon({ width: DUNGEON_SIZE, height: DUNGEON_SIZE, seed: seed + 7 });
  const islandData = continent.map.toData();

  // La mazmorra va a la derecha del continente, en el mismo mapa; no hay forma
  // de llegar caminando: se entra y se sale por la boca de la cueva.
  const left = size + DUNGEON_GAP;
  // Más a la derecha, uno debajo del otro, lo que hay bajo los pueblos: las
  // criptas de los cementerios y la alcantarilla de la capital.
  const below = continent.descents.map((d, i) => ({
    descent: d,
    place:
      d.kind === 'sewer'
        ? generateSewer(d.town, seed + 101 + i)
        : generateCrypt(d.town, d.size, seed + 103 + i * 7),
  }));
  const pocketLeft = left + dungeon.width + DUNGEON_GAP;
  const pockets: { place: Underground; at: Position }[] = [];
  let pocketTop = 0;
  for (const { place } of below) {
    pockets.push({ place, at: { x: pocketLeft, y: pocketTop } });
    pocketTop += place.height + DUNGEON_GAP;
  }
  const pocketWidth = Math.max(0, ...below.map((b) => b.place.width));
  const width = pockets.length > 0 ? pocketLeft + pocketWidth : left + dungeon.width;
  const height = Math.max(landHeight, dungeon.height, pocketTop);
  const terrain = new Array<Terrain>(width * height).fill(Terrain.Rock);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile =
        x < size
          ? y < landHeight
            ? islandData.terrain[y * size + x]
            : Terrain.Water
          : x < left
            ? Terrain.Rock
            : x < left + dungeon.width
              ? dungeon.terrain[y * dungeon.width + (x - left)]
              : Terrain.Rock;
      terrain[y * width + x] = tile ?? Terrain.Rock;
    }
  }
  for (const { place, at } of pockets)
    place.terrain.forEach((tile, i) => {
      const x = at.x + (i % place.width);
      const y = at.y + Math.floor(i / place.width);
      terrain[y * width + x] = tile;
    });
  const inPocket =
    (at: Position) =>
    (p: Position): Position => ({ x: p.x + at.x, y: p.y + at.y });
  const shift = (p: Position): Position => ({ x: p.x + left, y: p.y });
  // Las lomas del continente; la mazmorra y el mar de alrededor, planos.
  const landHeights = islandData.heights;
  const heights = landHeights
    ? Array.from({ length: width * height }, (_, i) => {
        const x = i % width;
        const y = (i - x) / width;
        return x < size && y < landHeight ? (landHeights[y * size + x] ?? 0) : 0;
      })
    : undefined;

  const entrance = continent.caveEntrance;
  // Afuera se aparece dos pasos delante de la boca, para no volver a entrar sin querer.
  const outside = { x: entrance.x, y: entrance.y + 2 };
  const statics: StaticPlacement[] = [
    ...islandData.statics,
    ...dungeon.statics.map((s) => ({ ...s, ...shift(s) })),
    ...pockets.flatMap(({ place, at }) => place.statics.map((s) => ({ ...s, ...inPocket(at)(s) }))),
  ];

  const map = new TileMap({
    width,
    height,
    terrain,
    statics,
    regions: [
      ...islandData.regions,
      ...pockets.map(({ place, at }) => ({
        name: place.name,
        x: at.x,
        y: at.y,
        width: place.width,
        height: place.height,
        dungeon: true,
      })),
      { name: DUNGEON_NAME, x: size, y: 0, width: width - size, height, dungeon: true },
    ],
    teleporters: [
      { ...entrance, to: shift(dungeon.arrival) },
      { ...shift(dungeon.ladder), to: outside },
      // Bajar por la cripta o la reja, y volver por la escalera a un paso de la bajada.
      ...below.flatMap(({ descent }, i) => {
        const pocket = pockets[i];
        if (!pocket) return [];
        const to = inPocket(pocket.at);
        const back =
          descent.kind === 'crypt'
            ? { x: descent.position.x, y: descent.position.y + 1 }
            : { x: descent.position.x + 1, y: descent.position.y + 1 };
        return [
          { ...descent.position, to: to(pocket.place.arrival) },
          { ...to(pocket.place.ladder), to: back },
        ];
      }),
    ],
    signs: islandData.signs ?? [],
    ...(heights ? { heights } : {}),
  });

  return {
    map,
    spawnPoint: continent.spawnPoint,
    items: continent.items,
    npcs: continent.npcs,
    caveEntrance: entrance,
    places: continent.places,
    wildlife: continent.homes,
    lairs: [
      ...lairHomes(
        dungeon.rooms.map((r) => ({ ...r, ...shift(r) })),
        map,
        seed,
      ),
      ...pockets.flatMap(({ place, at }) =>
        place.lairs.map((l) => ({ kind: l.kind, home: inPocket(at)(l.position) })),
      ),
    ],
  };
}

/** Crea el mundo listo para jugar, con los objetos sueltos del mapa en el suelo. */
export function createWorld(options: WorldBuildOptions, ids: IdGenerator): World {
  const { map, spawnPoint, items, npcs, lairs, wildlife } = buildWorld(options);
  const world = new World(
    map,
    spawnPoint,
    `${map.width}x${map.height}@${options.seed}#${WORLD_VERSION}`,
  );
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
