import type { Position } from '../geometry/position';
import type { ItemKind } from '../items/item-catalog';
import type { StaticKind, StaticPlacement } from '../world/statics';
import { Terrain } from '../world/terrain';
import type { TerrainPatch } from '../world/tile-map';
import { HOUSE_PLANS, HOUSE_STYLES, type HouseKind, type HouseStyle } from './houses';
import { FLOOR_MARGIN, type HouseLayout, type HouseLevelLayout } from './layout';

/**
 * Casa a medida, como el diseñador de casas de UO: se compra un lote vacío
 * (la escritura del arquitecto) y adentro se ponen las piezas piso por piso:
 * pisos, paredes, ventanas, puertas, escaleras y cofres. Arriba de todo va el
 * techo, solo. Cada cambio se paga al confirmarlo, con oro o con materiales
 * (tablas, troncos, bloques de piedra y lingotes); lo que se saca devuelve la
 * mitad de los materiales.
 *
 * El diseño es una grilla por planta del tamaño del lote con sus paredes (el
 * interior más una fila y una columna de cada lado), con las paredes en el
 * borde de atrás de cada tile como en las casas prefabricadas. Las paredes,
 * las ventanas y las puertas toman su orientación de las vecinas.
 */

/** Los materiales con que se construye. */
export const BUILDING_MATERIALS = ['boards', 'logs', 'stone-block', 'iron-ingot'] as const;
export type BuildingMaterial = (typeof BUILDING_MATERIALS)[number] & ItemKind;
export type Materials = Partial<Record<BuildingMaterial, number>>;

interface Priced {
  readonly name: string;
  /** Una letra para guardar el diseño en poco lugar. */
  readonly code: string;
  readonly gold: number;
  readonly materials: Materials;
}

export type FloorKind =
  'wood' | 'flagstone' | 'stone-tiles' | 'sandstone' | 'terracotta' | 'marble';

export interface FloorDefinition extends Priced {
  readonly terrain: Terrain;
}

export const HOUSE_FLOORS: Readonly<Record<FloorKind, FloorDefinition>> = {
  wood: {
    name: 'piso de madera',
    code: 'w',
    terrain: Terrain.Wood,
    gold: 8,
    materials: { boards: 1 },
  },
  flagstone: {
    name: 'piso de laja',
    code: 'f',
    terrain: Terrain.Flagstone,
    gold: 10,
    materials: { 'stone-block': 1 },
  },
  'stone-tiles': {
    name: 'baldosas de piedra',
    code: 't',
    terrain: Terrain.StoneTiles,
    gold: 12,
    materials: { 'stone-block': 1 },
  },
  sandstone: {
    name: 'piso de arenisca',
    code: 's',
    terrain: Terrain.Sandstone,
    gold: 12,
    materials: { 'stone-block': 1 },
  },
  terracotta: {
    name: 'baldosas de barro',
    code: 'c',
    terrain: Terrain.Terracotta,
    gold: 10,
    materials: { 'stone-block': 1 },
  },
  marble: {
    name: 'piso de mármol',
    code: 'm',
    terrain: Terrain.MarbleLight,
    gold: 25,
    materials: { 'stone-block': 2 },
  },
};

export type PieceGroup = 'wall' | 'window' | 'door' | 'stairs' | 'chest';

export type PieceKind =
  | `wall-${HouseStyle}`
  | `window-${HouseStyle}`
  | 'door-wood'
  | 'door-iron'
  | 'stairs-wood'
  | 'stairs-stone'
  | 'chest';

export interface PieceDefinition extends Priced {
  readonly group: PieceGroup;
  readonly style?: HouseStyle;
}

/** Lo que cuesta una pared de cada material (las ventanas, un poco más). */
const WALL_PRICES: Readonly<
  Record<HouseStyle, { code: string; gold: number; materials: Materials }>
> = {
  plank: { code: 'P', gold: 40, materials: { boards: 4 } },
  log: { code: 'L', gold: 40, materials: { logs: 4 } },
  stone: { code: 'S', gold: 60, materials: { 'stone-block': 5 } },
  basalt: { code: 'B', gold: 80, materials: { 'stone-block': 6 } },
  sandstone: { code: 'A', gold: 70, materials: { 'stone-block': 5 } },
};

