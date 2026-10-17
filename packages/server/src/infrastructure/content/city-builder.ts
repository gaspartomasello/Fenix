import {
  DOORS,
  STATICS,
  TERRAINS,
  Terrain,
  type CreatureKind,
  type ItemKind,
  type NpcRole,
  type Position,
  type RegionData,
  type StaticKind,
  type StaticPlacement,
} from '@fenix/shared';
import { SeededRandom } from '../system/seeded-random';
import type { MapRegion, PlacedItem } from './tiled-map-loader';

/** Lo que es parte de una construcción: no se saca para abrir paso. */
const STRUCTURE =
  /wall|rampart|palisade|fence|tower|door|post|corner|window|mountain|crypt|fountain|ladder/;
/** Paredes de casa (a lo largo de x o de y), donde se puede abrir una puerta. */
const HOUSE_WALL = /^(wall|log-wall|plank-wall|basalt-wall)-(x|y)$/;

/**
 * Ciudades generadas: cada una con su estilo según la región.
 * - `capital`: muralla de piedra con torres, castillo, plaza con fuente y mercado.
 * - `mountain`: cabañas de troncos dentro de una empalizada (Roca Alta).
 * - `swamp`: casas de tablas y calles de pasarelas de madera, con una cerca baja (Junco Verde).
 * - `volcanic`: piedra negra y braseros, con muralla y torres (Puerto Brasa).
 * - `bandit`: carpas y chozas dentro de una empalizada, sin ley (el refugio de los bandidos).
 * Todas tienen afuera de la muralla un cementerio con no-muertos.
 */
export type CityStyle = 'capital' | 'mountain' | 'swamp' | 'volcanic' | 'bandit';

export interface CitySpec {
  readonly name: string;
  readonly style: CityStyle;
  readonly seed: number;
  /** Grande (la capital de un mapa grande), mediana o chica. */
  readonly size: 'large' | 'medium' | 'small';
  /** Nombres propios de la gente (si no, los de siempre de cada oficio). */
  readonly people?: Partial<Record<NpcRole, string>>;
  /** Objetos sueltos para los recién llegados (la capital). */
  readonly starterItems?: boolean;
}

/** Una ciudad armada: el plano, más las criaturas que viven en ella (el cementerio). */
export interface City extends MapRegion {
  readonly lairs: readonly { readonly kind: CreatureKind; readonly position: Position }[];
  /** Un tile libre de la plaza (desde donde se llega caminando a todo). */
  readonly square: Position;
}

interface WallKit {
  readonly x: StaticKind;
  readonly y: StaticKind;
  readonly corner: StaticKind;
  readonly post: StaticKind;
  /** La misma pared con una ventana (las casas). */
  readonly windowX?: StaticKind;
  readonly windowY?: StaticKind;
}

interface Style {
  readonly walls: WallKit;
  readonly floor: Terrain;
  readonly street: Terrain;
  readonly avenue: Terrain;
  readonly plaza: Terrain;
  /** La muralla: de piedra con torres, empalizada, cerca baja o nada. */
  readonly ring: 'rampart' | 'palisade' | 'fence';
  readonly towers: boolean;
  readonly trees: readonly StaticKind[];
  readonly light: StaticKind;
  readonly castle: boolean;
  readonly lawless: boolean;
  /** Un río cruza la ciudad de oeste a este, con puentes (la capital). */
  readonly river: boolean;
}

const STONE: WallKit = {
  x: 'wall-x',
  y: 'wall-y',
  corner: 'wall-corner',
  post: 'wall-post',
  windowX: 'wall-window-x',
  windowY: 'wall-window-y',
};
const LOGS: WallKit = {
  x: 'log-wall-x',
  y: 'log-wall-y',
  corner: 'log-wall-corner',
  post: 'log-wall-post',
  windowX: 'log-window-x',
  windowY: 'log-window-y',
};
const PLANKS: WallKit = {
  x: 'plank-wall-x',
  y: 'plank-wall-y',
  corner: 'plank-wall-corner',
  post: 'plank-wall-post',
  windowX: 'plank-window-x',
  windowY: 'plank-window-y',
};
const BASALT: WallKit = {
  x: 'basalt-wall-x',
  y: 'basalt-wall-y',
  corner: 'basalt-wall-corner',
  post: 'basalt-wall-post',
  windowX: 'basalt-window-x',
  windowY: 'basalt-window-y',
};
const RAMPART: WallKit = {
  x: 'rampart-x',
  y: 'rampart-y',
  corner: 'rampart-corner',
  post: 'rampart-post',
};
const PALISADE: WallKit = {
  x: 'palisade-x',
  y: 'palisade-y',
  corner: 'palisade-post',
  post: 'palisade-post',
};
const FENCE: WallKit = { x: 'fence-x', y: 'fence-y', corner: 'fence-x', post: 'fence-y' };

const STYLES: Readonly<Record<CityStyle, Style>> = {
  capital: {
    walls: STONE,
    floor: Terrain.Wood,
    street: Terrain.Flagstone,
    avenue: Terrain.Stone,
    plaza: Terrain.StoneTiles,
    ring: 'rampart',
    towers: true,
    trees: ['oak', 'maple', 'poplar'],
    light: 'lamp',
    castle: true,
    lawless: false,
    river: true,
  },
  mountain: {
    walls: LOGS,
    floor: Terrain.Wood,
    street: Terrain.Gravel,
    avenue: Terrain.Stone,
    plaza: Terrain.Granite,
    ring: 'palisade',
    towers: false,
    trees: ['pine', 'birch', 'pine'],
    light: 'lamp',
    castle: false,
    lawless: false,
    river: false,
  },
  swamp: {
    walls: PLANKS,
    floor: Terrain.Wood,
    street: Terrain.Wood,
    avenue: Terrain.Wood,
    plaza: Terrain.Wood,
    ring: 'fence',
    towers: false,
    trees: ['willow', 'gomero', 'ceibo'],
    light: 'lamp',
    castle: false,
    lawless: false,
    river: false,
  },
  volcanic: {
    walls: BASALT,
    floor: Terrain.StoneTiles,
    street: Terrain.Gravel,
    avenue: Terrain.Flagstone,
    plaza: Terrain.MarbleDark,
    ring: 'rampart',
    towers: true,
    trees: ['dead-tree'],
    light: 'brazier',
    castle: false,
    lawless: false,
    river: false,
  },
  bandit: {
    walls: PALISADE,
    floor: Terrain.Dirt,
    street: Terrain.Dirt,
    avenue: Terrain.Dirt,
    plaza: Terrain.Dirt,
    ring: 'palisade',
    towers: false,
    trees: ['oak', 'pine'],
    light: 'campfire',
    castle: false,
    lawless: true,
    river: false,
  },
};

/** Medidas: el área de adentro de la muralla y lo que queda afuera (este y sur, para el cementerio). */
const SIZES = {
  large: { inner: [88, 78], near: 5, far: 18 },
  medium: { inner: [36, 30], near: 3, far: 13 },
  small: { inner: [26, 24], near: 3, far: 11 },
} as const;

/** Quién vive en el cementerio según el tamaño de la ciudad. */
const GRAVEYARD: Readonly<Record<'large' | 'medium' | 'small', readonly CreatureKind[]>> = {
  large: ['zombie', 'zombie', 'zombie', 'ghoul', 'ghoul', 'skeleton', 'skeleton', 'wraith'],
  medium: ['zombie', 'zombie', 'ghoul', 'skeleton', 'wraith'],
  small: ['zombie', 'skeleton', 'ghoul'],
};

/** Lo que los recién llegados encuentran en el depósito de la capital. */
const STARTER_ITEMS: readonly [ItemKind, number][] = [
  ['short-sword', 1],
  ['wooden-shield', 1],
  ['leather-cap', 1],
  ['trousers', 1],
  ['boots', 1],
  ['cloak', 1],
  ['healing-potion', 3],
  ['apple', 6],
  ['axe', 1],
  ['leather-armor', 1],
  ['gold', 35],
];

interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Un lienzo donde se dibuja la ciudad tile por tile. */
class Plan {
  readonly terrain: (Terrain | null)[];
  readonly statics = new Map<number, StaticKind>();
  readonly npcs: { role: NpcRole; position: Position; name?: string }[] = [];
  readonly items: PlacedItem[] = [];
  readonly lairs: { kind: CreatureKind; position: Position }[] = [];
  /** Objetos que van encima de otro en el mismo tile (una biblioteca contra la pared). */
  readonly decor: StaticPlacement[] = [];
  /** Por dónde entra y sale el río del plano (el continente lo sigue afuera). */
  readonly rivers: { x: number; y: number; flow: 'in' | 'out' }[] = [];
  /** Tiles que ya tienen algo construido (no se pisan con otra cosa). */
  readonly used = new Set<number>();
  /** Tiles tapados por un objeto de 2 × 2 que está en el tile de al lado. */
  private readonly covered = new Set<number>();

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.terrain = new Array<Terrain | null>(width * height).fill(null);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  ground(x: number, y: number, terrain: Terrain): void {
    if (this.inside(x, y)) this.terrain[y * this.width + x] = terrain;
  }

  fill(r: Rect, terrain: Terrain): void {
    for (let y = r.y0; y <= r.y1; y++)
      for (let x = r.x0; x <= r.x1; x++) this.ground(x, y, terrain);
  }

  put(x: number, y: number, kind: StaticKind): void {
    if (this.inside(x, y)) this.statics.set(y * this.width + x, kind);
  }

  clear(x: number, y: number): void {
    this.statics.delete(y * this.width + x);
  }

  isFree(x: number, y: number): boolean {
    const i = y * this.width + x;
    return this.inside(x, y) && !this.statics.has(i) && !this.covered.has(i);
  }

  claim(r: Rect): void {
    for (let y = r.y0; y <= r.y1; y++)
      for (let x = r.x0; x <= r.x1; x++) this.used.add(y * this.width + x);
  }

  /**
   * La parte más grande de `r` que no está ocupada (una cuadra pegada a la
   * plaza se achica en vez de perderse). Null si queda muy chica para una casa.
   */
  freePart(r: Rect): Rect | null {
    if (!this.claimed(r)) return r;
    let best: Rect | null = null;
    const area = (q: Rect): number => (q.x1 - q.x0 + 1) * (q.y1 - q.y0 + 1);
    for (let x0 = r.x0; x0 <= r.x1; x0++)
      for (const x1 of [r.x1, ...range(x0 + 4, r.x1)])
        for (let y0 = r.y0; y0 <= r.y1; y0++)
          for (const y1 of [r.y1, ...range(y0 + 4, r.y1)]) {
            if (x1 - x0 < 4 || y1 - y0 < 4) continue;
            const q = { x0, y0, x1, y1 };
            if (best && area(q) <= area(best)) continue;
            if (!this.claimed(q)) best = q;
          }
    return best;
  }

  claimed(r: Rect): boolean {
    for (let y = r.y0; y <= r.y1; y++)
      for (let x = r.x0; x <= r.x1; x++) if (this.used.has(y * this.width + x)) return true;
    return false;
  }

  /**
   * Un recinto con paredes en el borde de atrás de cada tile (como los
   * pueblos de Tiled): la esquina arriba a la izquierda, paredes a lo largo
   * de x arriba y abajo, a lo largo de y a los costados, y un poste abajo a
   * la derecha. `r` es el piso de adentro; las paredes del este y del sur
   * quedan en la fila y la columna de afuera.
   */
  enclose(r: Rect, kit: WallKit, gaps: readonly Position[] = []): void {
    const open = (x: number, y: number): boolean => gaps.some((g) => g.x === x && g.y === y);
    const wall = (x: number, y: number, kind: StaticKind): void => {
      if (!open(x, y)) this.put(x, y, kind);
    };
    wall(r.x0, r.y0, kit.corner);
    for (let x = r.x0 + 1; x <= r.x1; x++) wall(x, r.y0, kit.x);
    for (let y = r.y0 + 1; y <= r.y1; y++) wall(r.x0, y, kit.y);
    for (let y = r.y0; y <= r.y1; y++) wall(r.x1 + 1, y, kit.y);
    for (let x = r.x0; x <= r.x1; x++) wall(x, r.y1 + 1, kit.x);
    wall(r.x1 + 1, r.y1 + 1, kit.post);
  }

  /** Una puerta en el hueco de una pared: a lo largo de x (arriba o abajo) o de y (a los costados). */
  door(at: Position, along: 'x' | 'y'): void {
    this.put(at.x, at.y, along === 'x' ? 'door-x' : 'door-y');
  }

  /**
   * Una puerta doble de dos hojas: `at` y el tile siguiente a lo largo del
   * eje. Se abren de par en par, con las bisagras en el marco de afuera.
   */
  doubleDoor(
    at: Position,
    along: 'x' | 'y',
    style: 'door' | 'iron-door' | 'dungeon-door' | 'bone-door' = 'door',
  ): void {
    const next = along === 'x' ? { x: at.x + 1, y: at.y } : { x: at.x, y: at.y + 1 };
    this.put(at.x, at.y, `${style}-${along}-l`);
    this.put(next.x, next.y, `${style}-${along}-r`);
  }

  /**
   * Ventanas en las paredes de afuera de una casa (la del sur y la del este,
   * que se ven desde la calle), cada tres tiles y lejos de la puerta.
   */
  windows(r: Rect, kit: WallKit, door: Position): void {
    if (!kit.windowX || !kit.windowY) return;
    const far = (x: number, y: number): boolean => Math.abs(x - door.x) + Math.abs(y - door.y) > 1;
    for (let x = r.x0 + 1; x < r.x1; x += 3)
      if (far(x, r.y1 + 1) && this.statics.get((r.y1 + 1) * this.width + x) === kit.x)
        this.put(x, r.y1 + 1, kit.windowX);
    for (let y = r.y0 + 1; y < r.y1; y += 3)
      if (far(r.x1 + 1, y) && this.statics.get(y * this.width + r.x1 + 1) === kit.y)
        this.put(r.x1 + 1, y, kit.windowY);
  }

  /** Un objeto de 2 × 2 (torre, cripta, fuente): saca lo que haya debajo. */
  big(x: number, y: number, kind: StaticKind): void {
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      this.clear(x + dx, y + dy);
      if (dx || dy) this.covered.add((y + dy) * this.width + x + dx);
    }
    this.put(x, y, kind);
  }

  /** Un objeto pegado a la pared, en el mismo tile que la pared. */
  onWall(x: number, y: number, kind: StaticKind): void {
    if (this.inside(x, y)) this.decor.push({ x, y, kind });
  }

  /**
   * Revisa que desde `from` se llegue caminando (con las puertas abiertas) a
   * todo el suelo libre y que cada puerta tenga paso de los dos lados, y
   * arregla lo que tape el paso: un mueble o adorno que cierra un rincón se
   * saca; un cuarto cerrado por una pared de casa recibe una puerta; y un
   * hueco chico que quedó encerrado (entre una torre y el río) se tapa.
   */
  repair(from: Position): void {
    const { width } = this;
    const walkable = (i: number): boolean => {
      const x = i % width;
      const y = Math.floor(i / width);
      if (!this.inside(x, y) || this.covered.has(i)) return false;
      if (!TERRAINS[this.terrain[i] ?? Terrain.Grass].walkable) return false;
      const kind = this.statics.get(i);
      return !kind || !STATICS[kind].blocking || DOORS[kind] !== undefined;
    };
    const removable = (i: number): boolean => {
      const kind = this.statics.get(i);
      return (
        kind !== undefined &&
        STATICS[kind].blocking &&
        STATICS[kind].footprint === 1 &&
        !STRUCTURE.test(kind)
      );
    };
    const neighbors = (i: number): number[] => {
      const x = i % width;
      return [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width].filter(
        (n) => n >= 0 && n < this.terrain.length,
      );
    };
    const flood = (start: number): Set<number> => {
      const seen = new Set([start]);
      const queue = [start];
      for (let c = queue.pop(); c !== undefined; c = queue.pop())
        for (const n of neighbors(c))
          if (!seen.has(n) && walkable(n)) {
            seen.add(n);
            queue.push(n);
          }
      return seen;
    };

    // Delante y detrás de cada puerta, nada que tape.
    for (const [i, kind] of this.statics) {
      if (!DOORS[kind]) continue;
      const across = /-x(-|$)/.test(kind) ? [i - width, i + width] : [i - 1, i + 1];
      for (const n of across) if (removable(n)) this.statics.delete(n);
    }

    const start = from.y * width + from.x;
    const given = new Set<number>();
    for (let round = 0; round < 400; round++) {
      const reached = flood(start);
      let lost = -1;
      for (let i = 0; i < this.terrain.length && lost < 0; i++)
        if (!given.has(i) && !reached.has(i) && walkable(i)) lost = i;
      if (lost < 0) return;
      const pocket = flood(lost);
      const touches = (i: number, set: Set<number>): boolean =>
        neighbors(i).some((n) => set.has(n));
      const edge = [...pocket].flatMap(neighbors).filter((n) => !pocket.has(n));
      // Un mueble entre el rincón y el resto: se saca.
      const furniture = edge.find((n) => removable(n) && touches(n, reached));
      if (furniture !== undefined) {
        this.statics.delete(furniture);
        continue;
      }
      // Una pared de casa entre un cuarto y la calle: se le abre una puerta.
      const wall = edge.find((n) => {
        const kind = this.statics.get(n);
        if (!kind || !HOUSE_WALL.test(kind)) return false;
        const pair = kind.endsWith('-x') ? [n - width, n + width] : [n - 1, n + 1];
        const [a = -1, b = -1] = pair;
        return (pocket.has(a) && reached.has(b)) || (pocket.has(b) && reached.has(a));
      });
      if (wall !== undefined) {
        const kind = this.statics.get(wall) ?? '';
        this.statics.set(wall, kind.endsWith('-x') ? 'door-x' : 'door-y');
        continue;
      }
      // Un mueble que lleva a otro mueble: se saca y se vuelve a mirar.
      const inner = edge.find((n) => removable(n));
      if (inner !== undefined) {
        this.statics.delete(inner);
        continue;
      }
      // Un hueco chico encerrado: junto al agua se hace agua; si no, una roca.
      for (const i of pocket) {
        given.add(i);
        if (pocket.size > 12) continue;
        const wet = neighbors(i).some((n) => this.terrain[n] === Terrain.Water);
        if (wet) this.terrain[i] = Terrain.Water;
        else this.statics.set(i, 'rock');
      }
    }
  }

  toCity(regions: RegionData[], spawn: Position | null, square: Position): City {
    this.repair(square);
    const statics: StaticPlacement[] = [];
    for (const [i, kind] of this.statics)
      statics.push({ x: i % this.width, y: Math.floor(i / this.width), kind });
    statics.push(...this.decor);
    return {
      width: this.width,
      height: this.height,
      terrain: this.terrain,
      statics,
      regions,
      spawn,
      square,
      items: this.items,
      npcs: this.npcs,
      lairs: this.lairs,
      rivers: this.rivers,
    };
  }
}

