import {
  Terrain,
  TileMap,
  type CreatureKind,
  type Position,
  type RegionData,
  type StaticKind,
  type StaticPlacement,
} from '@fenix/shared';
import { SeededRandom } from '../system/seeded-random';
import type { Biome, Continent } from './procedural-map';
import { cheapestPath } from './roads';

/** Un lugar con nombre en las tierras salvajes, con quienes viven ahí. */
export interface Place {
  readonly name: string;
  readonly region: RegionData;
  readonly center: Position;
  readonly creatures: readonly { kind: CreatureKind; home: Position }[];
}

/** El continente con sus lugares, la boca de la cueva y las criaturas ubicadas. */
export interface PopulatedContinent extends Continent {
  readonly places: readonly Place[];
  readonly caveEntrance: Position;
  /** Criaturas de las tierras salvajes: las de cada bioma y las de cada lugar. */
  readonly homes: readonly { kind: CreatureKind; home: Position }[];
}

type Plan = (site: Site) => void;

/** Un lugar a construir: dónde, cuánto mide y en qué bioma. */
interface PlaceSpec {
  readonly name: string;
  readonly biomes: readonly Biome[];
  readonly radius: number;
  /** Distancia a la capital (tiles). */
  readonly from: number;
  readonly to: number;
  /** Debe tocar el mar (el faro). */
  readonly coast?: boolean;
  /** Cerca de otro pueblo en vez de la capital. */
  readonly near?: string;
  readonly build: Plan;
  readonly creatures: readonly (readonly [CreatureKind, number])[];
}

/** Herramientas para construir dentro de un lugar. */
interface Site {
  readonly center: Position;
  readonly radius: number;
  readonly random: SeededRandom;
  ground(x: number, y: number, terrain: Terrain): void;
  put(x: number, y: number, kind: StaticKind): void;
}

/**
 * Lugares del continente. Cada uno tiene su construcción (con objetos del
 * juego) y sus habitantes; quedan como zonas con nombre que no protegen.
 */