function wallPieces(): Record<`wall-${HouseStyle}` | `window-${HouseStyle}`, PieceDefinition> {
  const pieces = {} as Record<`wall-${HouseStyle}` | `window-${HouseStyle}`, PieceDefinition>;
  for (const style of Object.keys(WALL_PRICES) as HouseStyle[]) {
    const price = WALL_PRICES[style];
    const material = HOUSE_STYLES[style].name;
    pieces[`wall-${style}`] = {
      name: `pared de ${material}`,
      code: price.code,
      group: 'wall',
      style,
      gold: price.gold,
      materials: price.materials,
    };
    pieces[`window-${style}`] = {
      name: `ventana de ${material}`,
      code: price.code.toLowerCase(),
      group: 'window',
      style,
      gold: price.gold + 20,
      materials: price.materials,
    };
  }
  return pieces;
}

export const HOUSE_PIECES: Readonly<Record<PieceKind, PieceDefinition>> = {
  ...wallPieces(),
  'door-wood': {
    name: 'puerta de madera',
    code: 'D',
    group: 'door',
    gold: 120,
    materials: { boards: 10 },
  },
  'door-iron': {
    name: 'puerta de hierro',
    code: 'I',
    group: 'door',
    gold: 400,
    materials: { 'iron-ingot': 12 },
  },
  'stairs-wood': {
    name: 'escalera de madera',
    code: 'E',
    group: 'stairs',
    gold: 300,
    materials: { boards: 25 },
  },
  'stairs-stone': {
    name: 'escalera de piedra',
    code: 'F',
    group: 'stairs',
    gold: 400,
    materials: { 'stone-block': 30 },
  },
  chest: {
    name: 'cofre de la casa',
    code: 'C',
    group: 'chest',
    gold: 1000,
    materials: { boards: 40, 'iron-ingot': 5 },
  },
};

export const PIECE_KINDS = Object.keys(HOUSE_PIECES) as PieceKind[];
export const FLOOR_KINDS = Object.keys(HOUSE_FLOORS) as FloorKind[];

export type RoofKind = 'wood' | 'stone';

export const HOUSE_ROOFS: Readonly<Record<RoofKind, Priced & { readonly terrain: Terrain }>> = {
  wood: {
    name: 'techo de tablas',
    code: 'w',
    terrain: Terrain.Wood,
    gold: 10,
    materials: { boards: 1 },
  },
  stone: {
    name: 'azotea de piedra',
    code: 's',
    terrain: Terrain.Flagstone,
    gold: 12,
    materials: { 'stone-block': 1 },
  },
};

export function isRoofKind(value: unknown): value is RoofKind {
  return value === 'wood' || value === 'stone';
}

/**
 * El diseño de una casa a medida. Cada planta (0 = planta baja) es un texto
 * con dos letras por tile, fila por fila: el piso y la pieza ('.' = nada).
 */
export interface HouseDesign {
  readonly levels: readonly string[];
  readonly roof: RoofKind;
}

export interface DesignCell {
  readonly floor: FloorKind | null;
  readonly piece: PieceKind | null;
}

const EMPTY = '.';
const FLOOR_BY_CODE = new Map(FLOOR_KINDS.map((k) => [HOUSE_FLOORS[k].code, k]));
const PIECE_BY_CODE = new Map(PIECE_KINDS.map((k) => [HOUSE_PIECES[k].code, k]));

/** ¿Es un lote para una casa a medida? */
export function isLot(kind: HouseKind): boolean {
  return HOUSE_PLANS[kind].lot === true;
}

/** El lado de la grilla del diseño: el interior más las paredes. */
export function lotSide(kind: HouseKind): number {
  return HOUSE_PLANS[kind].width + 2;
}

/** Cuántas plantas se pueden diseñar (la baja y las de arriba). */
export function lotLevels(kind: HouseKind): number {
  return HOUSE_PLANS[kind].floors + 1;
}

/** El lote vacío. */
export function emptyDesign(kind: HouseKind): HouseDesign {
  const side = lotSide(kind);
  return {
    levels: Array.from({ length: lotLevels(kind) }, () => EMPTY.repeat(side * side * 2)),
    roof: 'wood',
  };
}

