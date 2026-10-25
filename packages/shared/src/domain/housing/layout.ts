import type { Position } from '../geometry/position';
import type { StaticKind, StaticPlacement } from '../world/statics';
import { Terrain } from '../world/terrain';
import type { TerrainPatch } from '../world/tile-map';
import { customLayout, emptyDesign } from './design';
import { HOUSE_PLANS, HOUSE_STYLES, type HouseKind, type HouseWalls } from './houses';

/** Un rectángulo de tiles, con los dos extremos incluidos. */
export interface TileRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/**
 * Un piso alto (o el techo) de una casa, armado sobre su propia grilla: la
 * casa la ubica en un lugar apartado del mapa (como los pisos de los
 * edificios de los pueblos) y se ve encima de la planta baja.
 */
export interface HouseLevelLayout {
  /** 1 = primer piso; el último es el techo o la azotea. */
  readonly level: number;
  readonly roof: boolean;
  readonly width: number;
  readonly height: number;
  /** Terreno de cada tile (fila por fila); la roca de alrededor es el vacío. */
  readonly terrain: readonly Terrain[];
  readonly statics: readonly StaticPlacement[];
  /** La bajada al piso de abajo y dónde se aparece al subir (null: techo sin acceso). */
  readonly down: Position | null;
  readonly arrival: Position | null;
  /** La escalera al piso de arriba y dónde se aparece al volver de él. */
  readonly up: Position | null;
  readonly upBack: Position | null;
  /** Las puertas y los cofres de este piso (solo en las casas a medida). */
  readonly doors?: readonly Position[];
  readonly chests?: readonly Position[];
}

/**
 * El plano de una casa, con su esquina de arriba a la izquierda en (0, 0).
 * Las paredes van en el borde de atrás de cada tile, como en los pueblos: la
 * del norte y la del oeste dentro de la casa, la del este y la del sur en la
 * columna y la fila de afuera.
 */
export interface HouseLayout {
  readonly kind: HouseKind;
  /** Lo que ocupa la casa (paredes y patio incluidos). */
  readonly width: number;
  readonly height: number;
  readonly terrain: readonly TerrainPatch[];
  readonly statics: readonly StaticPlacement[];
  /** Las hojas de la puerta de entrada. */
  readonly doors: readonly Position[];
  /** Todas las puertas de la planta baja (la de entrada y la de los cuartos). */
  readonly allDoors: readonly Position[];
  /** El tile de adentro pegado a la puerta y el de afuera, delante de la entrada. */
  readonly entry: Position;
  readonly front: Position;
  /** El cartel con el nombre, afuera, al lado del camino a la puerta. */
  readonly sign: Position;
  /** Dónde van los cofres de la casa. */
  readonly chests: readonly Position[];
  /** El piso de adentro de la planta baja (sin las paredes). */
  readonly interior: TileRect;
  /** La escalera de la planta baja y dónde se aparece al bajar. */
  readonly stairs: Position | null;
  readonly stairsBack: Position | null;
  /** Los pisos altos y, al final, el techo. */
  readonly levels: readonly HouseLevelLayout[];
}

/** Roca de alrededor de cada piso alto (se ve negro, como el vacío) más la fila de las paredes. */
export const FLOOR_MARGIN = 2;

/** El patio: baldosas de barro cocido con una cerca baja. */
const PATIO_FLOOR = Terrain.Terracotta;
const FENCE = { x: 'fence-x', y: 'fence-y' } as const;

const ORDINALS = ['primer', 'segundo', 'tercer', 'cuarto'];

/** El nombre de un piso de la casa ("Casa de Ana, primer piso", "…, azotea"). */
export function levelName(house: string, level: HouseLevelLayout, floors: number): string {
  if (!level.roof) return `${house}, ${ORDINALS[level.level - 1] ?? `${level.level}.º`} piso`;
  return `${house}, ${floors > 0 ? 'azotea' : 'techo'}`;
}

const cache = new Map<HouseKind, HouseLayout>();