const PLACES: readonly PlaceSpec[] = [
  {
    name: 'Campamento de los Colmillos',
    biomes: ['forest', 'grassland'],
    radius: 6,
    from: 38,
    to: 80,
    creatures: [
      ['orc', 5],
      ['troll', 1],
    ],
    build(site) {
      const { x, y } = site.center;
      disk(site, 5, Terrain.Dirt);
      site.put(x, y, 'campfire');
      for (const [dx, dy] of [
        [-3, -3],
        [3, -3],
        [-3, 3],
        [3, 3],
      ] as const)
        site.put(x + dx, y + dy, 'tent');
      // Empalizada con dos entradas.
      for (let d = -5; d <= 5; d++) {
        if (Math.abs(d) > 1) {
          site.put(x + d, y - 6, 'fence-x');
          site.put(x + d, y + 6, 'fence-x');
        }
        if (Math.abs(d) > 1 || d === 0) {
          site.put(x - 6, y + d, 'fence-y');
          site.put(x + 6, y + d, 'fence-y');
        }
      }
      for (const [dx, dy, kind] of [
        [1, -4, 'crate'],
        [-1, 4, 'barrel'],
        [4, 0, 'bones'],
        [-4, 0, 'crate'],
      ] as const)
        site.put(x + dx, y + dy, kind);
    },
  },
  {
    name: 'Torre Hueca',
    biomes: ['swamp'],
    radius: 6,
    from: 24,
    to: 50,
    near: 'Junco Verde',
    creatures: [
      ['lich', 1],
      ['skeleton-mage', 2],
      ['skeleton', 2],
    ],
    build(site) {
      ruin(site, 4, 0.45);
      site.put(site.center.x, site.center.y, 'brazier');
    },
  },
  {
    name: 'Cementerio Viejo',
    biomes: ['grassland', 'forest'],
    radius: 6,
    from: 22,
    to: 48,
    creatures: [['skeleton', 5]],
    build(site) {
      const { x, y } = site.center;
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -5; dx <= 5; dx++) site.ground(x + dx, y + dy, Terrain.Grass);
      for (let d = -5; d <= 5; d++) {
        site.put(x + d, y - 5, 'fence-x');
        if (d !== 0) site.put(x + d, y + 5, 'fence-x');
      }
      for (let d = -4; d <= 4; d++) {
        site.put(x - 6, y + d, 'fence-y');
        site.put(x + 5, y + d, 'fence-y');
      }
      for (let dy = -3; dy <= 3; dy += 2)
        for (let dx = -4; dx <= 3; dx += 2)
          if (site.random.next() < 0.8) site.put(x + dx, y + dy, 'gravestone');
      site.put(x - 5, y - 4, 'dead-tree');
      site.put(x + 4, y + 4, 'dead-tree');
      site.put(x, y + 6, 'lamp');
    },
  },
  {
    name: 'Faro del Cabo',
    biomes: ['beach', 'grassland', 'forest'],
    radius: 2,
    from: 40,
    to: 160,
    coast: true,
    creatures: [],
    build(site) {
      const { x, y } = site.center;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) site.ground(x + dx, y + dy, Terrain.Stone);
      site.put(x, y, 'lighthouse');
      site.put(x + 1, y + 1, 'barrel');
      site.put(x - 1, y + 1, 'crate');
    },
  },
  {
    name: 'Refugio Helado',
    biomes: ['snow'],
    radius: 4,
    from: 50,
    to: 220,
    creatures: [
      ['wolf', 3],
      ['troll', 1],
    ],
    build(site) {
      const { x, y } = site.center;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) site.ground(x + dx, y + dy, Terrain.Dirt);
      site.put(x, y, 'campfire');
      site.put(x - 2, y - 1, 'tent');
      site.put(x + 1, y - 2, 'tent');
      site.put(x + 2, y + 1, 'crate');
      site.put(x - 1, y + 2, 'bones');
      for (const [dx, dy] of [
        [-4, -3],
        [4, -4],
        [-4, 3],
        [3, 4],
      ] as const)
        site.put(x + dx, y + dy, 'snow-pine');
    },
  },
  {
    name: 'Ruinas del Sol',
    biomes: ['desert'],
    radius: 6,
    from: 40,
    to: 180,
    creatures: [
      ['giant-spider', 3],
      ['skeleton', 3],
    ],
    build(site) {
      ruin(site, 5, 0.5);
      for (let i = 0; i < 6; i++) {
        const a = site.random.next() * Math.PI * 2;
        site.put(
          site.center.x + Math.round(Math.cos(a) * 7),
          site.center.y + Math.round(Math.sin(a) * 7),
          'cactus',
        );
      }
    },
  },
];

/** Un patio en ruinas: muros de piedra caídos a medias, escombros y huesos. */
function ruin(site: Site, half: number, broken: number): void {
  const { x, y } = site.center;
  for (let dy = -half; dy <= half; dy++)
    for (let dx = -half; dx <= half; dx++) site.ground(x + dx, y + dy, Terrain.Stone);
  const wall = (wx: number, wy: number, kind: StaticKind): void => {
    site.put(wx, wy, site.random.next() < broken ? 'rubble' : kind);
  };
  for (let d = -half; d <= half; d++) {
    wall(x + d, y - half, 'wall-x');
    if (d !== 0) wall(x + d, y + half + 1, 'wall-x');
    wall(x - half, y + d, 'wall-y');
    if (d !== 0) wall(x + half + 1, y + d, 'wall-y');
  }
  site.put(x - half, y - half, 'wall-corner');
  for (let i = 0; i < 4; i++) {
    const rx = x + Math.round((site.random.next() - 0.5) * (half * 2 - 2));
    const ry = y + Math.round((site.random.next() - 0.5) * (half * 2 - 2));
    site.put(rx, ry, i % 2 ? 'bones' : 'rubble');
  }
}

function disk(site: Site, radius: number, terrain: Terrain): void {
  const { x, y } = site.center;
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++)
      if (dx * dx + dy * dy <= radius * radius + 1) site.ground(x + dx, y + dy, terrain);
}

/**
 * Quién vive en cada bioma (criaturas cada 1000 tiles). Los pueblos y sus
 * alrededores quedan tranquilos.
 */
const BIOME_CREATURES: Readonly<
  Partial<Record<Biome, readonly (readonly [CreatureKind, number])[]>>