export function designCell(
  design: HouseDesign,
  level: number,
  x: number,
  y: number,
  side: number,
): DesignCell {
  const row = design.levels[level];
  if (!row || x < 0 || y < 0 || x >= side || y >= side) return { floor: null, piece: null };
  const i = (y * side + x) * 2;
  return {
    floor: FLOOR_BY_CODE.get(row.charAt(i)) ?? null,
    piece: PIECE_BY_CODE.get(row.charAt(i + 1)) ?? null,
  };
}

/** El diseño con un tile cambiado (lo que no se pasa queda como estaba). */
export function withCell(
  design: HouseDesign,
  level: number,
  x: number,
  y: number,
  side: number,
  change: { floor?: FloorKind | null; piece?: PieceKind | null },
): HouseDesign {
  const row = design.levels[level];
  if (!row || x < 0 || y < 0 || x >= side || y >= side) return design;
  const i = (y * side + x) * 2;
  const floor =
    change.floor === undefined
      ? row.charAt(i)
      : change.floor
        ? HOUSE_FLOORS[change.floor].code
        : EMPTY;
  const piece =
    change.piece === undefined
      ? row.charAt(i + 1)
      : change.piece
        ? HOUSE_PIECES[change.piece].code
        : EMPTY;
  const next = row.slice(0, i) + floor + piece + row.slice(i + 2);
  if (next === row) return design;
  return { ...design, levels: design.levels.map((r, l) => (l === level ? next : r)) };
}

/**
 * Lee un diseño que viene de afuera (de la red o de lo guardado). Con la
 * clase de lote, además controla que tenga su tamaño. null si está mal.
 */
export function parseHouseDesign(value: unknown, kind?: HouseKind): HouseDesign | null {
  if (typeof value !== 'object' || value === null) return null;
  const { levels, roof } = value as Record<string, unknown>;
  if (!isRoofKind(roof) || !Array.isArray(levels) || levels.length === 0 || levels.length > 4)
    return null;
  const length = typeof levels[0] === 'string' ? levels[0].length : 0;
  for (const row of levels) {
    if (typeof row !== 'string' || row.length !== length || length % 2 !== 0) return null;
    for (let i = 0; i < row.length; i += 2) {
      const f = row.charAt(i);
      const p = row.charAt(i + 1);
      if ((f !== EMPTY && !FLOOR_BY_CODE.has(f)) || (p !== EMPTY && !PIECE_BY_CODE.has(p)))
        return null;
    }
  }
  if (kind) {
    const side = lotSide(kind);
    if (!isLot(kind) || levels.length !== lotLevels(kind) || length !== side * side * 2)
      return null;
  }
  return { levels: levels as string[], roof };
}

// ── Del diseño al plano de la casa ───────────────────────────────────

const STEPS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

class Grid {
  constructor(
    readonly design: HouseDesign,
    readonly side: number,
  ) {}

  cell(level: number, x: number, y: number): DesignCell {
    return designCell(this.design, level, x, y, this.side);
  }

  group(level: number, x: number, y: number): PieceGroup | null {
    const piece = this.cell(level, x, y).piece;
    return piece ? HOUSE_PIECES[piece].group : null;
  }

  /** Pared, ventana o puerta: lo que arma la línea de una pared. */
  walled(level: number, x: number, y: number): boolean {
    const group = this.group(level, x, y);
    return group === 'wall' || group === 'window' || group === 'door';
  }

  /** ¿Hay algo en ese tile (piso o pieza)? */
  used(level: number, x: number, y: number): boolean {
    const cell = this.cell(level, x, y);
    return cell.floor !== null || cell.piece !== null;
  }

  levelUsed(level: number): boolean {
    for (let y = 0; y < this.side; y++)
      for (let x = 0; x < this.side; x++) if (this.used(level, x, y)) return true;
    return false;
  }

  /** Un tile con piso y sin nada encima (para aparecer al subir o bajar). */
  free(level: number, x: number, y: number): boolean {
    const cell = this.cell(level, x, y);
    return cell.floor !== null && cell.piece === null;
  }

  /** Las escaleras de una planta. */
  stairs(level: number): Position[] {
    const found: Position[] = [];
    for (let y = 0; y < this.side; y++)
      for (let x = 0; x < this.side; x++)
        if (this.group(level, x, y) === 'stairs') found.push({ x, y });
    return found;
  }
}