/** El plano de cada clase de casa (siempre el mismo; un lote, vacío). */
export function houseLayout(kind: HouseKind): HouseLayout {
  let layout = cache.get(kind);
  if (!layout)
    cache.set(
      kind,
      (layout = HOUSE_PLANS[kind].lot ? customLayout(kind, emptyDesign(kind)) : buildLayout(kind)),
    );
  return layout;
}

function buildLayout(kind: HouseKind): HouseLayout {
  const plan = HOUSE_PLANS[kind];
  const style = HOUSE_STYLES[plan.style];
  const { walls } = style;
  const w = plan.width;
  const h = plan.height;
  const p = plan.patio;
  const terrain = new Map<string, TerrainPatch>();
  const statics = new Map<string, StaticPlacement>();
  const ground = (x: number, y: number, t: Terrain): void => {
    terrain.set(`${x},${y}`, { x, y, terrain: t });
  };
  const put = (x: number, y: number, kind: StaticKind): void => {
    statics.set(`${x},${y}`, { x, y, kind });
  };

  // El piso (con la fila y la columna de las paredes del norte y del oeste).
  for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) ground(x, y, style.floor);
  // Las paredes, alrededor del piso de adentro (1..w, 1..h).
  put(0, 0, walls.corner);
  for (let x = 1; x <= w; x++) put(x, 0, walls.x);
  for (let y = 1; y <= h; y++) put(0, y, walls.y);
  for (let y = 0; y <= h; y++) put(w + 1, y, walls.y);
  for (let x = 0; x <= w; x++) put(x, h + 1, walls.x);
  put(w + 1, h + 1, walls.post);

  // La puerta de entrada, al medio de la pared del sur (la que se ve).
  const leaves = plan.door === 'single' ? 1 : 2;
  const doorX = 1 + Math.floor((w - leaves) / 2);
  const doorKinds: readonly StaticKind[] =
    plan.door === 'single'
      ? ['door-x']
      : plan.door === 'double'
        ? ['door-x-l', 'door-x-r']
        : ['iron-door-x-l', 'iron-door-x-r'];
  const doors = doorKinds.map((kind, i) => {
    const at = { x: doorX + i, y: h + 1 };
    put(at.x, at.y, kind);
    ground(at.x, at.y, style.floor);
    return at;
  });
  windows(walls, w, h, doorX, leaves, put);

  // Dos cuartos: una pared por el medio, con una puerta frente a la entrada.
  const allDoors = [...doors];
  let split: number | null = null;
  if (plan.rooms) {
    split = 1 + Math.floor(h / 2);
    for (let x = 1; x <= w; x++) put(x, split, walls.x);
    const inner: readonly StaticKind[] = leaves === 1 ? ['door-x'] : ['door-x-l', 'door-x-r'];
    inner.forEach((kind, i) => {
      put(doorX + i, split as number, kind);
      allDoors.push({ x: doorX + i, y: split as number });
    });
  }

  // El patio cercado, delante de la puerta.
  let height = h + 2;
  if (p > 0) {
    for (let y = h + 2; y <= h + 1 + p; y++) for (let x = 0; x <= w; x++) ground(x, y, PATIO_FLOOR);
    for (let y = h + 2; y <= h + 1 + p; y++) {
      put(0, y, FENCE.y);
      put(w + 1, y, FENCE.y);
    }
    const gate = h + 2 + p;
    for (let x = 0; x <= w; x++)
      if (x < doorX || x >= doorX + leaves) put(x, gate, FENCE.x);
      else ground(x, gate, PATIO_FLOOR);
    put(w + 1, gate, FENCE.y);
    height = gate + 1;
  }

  const entry = { x: doorX, y: h };
  const front = { x: doorX, y: height };
  const sign = { x: Math.min(w + 1, doorX + leaves + 1), y: height };
  const interior: TileRect = { x0: 1, y0: 1, x1: w, y1: h };

  // La escalera en el rincón de atrás, del lado del oeste.
  let stairs: Position | null = null;
  let stairsBack: Position | null = null;
  if (plan.floors > 0) {
    stairs = { x: 1, y: 1 };
    stairsBack = { x: 2, y: 1 };
    put(stairs.x, stairs.y, style.stairs);
  }

  // Los cofres, en los rincones libres (lejos de la entrada y de la escalera).
  const busy = new Set<string>([`${entry.x},${entry.y}`]);
  if (stairs && stairsBack)
    busy.add(`${stairs.x},${stairs.y}`).add(`${stairsBack.x},${stairsBack.y}`);
  for (const at of allDoors) {
    busy.add(`${at.x},${at.y - 1}`);
    busy.add(`${at.x},${at.y + 1}`);
  }
  const corners: Position[] = [
    { x: w, y: 1 },
    { x: 1, y: h },
    { x: w, y: h },
    { x: 1, y: 1 },
  ];
  for (let x = w - 1; x >= 2; x--) corners.push({ x, y: 1 });
  for (let y = 2; y < h; y++) corners.push({ x: w, y }, { x: 1, y });
  const chests: Position[] = [];
  for (const at of corners) {
    if (chests.length >= plan.chests) break;
    const key = `${at.x},${at.y}`;
    if (busy.has(key) || (split !== null && at.y === split) || statics.has(key)) continue;
    busy.add(key);
    chests.push(at);
  }

  const levels: HouseLevelLayout[] = [];
  let below: Position | null = stairs ? { x: stairs.x - 1, y: stairs.y - 1 } : null;
  for (let level = 1; level <= plan.floors; level++) {
    const floor = buildFloor(
      walls,
      style.floor,
      w,
      h,
      level,
      plan.floors,
      below ?? { x: 0, y: 0 },
      style.stairs,
    );
    levels.push(floor);
    below = floor.up ? { x: floor.up.x - FLOOR_MARGIN, y: floor.up.y - FLOOR_MARGIN } : null;
  }
  levels.push(buildRoof(style.roof, w, h, plan.floors + 1, plan.floors > 0 ? below : null));

  return {
    kind,
    width: w + 2,
    height,
    terrain: [...terrain.values()],
    statics: [...statics.values()],
    doors,
    allDoors,
    entry,
    front,
    sign,
    chests,
    interior,
    stairs,
    stairsBack,
    levels,
  };
}