/** Arma una ciudad. Siempre deja un camino al medio de cada lado (ahí llegan los caminos). */
export function buildCity(spec: CitySpec): City {
  const style = STYLES[spec.style];
  const size = SIZES[spec.size];
  const random = new SeededRandom(spec.seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random.next() * list.length)] as T;
  const [innerW, innerH] = size.inner;
  const width = size.near + innerW + size.far;
  const height = size.near + innerH + size.far;
  const plan = new Plan(width, height);
  // Adentro de la muralla (el piso; la muralla del este y del sur queda en la fila de afuera).
  const inner: Rect = {
    x0: size.near,
    y0: size.near,
    x1: size.near + innerW - 1,
    y1: size.near + innerH - 1,
  };
  // Los caminos llegan al medio de cada lado del plano.
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);

  // ── Calles: dos avenidas que se cruzan en la plaza ──
  plan.fill({ x0: cx - 1, y0: 0, x1: cx + 1, y1: height - 1 }, style.avenue);
  plan.fill({ x0: 0, y0: cy - 1, x1: width - 1, y1: cy + 1 }, style.avenue);
  const plazaR = spec.size === 'large' ? 7 : spec.size === 'medium' ? 4 : 3;
  const plaza: Rect = { x0: cx - plazaR, y0: cy - plazaR, x1: cx + plazaR, y1: cy + plazaR };
  // La plaza, redonda.
  for (let y = plaza.y0 - 1; y <= plaza.y1 + 1; y++)
    for (let x = plaza.x0 - 1; x <= plaza.x1 + 1; x++)
      if (Math.hypot(x - cx, y - cy) <= plazaR + 1.2) plan.ground(x, y, style.plaza);
  plan.claim({ x0: plaza.x0 - 1, y0: plaza.y0 - 1, x1: plaza.x1 + 1, y1: plaza.y1 + 1 });
  plan.claim({ x0: cx - 2, y0: 0, x1: cx + 2, y1: height - 1 });
  plan.claim({ x0: 0, y0: cy - 2, x1: width - 1, y1: cy + 2 });

  // ── El río (la capital): cruza de oeste a este entre el castillo y la plaza ──
  const river = style.river ? buildRiver(plan, style, inner, cx, random) : null;

  // ── La muralla con sus puertas (y torres, en las de piedra) ──
  // Las esquinas se cortan en diagonal, cada una distinta: la ciudad no es un
  // cuadrado. La del castillo queda entera (necesita su rincón).
  const cutMax = Math.floor(Math.min(innerW, innerH) / 4);
  const cut = (limit: number): number =>
    Math.max(0, Math.min(limit, Math.floor(cutMax * (0.35 + random.next() * 0.65))));
  const northLimit = river ? river.top - 4 - inner.y0 : cutMax;
  const southLimit = river ? inner.y1 - river.bottom - 4 : cutMax;
  const corners: Corners = {
    nw: cut(northLimit),
    ne: style.castle ? 0 : cut(northLimit),
    sw: cut(southLimit),
    se: cut(southLimit),
  };
  buildRing(plan, style, inner, cx, cy, river, corners);

  // ── La plaza: fuente (o fogata), santuario, puestos del mercado y faroles ──
  if (style.lawless) plan.put(cx, cy, 'campfire');
  else plan.big(cx - 1, cy - 1, 'fountain');
  plan.put(cx + 3, cy - 3, 'shrine');
  if (!style.lawless && spec.size !== 'small') {
    const stalls: [number, number][] =
      spec.size === 'large'
        ? [
            [-5, -5],
            [-2, -5],
            [3, -5],
            [5, 4],
            [-5, 5],
            [-2, 5],
            [-5, 2],
            [5, -2],
            [5, 1],
          ]
        : [
            [-4, -4],
            [-1, -4],
            [3, 4],
            [-4, 4],
            [-4, 1],
            [4, -1],
          ];
    for (const [dx, dy] of stalls) plan.put(cx + dx, cy + dy, 'stall');
    plan.put(cx - plazaR, cy - plazaR, 'banner');
    plan.put(cx + plazaR, cy + plazaR, 'banner');
    // Bancos para sentarse alrededor de la fuente.
    plan.put(cx - 1, cy + 2, 'bench-x');
    plan.put(cx + 2, cy - 1, 'bench-y');
  }
  for (const [dx, dy] of [
    [-plazaR, plazaR],
    [plazaR, -plazaR],
  ] as const)
    plan.put(cx + dx, cy + dy, style.light);
  const spawn = { x: cx, y: cy + 3 };

  // ── Barrios: cuadras entre calles, con las casas del estilo de la región ──
  const north = river ? river.top - 3 : cy - 3;
  const quadrants: Rect[] = [
    { x0: inner.x0 + 1, y0: inner.y0 + 1, x1: cx - 3, y1: north },
    { x0: cx + 3, y0: inner.y0 + 1, x1: inner.x1, y1: north },
    { x0: inner.x0 + 1, y0: cy + 3, x1: cx - 3, y1: inner.y1 },
    { x0: cx + 3, y0: cy + 3, x1: inner.x1, y1: inner.y1 },
  ];
  // Con río, entre el río y la plaza queda otra franja de cuadras.
  if (river)
    quadrants.push(
      { x0: inner.x0 + 1, y0: river.bottom + 3, x1: cx - 3, y1: cy - 3 },
      { x0: cx + 3, y0: river.bottom + 3, x1: inner.x1, y1: cy - 3 },
    );
  // El castillo ocupa el barrio del noreste, si entra con su salón del trono.
  const northeast = quadrants[1];
  const castleRect = northeast && { ...northeast, y1: Math.min(northeast.y1, plaza.y0 - 2) };
  const castleQuadrant =
    style.castle &&
    castleRect &&
    castleRect.x1 - castleRect.x0 >= 20 &&
    castleRect.y1 - castleRect.y0 >= 13
      ? northeast
      : undefined;
  const regions: RegionData[] = [];
  if (castleQuadrant && castleRect)
    regions.push(buildCastle(plan, style, castleRect, spec.name, cx));
  const lots = quadrants
    .filter((q) => q !== castleQuadrant)
    // Cuadras de distinto tamaño en cada barrio.
    .flatMap((q) =>
      blocks(
        plan,
        style,
        q,
        (spec.size === 'large' ? 11 : spec.size === 'small' ? 8 : 10) +
          Math.floor(random.next() * 4) -
          1,
      ),
    );
  // Los negocios van en las cuadras más cerca de la plaza.
  lots.sort(
    (a, b) => distance(center(a), { x: cx, y: cy }) - distance(center(b), { x: cx, y: cy }),
  );
  const shops: NpcRole[] = style.lawless
    ? ['innkeeper', 'blacksmith']
    : spec.size === 'large'
      ? ['innkeeper', 'banker', 'blacksmith', 'mage', 'carpenter']
      : ['innkeeper', 'banker', 'blacksmith', 'mage'];
  const houses: Room[] = [];
  for (const lot of lots) {
    const house = building(plan, style, lot, cx, cy, random);
    if (house) houses.push(house);
  }
  // Los negocios, en las casas más amplias cerca de la plaza.
  const roomy = (r: Room): boolean => r.x1 - r.x0 >= 4 && r.y1 - r.y0 >= 3;
  const shopRooms: Room[] = [];
  for (const role of shops) {
    const room =
      houses.find((h) => roomy(h) && !shopRooms.includes(h)) ??
      houses.find((h) => !shopRooms.includes(h));
    if (!room) break;
    shopRooms.push(room);
    const spot = furnishShop(plan, role, room, random);
    // El banco tiene puerta de hierro.
    if (role === 'banker' && plan.statics.get(room.door.y * plan.width + room.door.x) === 'door-x')
      plan.put(room.door.x, room.door.y, 'iron-door-x');
    if (role === 'banker' && plan.statics.get(room.door.y * plan.width + room.door.x) === 'door-y')
      plan.put(room.door.x, room.door.y, 'iron-door-y');
    plan.npcs.push({ role, position: spot, ...named(spec, role) });
  }
  const homes = houses.filter((h) => !shopRooms.includes(h));
  // El depósito de los recién llegados, en la primera casa que queda.
  const depot = homes[0];
  if (spec.starterItems && depot) {
    STARTER_ITEMS.forEach(([kind, amount], i) => {
      const x = depot.x0 + (i % Math.max(1, depot.x1 - depot.x0 + 1));
      const y = depot.y0 + Math.floor(i / Math.max(1, depot.x1 - depot.x0 + 1));
      if (y <= depot.y1) {
        plan.clear(x, y);
        plan.items.push({ kind, amount, position: { x, y } });
      }
    });
  }
  for (const home of homes.slice(spec.starterItems ? 1 : 0)) furnishHome(plan, home, random, style);
  // Faroles a lo largo de las avenidas (en el refugio, solo las fogatas de las carpas).
  for (let t = 4; !style.lawless && t < Math.max(width, height); t += 7) {
    for (const [x, y] of [
      [cx - 2, t],
      [cx + 2, t + 3],
      [t, cy - 2],
      [t + 3, cy + 2],
    ] as const)
      if (
        inRect(inner, x, y) &&
        !inRect(plaza, x, y) &&
        plan.isFree(x, y) &&
        plan.terrain[y * width + x] !== Terrain.Water &&
        !onStreet(plan, x, y, style)
      )
        plan.put(x, y, style.light);
  }

  // ── Afuera: la caballeriza, el leñador, huertas, árboles y el cementerio ──
  const outskirts = { x0: inner.x1 + 3, y0: inner.y1 + 3, x1: width - 2, y1: height - 2 };
  const graveyard: Rect = {
    x0: Math.max(cx + 4, outskirts.x0),
    y0: Math.max(cy + 4, outskirts.y0),
    x1: outskirts.x1,
    y1: outskirts.y1,
  };
  regions.push(buildGraveyard(plan, graveyard, spec, random));
  if (!style.lawless) {
    buildStable(
      plan,
      style,
      { x0: inner.x0, y0: inner.y1 + 3, x1: cx - 4, y1: height - 2 },
      spec,
      random,
    );
    const eastBand = { x0: inner.x1 + 3, x1: width - 2 };
    const yardTop = river ? river.bottom + 3 : cy - 16;
    buildWoodcutter(plan, style, { ...eastBand, y0: yardTop, y1: cy - 3 }, spec, random);
    buildFields(
      plan,
      style,
      { ...eastBand, y0: inner.y0, y1: (river ? river.top : cy - 14) - 3 },
      random,
    );
  }
  // Árboles sueltos en lo que quedó libre de afuera.
  for (let i = 0; i < width * height * 0.01; i++) {
    const x = Math.floor(random.next() * width);
    const y = Math.floor(random.next() * height);
    if (inRect({ x0: inner.x0 - 1, y0: inner.y0 - 1, x1: inner.x1 + 2, y1: inner.y1 + 2 }, x, y))
      continue;
    if (plan.used.has(y * width + x) || !plan.isFree(x, y) || plan.terrain[y * width + x] !== null)
      continue;
    plan.put(x, y, pick(style.trees));
  }

  // La zona protegida (o sin ley) es lo de adentro de la muralla.
  regions.push({
    name: spec.name,
    x: inner.x0 - 1,
    y: inner.y0 - 1,
    width: innerW + 3,
    height: innerH + 3,
    ...(style.lawless ? { wild: true } : {}),
  });
  return plan.toCity(regions, spec.style === 'capital' || spec.starterItems ? spawn : null, spawn);
}