/** Qué pared va en ese tile según las vecinas (esquina, columna, a lo largo de x o de y). */
function wallKind(grid: Grid, level: number, x: number, y: number, style: HouseStyle): StaticKind {
  const walls = HOUSE_STYLES[style].walls;
  const n = grid.walled(level, x, y - 1);
  const s = grid.walled(level, x, y + 1);
  const w = grid.walled(level, x - 1, y);
  const e = grid.walled(level, x + 1, y);
  if (e && s) return walls.corner;
  if (w && n && !e && !s) return walls.post;
  if (w && s) return walls.y;
  if (e || w) return walls.x;
  if (n || s) return walls.y;
  return walls.post;
}

/** ¿La abertura (ventana o puerta) va en una pared a lo largo de y? */
function alongY(grid: Grid, level: number, x: number, y: number): boolean {
  const ns = grid.walled(level, x, y - 1) || grid.walled(level, x, y + 1);
  const we = grid.walled(level, x - 1, y) || grid.walled(level, x + 1, y);
  return ns && !we;
}

function staticOf(grid: Grid, level: number, x: number, y: number): StaticKind | null {
  const piece = grid.cell(level, x, y).piece;
  if (!piece) return null;
  const def = HOUSE_PIECES[piece];
  switch (def.group) {
    case 'wall':
      return wallKind(grid, level, x, y, def.style ?? 'stone');
    case 'window': {
      const walls = HOUSE_STYLES[def.style ?? 'stone'].walls;
      return alongY(grid, level, x, y) ? walls.windowY : walls.windowX;
    }
    case 'door': {
      const y_ = alongY(grid, level, x, y);
      if (piece === 'door-iron') return y_ ? 'iron-door-y' : 'iron-door-x';
      return y_ ? 'door-y' : 'door-x';
    }
    case 'stairs':
      return piece === 'stairs-stone' ? 'stairs-stone' : 'stairs-wood';
    case 'chest':
      return null;
  }
}

/** Un tile libre pegado (en el orden de siempre), que no esté en `taken`. */
function besideFree(
  grid: Grid,
  level: number,
  at: Position,
  taken: ReadonlySet<string>,
): Position | null {
  for (const [dx, dy] of STEPS) {
    const p = { x: at.x + dx, y: at.y + dy };
    if (grid.free(level, p.x, p.y) && !taken.has(`${p.x},${p.y}`)) return p;
  }
  return null;
}

interface Built {
  readonly layout: HouseLayout;
  readonly problem: string | null;
}

const built = new WeakMap<HouseDesign, Built>();

/** El plano de una casa a medida (con el problema del diseño, si tiene). */
export function customLayout(kind: HouseKind, design: HouseDesign): HouseLayout {
  return build(kind, design).layout;
}

/**
 * Por qué ese diseño no se puede construir (null: se puede): lo de arriba
 * tiene que apoyarse en algo, a cada planta se sube por una escalera (una por
 * planta), los cofres tienen piso y se llega a ellos desde afuera.
 */
export function designProblem(kind: HouseKind, design: HouseDesign): string | null {
  return build(kind, design).problem;
}

function build(kind: HouseKind, design: HouseDesign): Built {
  let result = built.get(design);
  if (!result) built.set(design, (result = buildCustom(kind, design)));
  return result;
}

const ORDINAL = ['planta baja', 'primer piso', 'segundo piso', 'tercer piso'];

/** "la planta baja", "el primer piso". */
export function levelLabel(level: number): string {
  return level === 0 ? 'planta baja' : (ORDINAL[level] ?? `piso ${level}`);
}