/** Ventanas en las paredes que se ven (sur y este), cada tres tiles y lejos de la puerta. */
function windows(
  walls: HouseWalls,
  w: number,
  h: number,
  doorX: number,
  leaves: number,
  put: (x: number, y: number, kind: StaticKind) => void,
): void {
  for (let x = 2; x < w; x += 3)
    if (x < doorX - 1 || x > doorX + leaves) put(x, h + 1, walls.windowX);
  for (let y = 2; y < h; y += 3) put(w + 1, y, walls.windowY);
}

/** Un piso alto: del tamaño de la planta baja, con sus paredes, la bajada y la escalera que sigue. */
function buildFloor(
  walls: HouseWalls,
  floorTerrain: Terrain,
  w: number,
  h: number,
  level: number,
  floors: number,
  holeAt: Position,
  stairsKind: StaticKind,
): HouseLevelLayout {
  const M = FLOOR_MARGIN;
  const width = w + M * 2;
  const height = h + M * 2;
  const terrain = new Array<Terrain>(width * height).fill(Terrain.Rock);
  const statics: StaticPlacement[] = [];
  const taken = new Set<string>();
  const inside = (x: number, y: number): boolean => x >= M && y >= M && x < M + w && y < M + h;
  const x0 = M - 1;
  const y0 = M - 1;
  const x1 = M + w;
  const y1 = M + h;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) terrain[y * width + x] = floorTerrain;
  statics.push({ kind: walls.corner, x: x0, y: y0 });
  for (let x = x0 + 1; x < x1; x++) statics.push({ kind: walls.x, x, y: y0 });
  for (let y = y0 + 1; y < y1; y++) statics.push({ kind: walls.y, x: x0, y });
  for (let y = y0; y < y1; y++)
    statics.push({ kind: (y - y0) % 3 === 2 ? walls.windowY : walls.y, x: x1, y });
  for (let x = x0; x < x1; x++)
    statics.push({ kind: (x - x0) % 3 === 2 ? walls.windowX : walls.x, x, y: y1 });
  statics.push({ kind: walls.post, x: x1, y: y1 });

  const down = { x: M + holeAt.x, y: M + holeAt.y };
  statics.push({ kind: 'stair-hole', ...down });
  taken.add(`${down.x},${down.y}`);
  const arrival = beside(down, inside, taken) ?? down;
  taken.add(`${arrival.x},${arrival.y}`);

  // La escalera que sigue, en la punta más lejana: entre pisos la de la casa;
  // del último piso a la azotea, una de mano.
  let up: Position | null = null;
  let upBack: Position | null = null;
  const kind: StaticKind = level < floors ? stairsKind : 'ladder-up';
  const corners = [
    { x: M, y: M },
    { x: M + w - 1, y: M },
    { x: M, y: M + h - 1 },
    { x: M + w - 1, y: M + h - 1 },
  ].sort(
    (a, b) =>
      Math.abs(b.x - down.x) +
      Math.abs(b.y - down.y) -
      Math.abs(a.x - down.x) -
      Math.abs(a.y - down.y),
  );
  for (const corner of corners) {
    if (taken.has(`${corner.x},${corner.y}`)) continue;
    taken.add(`${corner.x},${corner.y}`);
    const back = beside(corner, inside, taken);
    if (!back) continue;
    statics.push({ kind, ...corner });
    up = corner;
    upBack = back;
    taken.add(`${back.x},${back.y}`);
    break;
  }
  return { level, roof: false, width, height, terrain, statics, down, arrival, up, upBack };
}