> = {
  grassland: [
    ['rat', 1.4],
    ['wolf', 0.6],
  ],
  forest: [
    ['wolf', 2.6],
    ['giant-spider', 0.4],
    ['orc', 0.3],
  ],
  swamp: [
    ['giant-spider', 2.4],
    ['skeleton', 0.6],
  ],
  desert: [
    ['giant-spider', 1.2],
    ['skeleton', 0.8],
  ],
  snow: [
    ['wolf', 2],
    ['troll', 0.6],
  ],
  foothill: [
    ['troll', 1],
    ['orc', 1],
  ],
};

/** Sin criaturas a menos de esta distancia de un pueblo. */
const QUIET_RADIUS = 14;

/** Ubica los lugares, la boca de la cueva y las criaturas sobre el continente. */
export function populateContinent(continent: Continent, seed: number): PopulatedContinent {
  const map = continent.map;
  const { width, height } = map;
  const terrain = Array.from({ length: width * height }, (_, i) =>
    map.terrainAt({ x: i % width, y: Math.floor(i / width) }),
  ) as Terrain[];
  const statics = new Map<number, StaticPlacement>();
  for (const s of map.statics) statics.set(s.y * width + s.x, s);
  const index = (x: number, y: number): number => y * width + x;
  const random = new SeededRandom(seed + 41);
  const capital = continent.spawnPoint;
  const townAt = (name: string): Position | undefined => {
    const t = continent.towns.find((town) => town.name === name);
    return t ? { x: t.x + t.width / 2, y: t.y + t.height / 2 } : undefined;
  };
  const taken: { x: number; y: number; r: number }[] = continent.towns.map((t) => ({
    x: t.x + t.width / 2,
    y: t.y + t.height / 2,
    r: Math.max(t.width, t.height) / 2 + 8,
  }));
  const regions: RegionData[] = [...map.regions];
  const places: Place[] = [];
  const homes: { kind: CreatureKind; home: Position }[] = [];

  const free = (x: number, y: number): boolean => x > 1 && y > 1 && x < width - 2 && y < height - 2;

  for (const spec of PLACES) {
    const origin = (spec.near && townAt(spec.near)) || capital;
    const center = findSite(spec, origin);
    if (!center) continue;
    taken.push({ ...center, r: spec.radius + 6 });
    const site: Site = {
      center,
      radius: spec.radius,
      random,
      ground(x, y, t) {
        if (!free(x, y)) return;
        terrain[index(x, y)] = t;
        statics.delete(index(x, y));
      },
      put(x, y, kind) {
        if (!free(x, y)) return;
        if (terrain[index(x, y)] === Terrain.Water) terrain[index(x, y)] = Terrain.Dirt;
        statics.set(index(x, y), { kind, x, y });
      },
    };
    // Se despeja el lugar antes de construir.
    for (let dy = -spec.radius - 1; dy <= spec.radius + 1; dy++)
      for (let dx = -spec.radius - 1; dx <= spec.radius + 1; dx++)
        statics.delete(index(center.x + dx, center.y + dy));
    spec.build(site);
    const region: RegionData = {
      name: spec.name,
      x: center.x - spec.radius - 1,
      y: center.y - spec.radius - 1,
      width: spec.radius * 2 + 3,
      height: spec.radius * 2 + 3,
      wild: true,
    };
    regions.push(region);
    const creatures = spec.creatures.flatMap(([kind, count]) =>
      Array.from({ length: count }, () => ({ kind, home: spotNear(center, spec.radius) })),
    );
    homes.push(...creatures);
    places.push({ name: spec.name, region, center, creatures });
  }

  // Paso de montaña: donde un camino cruza la cordillera.
  // El tramo de camino entre montañas más alejado de los pueblos.
  const pass = [...continent.passes]
    .filter((p) => !taken.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < t.r))
    .sort((a, b) => distanceToTowns(b) - distanceToTowns(a))[0];
  if (pass) {
    const region: RegionData = {
      name: 'Paso del Cuervo',
      x: pass.x - 6,
      y: pass.y - 6,
      width: 13,
      height: 13,
      wild: true,
    };
    regions.push(region);
    const creatures = [
      { kind: 'troll' as const, home: spotNear(pass, 5) },
      { kind: 'wolf' as const, home: spotNear(pass, 5) },
      { kind: 'wolf' as const, home: spotNear(pass, 5) },
    ];
    homes.push(...creatures);
    places.push({ name: 'Paso del Cuervo', region, center: pass, creatures });
  }

  const caveEntrance = findCaveEntrance();

  function distanceToTowns(p: Position): number {
    return Math.min(
      ...continent.towns.map((t) => Math.hypot(t.x + t.width / 2 - p.x, t.y + t.height / 2 - p.y)),
    );
  }
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      statics.delete(index(caveEntrance.x + dx, caveEntrance.y + dy));
  statics.set(index(caveEntrance.x, caveEntrance.y), { kind: 'cave-entrance', ...caveEntrance });

  // Senderos: de cada lugar (y de la cueva) hasta el camino más cercano.
  const roads = new Set(continent.roads);
  for (const place of places) trail(place.center, place.region);
  trail({ x: caveEntrance.x, y: caveEntrance.y + 2 });

  /**
   * Un sendero de tierra de dos tiles de ancho desde `from` hasta que toca un
   * camino o un pueblo; dentro del lugar no se toca nada.
   */
  function trail(from: Position, inside?: RegionData): void {
    const target = continent.towns
      .map((t) => ({ x: t.x + Math.floor(t.width / 2), y: t.y + Math.floor(t.height / 2) }))
      .sort(
        (a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y),
      )[0];
    if (!target) return;
    const within = (x: number, y: number, r: RegionData | undefined): boolean =>
      !!r && x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;
    const path = cheapestPath(
      width,
      height,
      from,
      target,
      (x, y) => {
        const i = index(x, y);
        if (roads.has(i)) return 0.3;
        const biome = continent.biomes[i];
        if (biome === 'ocean') return Infinity;
        if (statics.get(i)?.kind === 'mountain') return 40;
        if (terrain[i] === Terrain.Water) return 12;
        if (biome === 'swamp') return 2;
        return 1;
      },
      4,
    );
    if (!path) return;
    for (const p of path) {
      const i = index(p.x, p.y);
      if (roads.has(i) || continent.towns.some((t) => within(p.x, p.y, { ...t, name: t.name })))
        return;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        const x = p.x + dx;
        const y = p.y + dy;
        if (!free(x, y) || within(x, y, inside)) continue;
        const j = index(x, y);
        if (continent.biomes[j] === 'ocean') continue;
        terrain[j] =
          terrain[j] === Terrain.Water || terrain[j] === Terrain.Wood
            ? Terrain.Wood
            : trailGround(terrain[j]);
        const kind = statics.get(j)?.kind;
        if (kind !== 'cave-entrance' && kind !== 'sign') statics.delete(j);
      }
    }
  }

  const populated = new TileMap({
    width,
    height,
    terrain,
    statics: [...statics.values()],
    regions,
    signs: map.signs.filter((s) => statics.get(index(s.x, s.y))?.kind === 'sign'),
  });
  homes.push(...biomeCreatures(populated));
  return { ...continent, map: populated, places, caveEntrance, homes };

  /** Un lugar del bioma pedido, a la distancia pedida y lejos de los demás. */
  function findSite(spec: PlaceSpec, origin: Position): Position | null {
    for (let attempt = 0; attempt < 6000; attempt++) {
      const angle = random.next() * Math.PI * 2;
      const distance = spec.from + random.next() * (spec.to - spec.from);
      const x = Math.round(origin.x + Math.cos(angle) * distance);
      const y = Math.round(origin.y + Math.sin(angle) * distance);
      const r = spec.radius;
      if (x - r - 2 < 2 || y - r - 2 < 2 || x + r + 2 >= width - 2 || y + r + 2 >= height - 2)
        continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + r)) continue;
      let ok = true;
      let coast = false;
      for (let dy = -r; dy <= r && ok; dy++) {
        for (let dx = -r; dx <= r && ok; dx++) {
          const i = index(x + dx, y + dy);
          const biome = continent.biomes[i];
          if (biome === 'mountain' || biome === 'ocean' || continent.roads.has(i)) ok = false;
          else if (!spec.coast && !spec.biomes.includes('swamp') && terrain[i] === Terrain.Water)
            ok = false;
          else if (map.regionAt({ x: x + dx, y: y + dy })) ok = false;
        }
      }
      if (!ok) continue;
      if (!spec.biomes.includes(continent.biomes[index(x, y)] ?? 'ocean')) continue;
      if (spec.coast) {
        for (let dy = -r - 2; dy <= r + 2; dy++)
          for (let dx = -r - 2; dx <= r + 2; dx++)
            if (continent.biomes[index(x + dx, y + dy)] === 'ocean') coast = true;
        if (!coast) continue;
      }
      return { x, y };
    }
    return null;
  }

  /** Un tile libre cerca de `center` (para el hogar de una criatura). */
  function spotNear(center: Position, radius: number): Position {
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = center.x + Math.round((random.next() - 0.5) * radius * 2);
      const y = center.y + Math.round((random.next() - 0.5) * radius * 2);
      const i = index(x, y);
      const kind = statics.get(i)?.kind;
      if (terrain[i] !== Terrain.Water && terrain[i] !== Terrain.Rock && !kind) return { x, y };
    }
    return center;
  }

  /** Al pie de la cordillera, un claro firme para la boca de la Cueva del Lamento. */
  function findCaveEntrance(): Position {
    // Primero, al pie de una montaña y lejos de la capital; si el mapa es muy
    // chico para eso, cualquier claro firme fuera de los pueblos.
    const hasMountains = continent.biomes.includes('mountain');
    for (const strict of [true, false]) {
      for (let attempt = 0; attempt < 20000; attempt++) {
        const angle = random.next() * Math.PI * 2;
        const distance = strict
          ? 28 + random.next() * Math.max(20, Math.min(width, height) * 0.3)
          : 6 + random.next() * Math.min(width, height) * 0.5;
        const x = Math.round(capital.x + Math.cos(angle) * distance);
        const y = Math.round(capital.y + Math.sin(angle) * distance);
        if (x < 4 || y < 4 || x >= width - 4 || y >= height - 4) continue;
        if (strict && taken.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + 2)) continue;
        // Si hay montañas, la boca tiene que mirar a una.
        if (strict && hasMountains && continent.biomes[index(x, y - 2)] !== 'mountain') continue;
        let ok = true;
        for (let dy = -1; dy <= 2 && ok; dy++)
          for (let dx = -2; dx <= 2 && ok; dx++) {
            const t = terrain[index(x + dx, y + dy)];
            const biome = continent.biomes[index(x + dx, y + dy)];
            ok =
              (t === Terrain.Grass || t === Terrain.Dirt || t === Terrain.Snow) &&
              biome !== 'mountain';
            if (map.regionAt({ x: x + dx, y: y + dy })) ok = false;
          }
        if (ok) return { x, y };
      }
    }
    throw new Error('No hay lugar en el continente para la entrada de la cueva');
  }

  /** Criaturas sueltas por bioma, proporcionales a su superficie. */
  function biomeCreatures(world: TileMap): { kind: CreatureKind; home: Position }[] {
    const tiles = new Map<Biome, Position[]>();
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const biome = continent.biomes[index(x, y)];
        if (!biome || !BIOME_CREATURES[biome]) continue;
        let list = tiles.get(biome);
        if (!list) tiles.set(biome, (list = []));
        list.push({ x, y });
      }
    }
    const out: { kind: CreatureKind; home: Position }[] = [];
    const used = new Set<number>();
    const quiet = (p: Position): boolean =>
      continent.towns.some(
        (t) =>
          p.x > t.x - QUIET_RADIUS &&
          p.y > t.y - QUIET_RADIUS &&
          p.x < t.x + t.width + QUIET_RADIUS &&
          p.y < t.y + t.height + QUIET_RADIUS,
      );
    for (const [biome, positions] of tiles) {
      for (const [kind, density] of BIOME_CREATURES[biome] ?? []) {
        const count = Math.round((positions.length / 1000) * density);
        for (let placed = 0, tries = 0; placed < count && tries < count * 40; tries++) {
          const p = positions[Math.floor(random.next() * positions.length)];
          if (!p || used.has(index(p.x, p.y)) || quiet(p)) continue;
          if (!world.isWalkable(p) || world.regionAt(p)) continue;
          used.add(index(p.x, p.y));
          out.push({ kind, home: p });
          placed++;
        }
      }
    }
    return out;
  }
}

/** El suelo de un sendero: tierra pisada (en la nieve y la arena, el mismo suelo). */
function trailGround(ground: Terrain | undefined): Terrain {
  if (ground === Terrain.Snow || ground === Terrain.Sand) return ground;
  return Terrain.Dirt;
}