function buildCustom(kind: HouseKind, design: HouseDesign): Built {
  const side = lotSide(kind);
  const n = side - 2;
  const grid = new Grid(design, side);
  const plan = HOUSE_PLANS[kind];
  const M = FLOOR_MARGIN;
  /** Del tile del diseño al de su planta en el lugar apartado. */
  const up = (p: Position): Position => ({ x: p.x + M - 1, y: p.y + M - 1 });
  const problems: string[] = [];
  const fail = (text: string): void => {
    problems.push(text);
  };

  // Hasta qué planta hay algo construido.
  let top = 0;
  for (let l = design.levels.length - 1; l > 0; l--)
    if (grid.levelUsed(l)) {
      top = l;
      break;
    }

  // Lo de arriba se apoya en algo y a cada planta se llega por una escalera.
  for (let l = 1; l <= top; l++) {
    for (let y = 0; y < side; y++)
      for (let x = 0; x < side; x++)
        if (grid.used(l, x, y) && !grid.used(l - 1, x, y))
          fail(`En ${levelLabel(l)} hay piezas en el aire: necesitan un piso o una pared debajo.`);
    if (grid.stairs(l - 1).length === 0)
      fail(`Para construir en ${levelLabel(l)} hace falta una escalera en ${levelLabel(l - 1)}.`);
  }
  for (let l = 0; l < design.levels.length; l++) {
    const stairs = grid.stairs(l);
    if (stairs.length > 1) fail(`En ${levelLabel(l)} puede haber una sola escalera.`);
    for (const s of stairs) {
      if (!grid.cell(l, s.x, s.y).floor) fail('La escalera necesita piso debajo.');
      if (l + 1 >= design.levels.length) fail('Desde el último piso no se puede subir más.');
      else if (!grid.free(l + 1, s.x, s.y))
        fail(`Arriba de la escalera, en ${levelLabel(l + 1)}, tiene que haber piso libre.`);
    }
  }

  // Los cofres de la casa: con piso y sin pasarse de los que entran en el lote.
  let chestCount = 0;
  for (let l = 0; l < design.levels.length; l++)
    for (let y = 0; y < side; y++)
      for (let x = 0; x < side; x++)
        if (grid.group(l, x, y) === 'chest') {
          chestCount++;
          if (!grid.cell(l, x, y).floor) fail('Los cofres necesitan piso debajo.');
        }
  if (chestCount > plan.chests) fail(`En este lote entran hasta ${plan.chests} cofres.`);

  // La planta baja.
  const terrain: TerrainPatch[] = [];
  const statics: StaticPlacement[] = [];
  const allDoors: Position[] = [];
  const chests: Position[] = [];
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const cell = grid.cell(0, x, y);
      if (cell.floor) terrain.push({ x, y, terrain: HOUSE_FLOORS[cell.floor].terrain });
      const kind = staticOf(grid, 0, x, y);
      if (kind) statics.push({ x, y, kind });
      const group = grid.group(0, x, y);
      if (group === 'door') allDoors.push({ x, y });
      if (group === 'chest') chests.push({ x, y });
    }
  const mid = Math.floor(side / 2);
  const front = { x: mid, y: side };
  const sign = { x: Math.min(side - 1, mid + 2), y: side };

  // Las escaleras: dónde se aparece al subir y al bajar.
  const stairsAt = grid.stairs(0)[0] ?? null;
  const groundTaken = new Set<string>();
  const stairsBack = stairsAt && top > 0 ? besideFree(grid, 0, stairsAt, groundTaken) : null;
  if (stairsAt && top > 0 && !stairsBack)
    fail('Al lado de la escalera tiene que quedar un tile de piso libre.');

  const levels: HouseLevelLayout[] = [];
  for (let l = 1; l <= top; l++) {
    const width = side + (M - 1) * 2;
    const t = new Array<Terrain>(width * width).fill(Terrain.Rock);
    const s: StaticPlacement[] = [];
    const doors: Position[] = [];
    const levelChests: Position[] = [];
    for (let y = 0; y < side; y++)
      for (let x = 0; x < side; x++) {
        const at = up({ x, y });
        const cell = grid.cell(l, x, y);
        if (cell.floor) t[at.y * width + at.x] = HOUSE_FLOORS[cell.floor].terrain;
        const kind = staticOf(grid, l, x, y);
        if (kind) s.push({ ...at, kind });
        const group = grid.group(l, x, y);
        if (group === 'door') doors.push(at);
        if (group === 'chest') levelChests.push(at);
      }
    const hole = grid.stairs(l - 1)[0];
    let down: Position | null = null;
    let arrival: Position | null = null;
    const taken = new Set<string>();
    if (hole) {
      down = up(hole);
      s.push({ ...down, kind: 'stair-hole' });
      taken.add(`${hole.x},${hole.y}`);
      const beside = besideFree(grid, l, hole, taken);
      if (!beside) fail(`Al subir a ${levelLabel(l)} hace falta un tile de piso libre al lado.`);
      else {
        arrival = up(beside);
        taken.add(`${beside.x},${beside.y}`);
      }
    }
    const next = grid.stairs(l)[0];
    let stairsUp: Position | null = null;
    let upBack: Position | null = null;
    if (next && l < top) {
      const back = besideFree(grid, l, next, taken);
      if (!back) fail(`Al lado de la escalera de ${levelLabel(l)} tiene que quedar piso libre.`);
      else {
        stairsUp = up(next);
        upBack = up(back);
      }
    }
    levels.push({
      level: l,
      roof: false,
      width,
      height: width,
      terrain: t,
      statics: s,
      down,
      arrival,
      up: stairsUp,
      upBack,
      doors,
      chests: levelChests,
    });
  }

  // El techo, arriba de lo último construido (sin subida: es para verse desde afuera).
  const roof = HOUSE_ROOFS[design.roof];
  const width = side + (M - 1) * 2;
  const deck = new Array<Terrain>(width * width).fill(Terrain.Rock);
  let covered = 0;
  for (const p of roofTiles(grid, top)) {
    const at = up(p);
    deck[at.y * width + at.x] = roof.terrain;
    covered++;
  }
  if (covered > 0)
    levels.push({
      level: top + 1,
      roof: true,
      width,
      height: width,
      terrain: deck,
      statics: [],
      down: null,
      arrival: null,
      up: null,
      upBack: null,
    });

  if (!problems.length) {
    const unreachable = reachProblem(grid, design.levels.length, side);
    if (unreachable) fail(unreachable);
  }

  return {
    layout: {
      kind,
      width: side,
      height: side,
      terrain,
      statics,
      doors: allDoors,
      allDoors,
      entry: { x: mid, y: side - 1 },
      front,
      sign,
      chests,
      interior: { x0: 1, y0: 1, x1: n, y1: n },
      stairs: top > 0 ? stairsAt : null,
      stairsBack,
      levels,
    },
    problem: problems[0] ?? null,
  };
}