/** El río de la capital: filas de agua honda con muelles de piedra y puentes. */
interface River {
  readonly top: number;
  readonly bottom: number;
}

/**
 * Un río hondo (no se vadea) que cruza todo el plano de oeste a este, con
 * muelles de piedra adentro de la muralla y tres puentes: uno ancho sobre la
 * avenida y dos de tablones sobre calles laterales.
 */
function buildRiver(
  plan: Plan,
  style: Style,
  inner: Rect,
  cx: number,
  random: SeededRandom,
): River {
  const top = inner.y0 + Math.round((inner.y1 - inner.y0) * 0.3);
  const bottom = top + 3;
  for (let x = 0; x < plan.width; x++) {
    // El cauce serpentea apenas afuera de la muralla.
    const wiggle = x < inner.x0 - 1 || x > inner.x1 + 2 ? Math.round(Math.sin(x * 0.35) * 1.2) : 0;
    for (let y = top + wiggle; y <= bottom + wiggle; y++) plan.ground(x, y, Terrain.Water);
    const walled = x >= inner.x0 && x <= inner.x1;
    if (walled) {
      plan.ground(x, top - 1, Terrain.Stone);
      plan.ground(x, bottom + 1, Terrain.Stone);
    } else {
      plan.ground(x, top - 1 + wiggle, Terrain.Sand);
      plan.ground(x, bottom + 1 + wiggle, Terrain.Sand);
    }
  }
  plan.claim({ x0: 0, y0: top - 2, x1: plan.width - 1, y1: bottom + 2 });
  plan.rivers.push(
    { x: 0, y: top + 1, flow: 'in' },
    { x: plan.width - 1, y: top + 1, flow: 'out' },
  );
  // Puentes: el de la avenida, ancho y con baranda, y dos laterales.
  const bridge = (x0: number, x1: number): void => {
    for (let y = top - 1; y <= bottom + 1; y++) {
      for (let x = x0; x <= x1; x++) plan.ground(x, y, Terrain.Wood);
      if (y >= top && y <= bottom) {
        plan.put(x0, y, 'fence-y');
        plan.put(x1 + 1, y, 'fence-y');
      }
    }
  };
  bridge(cx - 2, cx + 2);
  const span = inner.x1 - inner.x0;
  for (const bx of [inner.x0 + Math.round(span * 0.18), inner.x0 + Math.round(span * 0.82)]) {
    bridge(bx - 2, bx + 1);
    // Una calle que baja y sube del puente, para que no la tapen las casas.
    plan.fill({ x0: bx - 1, y0: inner.y0 + 1, x1: bx, y1: inner.y1 }, style.street);
    plan.claim({ x0: bx - 2, y0: inner.y0 + 1, x1: bx + 1, y1: inner.y1 });
  }
  // Faroles en las puntas del puente grande.
  for (const y of [top - 2, bottom + 2]) {
    plan.put(cx - 3, y, style.light);
    plan.put(cx + 3, y, style.light);
  }
  void random;
  return { top, bottom };
}