/** El techo de arriba de todo: azotea de piedra con almenas o techo de tablas con baranda. */
function buildRoof(
  roof: 'stone' | 'wood',
  w: number,
  h: number,
  level: number,
  hatchAt: Position | null,
): HouseLevelLayout {
  const M = FLOOR_MARGIN;
  const width = w + M * 2;
  const height = h + M * 2;
  const terrain = new Array<Terrain>(width * height).fill(Terrain.Rock);
  const deck = roof === 'stone' ? Terrain.Flagstone : Terrain.Wood;
  for (let y = M - 1; y < M + h; y++)
    for (let x = M - 1; x < M + w; x++) terrain[y * width + x] = deck;
  const kit: { x: StaticKind; y: StaticKind; corner: StaticKind; post: StaticKind } =
    roof === 'stone'
      ? { x: 'parapet-x', y: 'parapet-y', corner: 'parapet-corner', post: 'parapet-post' }
      : { x: 'fence-x', y: 'fence-y', corner: 'fence-x', post: 'fence-y' };
  const statics: StaticPlacement[] = [];
  const x0 = M - 1;
  const y0 = M - 1;
  const x1 = M + w;
  const y1 = M + h;
  statics.push({ kind: kit.corner, x: x0, y: y0 });
  for (let x = x0 + 1; x < x1; x++) statics.push({ kind: kit.x, x, y: y0 });
  for (let y = y0 + 1; y < y1; y++) statics.push({ kind: kit.y, x: x0, y });
  for (let y = y0; y < y1; y++) statics.push({ kind: kit.y, x: x1, y });
  for (let x = x0; x < x1; x++) statics.push({ kind: kit.x, x, y: y1 });
  statics.push({ kind: kit.post, x: x1, y: y1 });
  let down: Position | null = null;
  let arrival: Position | null = null;
  if (hatchAt) {
    down = { x: M + hatchAt.x, y: M + hatchAt.y };
    statics.push({ kind: 'trapdoor', ...down });
    const inside = (x: number, y: number): boolean => x >= M && y >= M && x < M + w && y < M + h;
    arrival = beside(down, inside, new Set([`${down.x},${down.y}`]));
  }
  return {
    level,
    roof: true,
    width,
    height,
    terrain,
    statics,
    down,
    arrival,
    up: null,
    upBack: null,
  };
}

/** Un tile libre pegado (para aparecer al lado de una escalera). */
function beside(
  at: Position,
  inside: (x: number, y: number) => boolean,
  taken: ReadonlySet<string>,
): Position | null {
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    const x = at.x + dx;
    const y = at.y + dy;
    if (inside(x, y) && !taken.has(`${x},${y}`)) return { x, y };
  }
  return null;
}