/** Los tiles que tapa el techo: los de la última planta con piso o pared. */
function roofTiles(grid: Grid, top: number): Position[] {
  const tiles: Position[] = [];
  for (let y = 0; y < grid.side; y++)
    for (let x = 0; x < grid.side; x++)
      if (grid.cell(top, x, y).floor || grid.walled(top, x, y)) tiles.push({ x, y });
  return tiles;
}

/** ¿Se llega caminando desde afuera a cada cofre y a cada escalera? */
function reachProblem(grid: Grid, levelCount: number, side: number): string | null {
  const passable = (l: number, x: number, y: number): boolean => {
    const group = grid.group(l, x, y);
    if (group === 'wall' || group === 'window') return false;
    // Arriba solo se camina por donde hay piso.
    return l === 0 || grid.cell(l, x, y).floor !== null;
  };
  const visit = (l: number, starts: readonly Position[]): Set<string> => {
    const seen = new Set(starts.map((p) => `${p.x},${p.y}`));
    const queue = [...starts];
    for (let at = queue.pop(); at; at = queue.pop())
      for (const [dx, dy] of STEPS) {
        const p = { x: at.x + dx, y: at.y + dy };
        const key = `${p.x},${p.y}`;
        if (seen.has(key)) continue;
        const outside = p.x < 0 || p.y < 0 || p.x >= side || p.y >= side;
        if (
          outside
            ? l > 0 || p.x < -1 || p.y < -1 || p.x > side || p.y > side
            : !passable(l, p.x, p.y)
        )
          continue;
        seen.add(key);
        queue.push(p);
      }
    return seen;
  };
  let reached = visit(0, [{ x: -1, y: -1 }]);
  for (let l = 0; l < levelCount; l++) {
    if (l > 0) {
      const hole = grid.stairs(l - 1)[0];
      if (!hole || !grid.levelUsed(l)) break;
      if (!reached.has(`${hole.x},${hole.y}`))
        return `No se llega a la escalera de ${levelLabel(l - 1)}.`;
      reached = visit(l, [hole]);
    }
    for (let y = 0; y < side; y++)
      for (let x = 0; x < side; x++) {
        const group = grid.group(l, x, y);
        if (group === 'chest' && !reached.has(`${x},${y}`))
          return `No se llega a un cofre de ${levelLabel(l)}: dejale una puerta.`;
      }
    const stairs = grid.stairs(l)[0];
    if (stairs && !reached.has(`${stairs.x},${stairs.y}`))
      return `No se llega a la escalera de ${levelLabel(l)}: dejale una puerta.`;
  }
  return null;
}