/** La muralla: piedra con torres, empalizada o cerca, con puertas al medio de cada lado. */
/** Cuánto se corta en diagonal cada esquina de la muralla (0: esquina entera). */
interface Corners {
  readonly nw: number;
  readonly ne: number;
  readonly sw: number;
  readonly se: number;
}

/**
 * La muralla sigue el contorno de la ciudad: un rectángulo con las esquinas
 * cortadas en diagonal (en escalones, como las murallas de UO). Lo que queda
 * afuera del corte no se construye.
 */
function buildRing(
  plan: Plan,
  style: Style,
  inner: Rect,
  cx: number,
  cy: number,
  river: River | null,
  corners: Corners,
): void {
  const kit = style.ring === 'rampart' ? RAMPART : style.ring === 'palisade' ? PALISADE : FENCE;
  const right = inner.x1 + 1;
  const bottom = inner.y1 + 1;
  const within = (x: number, y: number): boolean =>
    x >= inner.x0 &&
    y >= inner.y0 &&
    x <= right &&
    y <= bottom &&
    x - inner.x0 + (y - inner.y0) >= corners.nw &&
    right - x + (y - inner.y0) >= corners.ne &&
    x - inner.x0 + (bottom - y) >= corners.sw &&
    right - x + (bottom - y) >= corners.se;
  const isWall = (x: number, y: number): boolean => {
    if (!within(x, y)) return false;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (!within(x + dx, y + dy)) return true;
    return false;
  };
  const gate = (x: number, y: number): boolean =>
    (Math.abs(x - cx) <= 1 && (y === inner.y0 || y === bottom)) ||
    (Math.abs(y - cy) <= 1 && (x === inner.x0 || x === right)) ||
    (river !== null && y >= river.top && y <= river.bottom && (x === inner.x0 || x === right));
  for (let y = inner.y0; y <= bottom; y++)
    for (let x = inner.x0; x <= right; x++) {
      if (!within(x, y)) {
        // Afuera del corte: no se construye ahí.
        plan.claim({ x0: x, y0: y, x1: x, y1: y });
        continue;
      }
      if (!isWall(x, y)) continue;
      plan.claim({ x0: x, y0: y, x1: x, y1: y });
      if (gate(x, y)) continue;
      const w = isWall(x - 1, y);
      const e = isWall(x + 1, y);
      const n = isWall(x, y - 1);
      const s = isWall(x, y + 1);
      let kind: StaticKind;
      if ((w || e) && (n || s)) {
        if (e && s) kind = kit.corner;
        else if (w && n) kind = kit.post;
        else if (e && n) kind = kit.x;
        else kind = kit.y;
      } else kind = n || s ? kit.y : kit.x;
      plan.clear(x, y);
      plan.put(x, y, kind);
    }
  if (!style.towers) return;
  // Torres a los lados de donde entra y sale el río.
  if (river)
    for (const x of [inner.x0 - 1, inner.x1 + 1]) {
      plan.big(x, river.top - 3, 'tower');
      plan.big(x, river.bottom + 2, 'tower');
    }
  // Torres en cada quiebre de la muralla y a los lados de cada puerta.
  const towers: Position[] = [
    { x: cx - 3, y: inner.y0 - 1 },
    { x: cx + 2, y: inner.y0 - 1 },
    { x: cx - 3, y: inner.y1 + 1 },
    { x: cx + 2, y: inner.y1 + 1 },
    { x: inner.x0 - 1, y: cy - 3 },
    { x: inner.x0 - 1, y: cy + 2 },
    { x: inner.x1 + 1, y: cy - 3 },
    { x: inner.x1 + 1, y: cy + 2 },
  ];
  const { nw, ne, sw, se } = corners;
  towers.push(
    { x: inner.x0 + nw - 1, y: inner.y0 - 1 },
    { x: inner.x0 - 1, y: inner.y0 + nw - 1 },
    { x: right - ne, y: inner.y0 - 1 },
    { x: right, y: inner.y0 + ne - 1 },
    { x: inner.x0 + sw - 1, y: bottom },
    { x: inner.x0 - 1, y: bottom - sw },
    { x: right - se, y: bottom },
    { x: right, y: bottom - se },
  );
  const seen = new Set<string>();
  for (const t of towers) {
    const key = `${t.x},${t.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    plan.big(t.x, t.y, 'tower');
  }
}

/**
 * El castillo de la capital: muralla propia con torres, patio empedrado con
 * pozo y jardín, el comedor (mesa larga con sillas, hogar y candelabros), la
 * barraca de la guardia (camas, armeros y maniquíes) y la torre del homenaje
 * con el salón del trono: alfombra roja hasta el trono, estandartes,
 * candelabros, armaduras en fila, la biblioteca y los cofres del tesoro. La
 * puerta mira a la avenida.
 */
function buildCastle(plan: Plan, style: Style, q: Rect, cityName: string, cx: number): RegionData {
  // Pegado a la muralla de la ciudad al norte y al este (sin un pasillo encerrado entre las dos).
  const walls: Rect = { x0: q.x0 + 1, y0: q.y0, x1: q.x1 - 1, y1: q.y1 - 2 };
  plan.claim({ x0: q.x0, y0: q.y0, x1: q.x1, y1: q.y1 });
  plan.fill(walls, Terrain.Flagstone);
  const gateY = Math.floor((walls.y0 + walls.y1) / 2);
  plan.enclose(
    walls,
    RAMPART,
    [-1, 0, 1].map((d) => ({ x: walls.x0, y: gateY + d })),
  );
  // Camino de la avenida a la puerta del castillo, y del portón a la torre del homenaje.
  plan.fill({ x0: cx + 2, y0: gateY - 1, x1: walls.x0, y1: gateY + 1 }, style.avenue);
  for (const t of [
    { x: walls.x0 - 1, y: walls.y0 - 1 },
    { x: walls.x1 + 1, y: walls.y0 - 1 },
    { x: walls.x0 - 1, y: walls.y1 + 1 },
    { x: walls.x1 + 1, y: walls.y1 + 1 },
    { x: walls.x0 - 1, y: gateY - 4 },
    { x: walls.x0 - 1, y: gateY + 3 },
  ])
    plan.big(t.x, t.y, 'tower');
  plan.put(walls.x0 + 1, gateY - 2, 'banner');
  plan.put(walls.x0 + 1, gateY + 2, 'banner');

  // La torre del homenaje, al fondo: el salón del trono.
  const keep: Rect = {
    x0: Math.floor((walls.x0 + walls.x1) / 2) + 1,
    y0: walls.y0 + 2,
    x1: walls.x1 - 2,
    y1: walls.y1 - 2,
  };
  plan.fill(keep, Terrain.MarbleDark);
  plan.enclose(keep, STONE, [
    { x: keep.x0, y: gateY },
    { x: keep.x0, y: gateY + 1 },
  ]);
  plan.doubleDoor({ x: keep.x0, y: gateY }, 'y', 'iron-door');
  plan.fill({ x0: walls.x0 + 2, y0: gateY, x1: keep.x0, y1: gateY + 1 }, Terrain.Flagstone);
  // Alfombra roja desde la puerta hasta el trono, entre candelabros y armaduras.
  for (let x = keep.x0 + 1; x <= keep.x1; x++) {
    plan.put(x, gateY, x === keep.x1 ? 'throne' : 'carpet');
    plan.put(x, gateY + 1, 'carpet');
    if ((x - keep.x0) % 3 === 1 && x < keep.x1 - 1) {
      plan.put(x, gateY - 2, 'armor-stand');
      plan.put(x, gateY + 3, 'armor-stand');
    }
    if ((x - keep.x0) % 3 === 2 && x < keep.x1 - 1) {
      plan.put(x, gateY - 1, 'candelabra');
      plan.put(x, gateY + 2, 'candelabra');
    }
  }
  plan.put(keep.x1, gateY - 2, 'banner');
  plan.put(keep.x1, gateY + 3, 'banner');
  plan.put(keep.x1 - 1, gateY - 1, 'chair-w');
  // La biblioteca del rey (pared del norte) y el tesoro (rincón del sur).
  for (let x = keep.x0 + 1; x <= keep.x1; x++) plan.onWall(x, keep.y0 - 1, 'bookshelf-x');
  plan.put(keep.x0 + 1, keep.y0, 'table');
  plan.put(keep.x0 + 2, keep.y0, 'chair-w');
  for (let x = keep.x1 - 3; x <= keep.x1; x++) plan.put(x, keep.y1, 'chest');
  plan.put(keep.x0 + 1, keep.y1, 'brazier');
  plan.put(keep.x0 + 1, keep.y0 + 2, 'brazier');

  // El comedor, al norte del patio: mesa larga con sillas a los dos lados.
  const hall: Rect = { x0: walls.x0 + 2, y0: walls.y0 + 1, x1: keep.x0 - 3, y1: gateY - 3 };
  if (hall.x1 - hall.x0 >= 6 && hall.y1 - hall.y0 >= 3) {
    plan.fill(hall, Terrain.Wood);
    const door = { x: Math.floor((hall.x0 + hall.x1) / 2), y: hall.y1 + 1 };
    plan.enclose(hall, STONE, [door]);
    plan.ground(door.x, door.y, Terrain.Wood);
    plan.door(door, 'x');
    const tableY = Math.floor((hall.y0 + hall.y1) / 2) + 1;
    for (let x = hall.x0 + 2; x <= hall.x1 - 1; x++) {
      if (x === door.x) continue;
      plan.put(x, tableY, 'table');
      plan.put(x, tableY - 1, 'chair-s');
      plan.put(x, tableY + 1, 'chair-n');
    }
    plan.put(hall.x0 + 1, hall.y0 + 1, 'hearth');
    plan.put(hall.x1, hall.y0 + 1, 'candelabra');
    plan.put(hall.x1, hall.y1, 'keg');
    for (let x = hall.x0 + 1; x <= hall.x1; x += 3) plan.onWall(x, hall.y0, 'bookshelf-x');
  }
  // La barraca de la guardia, al sur del patio: camas, armeros y maniquíes.
  const barracks: Rect = { x0: walls.x0 + 2, y0: gateY + 3, x1: keep.x0 - 3, y1: walls.y1 - 1 };
  if (barracks.x1 - barracks.x0 >= 6 && barracks.y1 - barracks.y0 >= 3) {
    plan.fill(barracks, Terrain.Wood);
    const door = { x: Math.floor((barracks.x0 + barracks.x1) / 2), y: barracks.y0 };
    plan.enclose(barracks, STONE, [door]);
    plan.ground(door.x, door.y, Terrain.Wood);
    plan.door(door, 'x');
    for (let x = barracks.x0 + 1; x <= barracks.x1; x += 2) plan.put(x, barracks.y1, 'bed');
    plan.put(barracks.x0 + 1, barracks.y0 + 1, 'weapon-rack');
    plan.put(barracks.x0 + 3, barracks.y0 + 1, 'weapon-rack');
    plan.put(barracks.x1, barracks.y0 + 1, 'armor-stand');
    plan.put(barracks.x1 - 1, barracks.y0 + 1, 'armor-stand');
    plan.put(barracks.x1, barracks.y1 - 2, 'chest');
  }
  // El patio: pozo, jardín y un banco.
  plan.put(keep.x0 - 2, walls.y0 + 1, 'well');
  plan.put(keep.x0 - 2, walls.y1 - 1, 'oak');
  plan.put(walls.x0 + 2, gateY - 3, 'flowers');
  plan.put(keep.x0 - 2, gateY + 3, 'bench-x');
  return {
    name: `Castillo de ${cityName}`,
    x: walls.x0,
    y: walls.y0,
    width: walls.x1 - walls.x0 + 2,
    height: walls.y1 - walls.y0 + 2,
  };
}

/** Parte un barrio en cuadras con calles de dos tiles en medio. */
function blocks(plan: Plan, style: Style, q: Rect, step: number): Rect[] {
  const out: Rect[] = [];
  const xs = cuts(q.x0, q.x1, step);
  const ys = cuts(q.y0, q.y1, step);
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      const lot: Rect = {
        x0: xs[i] ?? 0,
        y0: ys[j] ?? 0,
        x1: (xs[i + 1] ?? 0) - 3,
        y1: (ys[j + 1] ?? 0) - 3,
      };
      if (lot.x1 - lot.x0 < 4 || lot.y1 - lot.y0 < 4) continue;
      out.push(lot);
    }
  }
  // Calles entre cuadras.
  for (const x of xs.slice(1, -1))
    plan.fill({ x0: x - 2, y0: q.y0, x1: x - 1, y1: q.y1 }, style.street);
  for (const y of ys.slice(1, -1))
    plan.fill({ x0: q.x0, y0: y - 2, x1: q.x1, y1: y - 1 }, style.street);
  return out;
}

function cuts(from: number, to: number, step: number): number[] {
  const n = Math.max(1, Math.round((to - from + 3) / step));
  const length = (to - from + 3) / n;
  return Array.from({ length: n + 1 }, (_, i) => Math.round(from + i * length));
}

/** El piso de adentro de una casa (lo que se camina) y su puerta. */
interface Room extends Rect {
  readonly door: Position;
  /** El tile de adentro pegado a la puerta (se deja libre). */
  readonly entry: Position;
  /** Filas y columnas de las paredes del norte y del oeste (para colgar bibliotecas). */
  readonly northWall: number;
  readonly westWall: number;
}

/** Una casa en la cuadra, con la puerta hacia la plaza. Devuelve el piso de adentro. */
function building(
  plan: Plan,
  style: Style,
  whole: Rect,
  cx: number,
  cy: number,
  random: SeededRandom,
): Room | null {
  const lot = plan.freePart(whole);
  if (!lot) return null;
  plan.claim(lot);
  if (style.lawless) {
    // En el refugio, carpas alrededor de una fogata.
    const c = center(lot);
    plan.put(c.x, c.y, 'campfire');
    for (const [dx, dy] of [
      [-2, -2],
      [2, -2],
      [-2, 2],
    ] as const)
      plan.put(c.x + dx, c.y + dy, 'tent');
    plan.put(c.x + 2, c.y + 2, 'crate');
    plan.put(c.x - 1, c.y + 1, 'stool');
    return {
      x0: c.x - 1,
      y0: c.y - 1,
      x1: c.x + 1,
      y1: c.y + 1,
      door: { x: c.x, y: c.y + 1 },
      entry: { x: c.x, y: c.y + 1 },
      northWall: c.y - 2,
      westWall: c.x - 2,
    };
  }
  const w = lot.x1 - lot.x0;
  const h = lot.y1 - lot.y0;
  // Algunas cuadras quedan de jardín, con un árbol, flores y un banco.
  if (random.next() < 0.1) {
    plan.put(lot.x0 + Math.floor(w / 2), lot.y0 + Math.floor(h / 2), style.trees[0] ?? 'oak');
    plan.put(lot.x0 + 1, lot.y1, 'flowers');
    plan.put(lot.x0 + Math.floor(w / 2), lot.y0 + Math.floor(h / 2) + 2, 'bench-x');
    return null;
  }
  const house: Rect = {
    x0: lot.x0,
    y0: lot.y0,
    x1: lot.x0 + Math.max(3, w - 1 - Math.floor(random.next() * 2)),
    y1: lot.y0 + Math.max(3, h - 1 - Math.floor(random.next() * 2)),
  };
  plan.fill(house, style.floor);
  // La puerta, en la pared del lado de la plaza.
  const mid = center(house);
  const towardX = cx - mid.x;
  const towardY = cy - mid.y;
  const side =
    Math.abs(towardX) > Math.abs(towardY) ? (towardX > 0 ? 'e' : 'w') : towardY > 0 ? 's' : 'n';
  const door: Position =
    side === 'e'
      ? { x: house.x1 + 1, y: mid.y }
      : side === 'w'
        ? { x: house.x0, y: mid.y }
        : side === 's'
          ? { x: mid.x, y: house.y1 + 1 }
          : { x: mid.x, y: house.y0 };
  const entry: Position =
    side === 'e'
      ? { x: house.x1, y: mid.y }
      : side === 'w'
        ? { x: house.x0 + 1, y: mid.y }
        : side === 's'
          ? { x: mid.x, y: house.y1 }
          : { x: mid.x, y: house.y0 + 1 };
  plan.enclose(house, style.walls, [door]);
  plan.ground(door.x, door.y, style.floor);
  plan.door(door, side === 'n' || side === 's' ? 'x' : 'y');
  plan.windows(house, style.walls, door);
  return {
    x0: house.x0 + 1,
    y0: house.y0 + 1,
    x1: house.x1,
    y1: house.y1,
    door,
    entry,
    northWall: house.y0,
    westWall: house.x0,
  };
}

/** Tiles del piso que no hay que tapar: la entrada y el camino hasta el centro. */
function reserved(room: Room): Set<string> {
  const keep = new Set<string>();
  const c = center(room);
  let { x, y } = room.entry;
  keep.add(`${x},${y}`);
  for (let i = 0; i < 20 && (x !== c.x || y !== c.y); i++) {
    if (x !== c.x) x += Math.sign(c.x - x);
    else y += Math.sign(c.y - y);
    keep.add(`${x},${y}`);
  }
  return keep;
}

/** Pone `kind` en el piso si el tile está libre y no es de paso. */
function furniture(plan: Plan, keep: Set<string>, x: number, y: number, kind: StaticKind): boolean {
  if (keep.has(`${x},${y}`) || !plan.isFree(x, y)) return false;
  plan.put(x, y, kind);
  return true;
}

/** Bibliotecas, estantes o armeros colgados de las paredes del norte y del oeste. */
function alongWalls(
  plan: Plan,
  room: Room,
  north: StaticKind | null,
  west: StaticKind | null,
  every = 1,
): void {
  if (north && room.door.y !== room.northWall)
    for (let x = room.x0; x <= room.x1; x += every) plan.onWall(x, room.northWall, north);
  if (west && room.door.x !== room.westWall)
    for (let y = room.y0; y <= room.y1; y += every) plan.onWall(room.westWall, y, west);
}

/**
 * Arma el negocio por dentro según el oficio y devuelve dónde atiende la
 * persona: la taberna con mostrador, toneles, mesas con sillas y el hogar;
 * el banco con mostrador y balanza, cofres y alfombra; la herrería con forja,
 * yunque, armeros y maniquíes; la tienda de magia con bibliotecas, estantes
 * de frascos, mesa de alquimia y caldero; la carpintería con banco, caballete
 * y pilas de tablas.
 */
function furnishShop(plan: Plan, role: NpcRole, room: Room, random: SeededRandom): Position {
  const keep = reserved(room);
  const c = center(room);
  const spot = { x: c.x, y: c.y };
  plan.clear(spot.x, spot.y);
  keep.add(`${spot.x},${spot.y}`);
  const put = (x: number, y: number, kind: StaticKind): boolean =>
    furniture(plan, keep, x, y, kind);
  const corners: Position[] = [
    { x: room.x0, y: room.y0 },
    { x: room.x1, y: room.y0 },
    { x: room.x0, y: room.y1 },
    { x: room.x1, y: room.y1 },
  ];
  switch (role) {
    case 'innkeeper': {
      // Toneles detrás del tabernero y el mostrador adelante (con paso por el medio).
      for (let x = spot.x - 2; x <= spot.x + 2; x++) put(x, room.y0, 'keg');
      for (let x = spot.x - 2; x <= spot.x + 2; x++) put(x, spot.y + 1, 'counter');
      // Mesas con sillas a los lados, más adelante.
      for (let y = spot.y + 3; y <= room.y1; y += 3)
        for (let x = room.x0 + 1; x <= room.x1 - 1; x += 4)
          if (put(x, y, 'table')) {
            put(x - 1, y, 'chair-e');
            put(x + 1, y, 'chair-w');
          }
      put(room.x0, room.y0, 'hearth');
      put(room.x1, room.y0, 'barrel');
      put(room.x1, room.y1, 'bench-y');
      break;
    }
    case 'banker': {
      // Mostrador con balanza adelante, cofres en las esquinas, alfombra y biblioteca.
      for (let x = spot.x - 2; x <= spot.x + 2; x++) put(x, spot.y + 1, 'counter');
      for (const corner of corners) put(corner.x, corner.y, 'chest');
      put(spot.x, spot.y - 1, 'carpet');
      put(room.x0, Math.floor((room.y0 + room.y1) / 2), 'candelabra');
      alongWalls(plan, room, 'bookshelf-x', null, 2);
      break;
    }
    case 'blacksmith': {
      put(room.x0, room.y0, 'forge');
      put(room.x0 + 2, room.y0 + 1, 'anvil');
      put(room.x1, room.y0, 'weapon-rack');
      put(room.x1, room.y1, 'armor-stand');
      put(room.x1 - 1, room.y1, 'armor-stand');
      put(room.x0, room.y1, 'barrel');
      put(room.x0 + 1, room.y1, 'crate');
      break;
    }
    case 'mage': {
      alongWalls(plan, room, 'bookshelf-x', 'potion-shelf-y');
      for (const dx of [2, -2, 1, -1]) if (put(spot.x + dx, spot.y - 1, 'alchemy-table')) break;
      put(room.x1, room.y1, 'cauldron');
      put(room.x0, room.y1, 'candelabra');
      put(room.x1, room.y0, 'chest');
      put(spot.x, spot.y + 1, 'carpet');
      put(spot.x - 1, spot.y + 1, 'stool');
      break;
    }
    case 'carpenter': {
      put(room.x0, room.y0, 'workbench');
      put(room.x0 + 2, room.y0, 'sawhorse');
      put(room.x1, room.y0, 'plank-stack');
      put(room.x1, room.y1, 'plank-stack');
      put(room.x0, room.y1, 'log-pile');
      put(spot.x + 1, spot.y + 1, 'stool');
      put(room.x1 - 1, room.y1, 'chair-n');
      break;
    }
    default:
      break;
  }
  void random;
  return spot;
}

/** Una casa para vivir: cama, mesa con sillas, cofre y, a veces, hogar, biblioteca o alfombra. */
function furnishHome(plan: Plan, room: Room, random: SeededRandom, style: Style): void {
  if (style.lawless) return;
  const keep = reserved(room);
  const put = (x: number, y: number, kind: StaticKind): boolean =>
    furniture(plan, keep, x, y, kind);
  put(room.x0, room.y0, 'bed');
  put(room.x1, room.y0, random.next() < 0.5 ? 'chest' : 'barrel');
  const tx = Math.min(room.x1 - 1, room.x0 + 2);
  const ty = Math.min(room.y1, room.y0 + 2);
  if (put(tx, ty, 'table')) {
    put(tx - 1, ty, 'chair-e');
    put(tx + 1, ty, 'chair-w');
  }
  if (random.next() < 0.5) put(room.x0, room.y1, 'hearth');
  else put(room.x0, room.y1, 'crate');
  if (random.next() < 0.4) alongWalls(plan, room, 'bookshelf-x', null, 3);
  if (random.next() < 0.3) put(room.x1, room.y1, 'carpet');
}

/**
 * El cementerio: reja de hierro (o una cerca, en el refugio), tumbas en
 * hileras, una cripta al fondo y árboles secos. Es zona sin protección: los
 * no-muertos que viven ahí atacan a quien entre.
 */
function buildGraveyard(plan: Plan, r: Rect, spec: CitySpec, random: SeededRandom): RegionData {
  plan.claim(r);
  const inside: Rect = { x0: r.x0 + 1, y0: r.y0 + 1, x1: r.x1 - 1, y1: r.y1 - 1 };
  plan.fill(inside, Terrain.Dirt);
  const gate = { x: inside.x0, y: Math.floor((inside.y0 + inside.y1) / 2) };
  const fence: WallKit =
    spec.style === 'bandit'
      ? FENCE
      : { x: 'iron-fence-x', y: 'iron-fence-y', corner: 'iron-fence-x', post: 'iron-fence-y' };
  plan.enclose(inside, fence, [gate]);
  plan.big(inside.x1 - 2, inside.y0 + 1, 'crypt');
  for (let y = inside.y0 + 2; y <= inside.y1 - 1; y += 2)
    for (let x = inside.x0 + 2; x <= inside.x1 - 1; x += 2) {
      if (!plan.isFree(x, y) || !plan.isFree(x + 1, y)) continue;
      const roll = random.next();
      if (roll < 0.62) plan.put(x, y, 'gravestone');
      else if (roll < 0.7) plan.put(x, y, 'dead-tree');
      else if (roll < 0.78) plan.put(x, y, 'bones');
    }
  // Los no-muertos viven entre las tumbas.
  const open: Position[] = [];
  for (let y = inside.y0 + 1; y <= inside.y1; y++)
    for (let x = inside.x0 + 1; x <= inside.x1; x++) if (plan.isFree(x, y)) open.push({ x, y });
  for (const [i, kind] of GRAVEYARD[spec.size].entries()) {
    const spot = open[Math.floor(((i + 0.5) / GRAVEYARD[spec.size].length) * open.length)];
    if (spot) plan.lairs.push({ kind, position: spot });
  }
  return {
    name: `Cementerio de ${spec.name}`,
    x: r.x0,
    y: r.y0,
    width: r.x1 - r.x0 + 1,
    height: r.y1 - r.y0 + 1,
    wild: true,
  };
}

/**
 * La caballeriza afuera de la muralla: un establo de piso de paja con fardos
 * apilados, el caballerizo adentro, palenques para atar los caballos junto al
 * camino y un corral con bebederos y paja.
 */
function buildStable(
  plan: Plan,
  style: Style,
  r: Rect,
  spec: CitySpec,
  random: SeededRandom,
): void {
  if (r.x1 - r.x0 < 14 || r.y1 - r.y0 < 8) return;
  plan.claim(r);
  // El establo, pegado al camino del sur.
  const barn: Rect = { x0: r.x1 - 9, y0: r.y0 + 1, x1: r.x1 - 2, y1: r.y0 + 6 };
  plan.fill(barn, Terrain.Dirt);
  const door = { x: barn.x1 + 1, y: barn.y0 + 3 };
  plan.enclose(barn, style.walls, [door, { x: door.x, y: door.y + 1 }]);
  plan.doubleDoor(door, 'y');
  plan.windows(barn, style.walls, door);
  plan.ground(door.x, door.y, Terrain.Dirt);
  plan.ground(door.x, door.y + 1, Terrain.Dirt);
  plan.npcs.push({
    role: 'stablemaster',
    position: { x: barn.x1 - 1, y: barn.y0 + 3 },
    ...named(spec, 'stablemaster'),
  });
  // Adentro: fardos contra las paredes, paja suelta y un bebedero.
  for (let x = barn.x0 + 1; x <= barn.x1; x += 1)
    plan.put(x, barn.y0 + 1, x % 3 === 0 ? 'hay-bale' : 'hay-bale');
  plan.put(barn.x0 + 1, barn.y1, 'water-trough');
  for (let x = barn.x0 + 2; x <= barn.x1 - 2; x += 2) plan.put(x, barn.y1 - 1, 'hay-pile');
  plan.put(barn.x0 + 1, barn.y0 + 3, 'barrel');
  plan.put(barn.x0 + 1, barn.y0 + 4, 'hay-bale');
  // Palenques afuera, mirando al camino, con un bebedero.
  for (const y of [barn.y0, barn.y1 + 2]) plan.put(barn.x1 + 3, y, 'hitching-post');
  plan.put(barn.x1 + 3, barn.y1, 'water-trough');
  // El corral: cerca, paja, bebederos y algún fardo.
  const pen: Rect = { x0: r.x0 + 1, y0: r.y0 + 1, x1: barn.x0 - 3, y1: r.y1 - 1 };
  plan.fill(pen, Terrain.Dirt);
  plan.enclose(pen, FENCE, [{ x: pen.x1 + 1, y: Math.floor((pen.y0 + pen.y1) / 2) }]);
  plan.put(pen.x0 + 2, pen.y0 + 2, 'water-trough');
  plan.put(pen.x1 - 1, pen.y1 - 1, 'water-trough');
  for (let i = 0; i < 8; i++) {
    const x = pen.x0 + 1 + Math.floor(random.next() * (pen.x1 - pen.x0));
    const y = pen.y0 + 1 + Math.floor(random.next() * (pen.y1 - pen.y0));
    if (plan.isFree(x, y)) plan.put(x, y, i < 6 ? 'hay-pile' : 'hay-bale');
  }
}

/**
 * La casa del leñador, afuera de la muralla entre los árboles: cabaña con
 * cama y hogar, y en el patio pilas de leños, un tocón con el hacha clavada,
 * un caballete y el leñador con su camisa a cuadros.
 */
function buildWoodcutter(
  plan: Plan,
  style: Style,
  r: Rect,
  spec: CitySpec,
  random: SeededRandom,
): void {
  if (r.x1 - r.x0 < 12 || r.y1 - r.y0 < 9) return;
  plan.claim(r);
  const cabin: Rect = { x0: r.x0 + 1, y0: r.y0 + 1, x1: r.x0 + 6, y1: r.y0 + 5 };
  plan.fill(cabin, Terrain.Wood);
  const door = { x: cabin.x1 + 1, y: cabin.y0 + 2 };
  plan.enclose(cabin, LOGS, [door]);
  plan.door(door, 'y');
  plan.windows(cabin, LOGS, door);
  plan.ground(door.x, door.y, Terrain.Wood);
  plan.put(cabin.x0 + 1, cabin.y0 + 1, 'bed');
  plan.put(cabin.x0 + 1, cabin.y1, 'hearth');
  plan.put(cabin.x1, cabin.y0 + 1, 'table');
  plan.put(cabin.x1 - 1, cabin.y0 + 1, 'chair-e');
  plan.put(cabin.x1, cabin.y1, 'barrel');
  // El patio.
  const yard: Rect = { x0: cabin.x1 + 2, y0: r.y0 + 1, x1: r.x1 - 1, y1: r.y1 - 1 };
  plan.fill(yard, Terrain.Dirt);
  plan.put(yard.x0 + 1, yard.y0, 'log-pile');
  plan.put(yard.x0 + 3, yard.y0, 'log-pile');
  plan.put(yard.x1, yard.y0 + 1, 'log-pile');
  plan.put(yard.x0 + 3, yard.y0 + 3, 'stump-axe');
  plan.put(yard.x1 - 1, yard.y1, 'sawhorse');
  plan.put(yard.x0, yard.y1, 'plank-stack');
  plan.npcs.push({
    role: 'woodcutter',
    position: { x: yard.x0 + 2, y: yard.y0 + 3 },
    ...named(spec, 'woodcutter'),
  });
  // Árboles alrededor de la casa.
  for (let i = 0; i < 10; i++) {
    const x = r.x0 + Math.floor(random.next() * (r.x1 - r.x0 + 1));
    const y = r.y1 - Math.floor(random.next() * 2);
    if (plan.isFree(x, y) && !inRect(yard, x, y) && !inRect(cabin, x, y))
      plan.put(x, y, style.trees[i % style.trees.length] ?? 'oak');
  }
}

/** Huertas afuera de la muralla: surcos de tierra con plantas y un aljibe. */
function buildFields(plan: Plan, style: Style, r: Rect, random: SeededRandom): void {
  if (style.lawless || r.x1 - r.x0 < 6 || r.y1 - r.y0 < 6) return;
  plan.claim(r);
  const field: Rect = { x0: r.x0 + 1, y0: r.y0 + 1, x1: r.x1 - 1, y1: r.y1 - 1 };
  for (let y = field.y0; y <= field.y1; y++)
    for (let x = field.x0; x <= field.x1; x++) {
      plan.ground(x, y, y % 2 === 0 ? Terrain.Dirt : Terrain.Mud);
      if (y % 2 === 1 && random.next() < 0.7) plan.put(x, y, 'tall-grass');
    }
  plan.clear(field.x0, field.y0);
  plan.put(field.x0, field.y0, 'well');
}

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
}

function named(spec: CitySpec, role: NpcRole): { name?: string } {
  const name = spec.people?.[role];
  return name ? { name } : {};
}

function center(r: Rect): Position {
  return { x: Math.floor((r.x0 + r.x1) / 2), y: Math.floor((r.y0 + r.y1) / 2) };
}

function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x0 && y >= r.y0 && x <= r.x1 && y <= r.y1;
}

function onStreet(plan: Plan, x: number, y: number, style: Style): boolean {
  const t = plan.terrain[y * plan.width + x];
  return (
    t === style.avenue &&
    (Math.abs(x - Math.floor(plan.width / 2)) <= 1 ||
      Math.abs(y - Math.floor(plan.height / 2)) <= 1)
  );
}