// ── Lo que cuesta ────────────────────────────────────────────────────

export interface DesignCost {
  /** Lo que se paga en oro por lo nuevo. */
  readonly gold: number;
  /** O los materiales que hacen falta para lo nuevo. */
  readonly materials: Materials;
  /** Los materiales que vuelven por lo que se saca (la mitad). */
  readonly refund: Materials;
  /** Cuántos tiles cambian (0: nada para confirmar). */
  readonly changes: number;
}

function addTo(total: Record<string, number>, materials: Materials, times = 1): void {
  for (const [kind, amount] of Object.entries(materials))
    total[kind] = (total[kind] ?? 0) + (amount ?? 0) * times;
}

/** Lo que cuesta pasar de un diseño a otro. */
export function designCost(kind: HouseKind, before: HouseDesign, after: HouseDesign): DesignCost {
  const side = lotSide(kind);
  const a = new Grid(before, side);
  const b = new Grid(after, side);
  let gold = 0;
  let changes = 0;
  const materials: Record<string, number> = {};
  const removed: Record<string, number> = {};
  const levels = Math.max(before.levels.length, after.levels.length);
  for (let l = 0; l < levels; l++)
    for (let y = 0; y < side; y++)
      for (let x = 0; x < side; x++) {
        const was = a.cell(l, x, y);
        const now = b.cell(l, x, y);
        if (was.floor !== now.floor) {
          changes++;
          if (now.floor) {
            gold += HOUSE_FLOORS[now.floor].gold;
            addTo(materials, HOUSE_FLOORS[now.floor].materials);
          }
          if (was.floor) addTo(removed, HOUSE_FLOORS[was.floor].materials);
        }
        if (was.piece !== now.piece) {
          changes++;
          if (now.piece) {
            gold += HOUSE_PIECES[now.piece].gold;
            addTo(materials, HOUSE_PIECES[now.piece].materials);
          }
          if (was.piece) addTo(removed, HOUSE_PIECES[was.piece].materials);
        }
      }
  // El techo se rehace solo: se paga lo que se agrega y vuelve la mitad de lo que se saca.
  const oldRoof = new Set(roofTiles(a, topOf(a)).map((p) => `${topOf(a)},${p.x},${p.y}`));
  const newRoof = new Set(roofTiles(b, topOf(b)).map((p) => `${topOf(b)},${p.x},${p.y}`));
  const sameKind = before.roof === after.roof;
  for (const key of newRoof)
    if (!sameKind || !oldRoof.has(key)) {
      gold += HOUSE_ROOFS[after.roof].gold;
      addTo(materials, HOUSE_ROOFS[after.roof].materials);
    }
  for (const key of oldRoof)
    if (!sameKind || !newRoof.has(key)) addTo(removed, HOUSE_ROOFS[before.roof].materials);
  if (!sameKind && (oldRoof.size > 0 || newRoof.size > 0)) changes++;
  const refund: Record<string, number> = {};
  for (const [k, amount] of Object.entries(removed)) {
    const half = Math.floor(amount / 2);
    if (half > 0) refund[k] = half;
  }
  return { gold, materials: materials as Materials, refund: refund as Materials, changes };
}

function topOf(grid: Grid): number {
  for (let l = grid.design.levels.length - 1; l > 0; l--) if (grid.levelUsed(l)) return l;
  return 0;
}

/** ¿El tile de esa planta tiene piso? (adentro de la casa, para las puertas). */
export function designFloorAt(
  kind: HouseKind,
  design: HouseDesign,
  level: number,
  p: Position,
): boolean {
  return designCell(design, level, p.x, p.y, lotSide(kind)).floor !== null;
}
