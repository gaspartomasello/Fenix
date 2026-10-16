import {
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
}

interface WallKit {
  readonly x: StaticKind;
  readonly y: StaticKind;
  readonly corner: StaticKind;
  readonly post: StaticKind;
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
}

const STONE: WallKit = { x: 'wall-x', y: 'wall-y', corner: 'wall-corner', post: 'wall-post' };
const LOGS: WallKit = {
  x: 'log-wall-x',
  y: 'log-wall-y',
  corner: 'log-wall-corner',
  post: 'log-wall-post',
};
const PLANKS: WallKit = {
  x: 'plank-wall-x',
  y: 'plank-wall-y',
  corner: 'plank-wall-corner',
  post: 'plank-wall-post',
};
const BASALT: WallKit = {
  x: 'basalt-wall-x',
  y: 'basalt-wall-y',
  corner: 'basalt-wall-corner',
  post: 'basalt-wall-post',
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
  },
};

/** Medidas: el área de adentro de la muralla y lo que queda afuera (este y sur, para el cementerio). */
const SIZES = {
  large: { inner: [58, 50], near: 4, far: 16 },
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

  toCity(regions: RegionData[], spawn: Position | null): City {
    const statics: StaticPlacement[] = [];
    for (const [i, kind] of this.statics)
      statics.push({ x: i % this.width, y: Math.floor(i / this.width), kind });
    return {
      width: this.width,
      height: this.height,
      terrain: this.terrain,
      statics,
      regions,
      spawn,
      items: this.items,
      npcs: this.npcs,
      lairs: this.lairs,
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
  const plazaR = spec.size === 'large' ? 6 : spec.size === 'medium' ? 4 : 3;
  const plaza: Rect = { x0: cx - plazaR, y0: cy - plazaR, x1: cx + plazaR, y1: cy + plazaR };
  plan.fill(plaza, style.plaza);
  plan.claim({ x0: plaza.x0 - 1, y0: plaza.y0 - 1, x1: plaza.x1 + 1, y1: plaza.y1 + 1 });
  plan.claim({ x0: cx - 2, y0: 0, x1: cx + 2, y1: height - 1 });
  plan.claim({ x0: 0, y0: cy - 2, x1: width - 1, y1: cy + 2 });

  // ── La muralla con sus puertas (y torres, en las de piedra) ──
  buildRing(plan, style, inner, cx, cy);

  // ── La plaza: fuente (o fogata), santuario, puestos del mercado y faroles ──
  if (style.lawless) plan.put(cx, cy, 'campfire');
  else plan.big(cx - 1, cy - 1, 'fountain');
  plan.put(cx + 3, cy - 3, 'shrine');
  if (!style.lawless && spec.size !== 'small') {
    for (const [dx, dy] of [
      [-4, -4],
      [-1, -4],
      [3, 4],
      [-4, 4],
      [-4, 1],
      [4, -1],
    ] as const)
      plan.put(cx + dx, cy + dy, 'stall');
    plan.put(cx - plazaR, cy - plazaR, 'banner');
    plan.put(cx + plazaR, cy + plazaR, 'banner');
  }
  for (const [dx, dy] of [
    [-plazaR, plazaR],
    [plazaR, -plazaR],
  ] as const)
    plan.put(cx + dx, cy + dy, style.light);
  const spawn = { x: cx, y: cy + 3 };

  // ── Barrios: cuadras entre calles, con las casas del estilo de la región ──
  const quadrants: Rect[] = [
    { x0: inner.x0 + 1, y0: inner.y0 + 1, x1: cx - 3, y1: cy - 3 },
    { x0: cx + 3, y0: inner.y0 + 1, x1: inner.x1, y1: cy - 3 },
    { x0: inner.x0 + 1, y0: cy + 3, x1: cx - 3, y1: inner.y1 },
    { x0: cx + 3, y0: cy + 3, x1: inner.x1, y1: inner.y1 },
  ];
  // El castillo ocupa el barrio del noreste.
  const castleQuadrant = style.castle ? quadrants[1] : undefined;
  const regions: RegionData[] = [];
  if (castleQuadrant)
    regions.push(
      buildCastle(
        plan,
        style,
        { ...castleQuadrant, y1: Math.min(castleQuadrant.y1, plaza.y0 - 2) },
        spec.name,
        cx,
      ),
    );
  const lots = quadrants
    .filter((q) => q !== castleQuadrant)
    .flatMap((q) => blocks(plan, style, q, spec.size === 'small' ? 8 : 10));
  // Los negocios van en las cuadras más cerca de la plaza.
  lots.sort(
    (a, b) => distance(center(a), { x: cx, y: cy }) - distance(center(b), { x: cx, y: cy }),
  );
  const shops: NpcRole[] = style.lawless
    ? ['innkeeper', 'blacksmith']
    : ['innkeeper', 'banker', 'blacksmith', 'mage'];
  const houses: Rect[] = [];
  for (const lot of lots) {
    const house = building(plan, style, lot, cx, cy, random);
    if (house) houses.push(house);
  }
  for (const [i, role] of shops.entries()) {
    const house = houses[i];
    if (!house) break;
    const spot = {
      x: Math.floor((house.x0 + house.x1 + 1) / 2),
      y: Math.floor((house.y0 + house.y1 + 1) / 2),
    };
    plan.clear(spot.x, spot.y);
    plan.npcs.push({ role, position: spot, ...named(spec, role) });
    if (role === 'blacksmith') {
      plan.put(house.x0 + 1, house.y0 + 1, 'forge');
      plan.put(house.x1, house.y0 + 1, 'anvil');
    }
  }
  // El depósito de los recién llegados, en la casa siguiente.
  const depot = houses[shops.length];
  if (spec.starterItems && depot) {
    STARTER_ITEMS.forEach(([kind, amount], i) => {
      const x = depot.x0 + 1 + (i % Math.max(1, depot.x1 - depot.x0));
      const y = depot.y0 + 1 + Math.floor(i / Math.max(1, depot.x1 - depot.x0));
      if (y <= depot.y1) {
        plan.clear(x, y);
        plan.items.push({ kind, amount, position: { x, y } });
      }
    });
  }
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
        !onStreet(plan, x, y, style)
      )
        plan.put(x, y, style.light);
  }

  // ── Afuera: la caballeriza con su corral, huertas, árboles y el cementerio ──
  const outskirts = { x0: inner.x1 + 3, y0: inner.y1 + 3, x1: width - 2, y1: height - 2 };
  const graveyard: Rect = {
    x0: Math.max(cx + 4, outskirts.x0),
    y0: Math.max(cy + 4, outskirts.y0),
    x1: outskirts.x1,
    y1: outskirts.y1,
  };
  regions.push(buildGraveyard(plan, graveyard, spec, random));
  if (!style.lawless)
    buildStable(plan, style, { x0: inner.x0, y0: inner.y1 + 3, x1: cx - 4, y1: height - 2 }, spec);
  buildFields(plan, style, { x0: inner.x1 + 3, y0: inner.y0, x1: width - 2, y1: cy - 4 }, random);
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
  return plan.toCity(regions, spec.style === 'capital' || spec.starterItems ? spawn : null);
}

/** La muralla: piedra con torres, empalizada o cerca, con puertas al medio de cada lado. */
function buildRing(plan: Plan, style: Style, inner: Rect, cx: number, cy: number): void {
  const kit = style.ring === 'rampart' ? RAMPART : style.ring === 'palisade' ? PALISADE : FENCE;
  const gaps: Position[] = [];
  for (const d of [-1, 0, 1]) {
    gaps.push({ x: cx + d, y: inner.y0 }, { x: cx + d, y: inner.y1 + 1 });
    gaps.push({ x: inner.x0, y: cy + d }, { x: inner.x1 + 1, y: cy + d });
  }
  plan.enclose(inner, kit, gaps);
  if (!style.towers) return;
  // Torres en las esquinas y a los lados de cada puerta.
  const towers: Position[] = [
    { x: inner.x0 - 1, y: inner.y0 - 1 },
    { x: inner.x1 + 1, y: inner.y0 - 1 },
    { x: inner.x0 - 1, y: inner.y1 + 1 },
    { x: inner.x1 + 1, y: inner.y1 + 1 },
    { x: cx - 3, y: inner.y0 - 1 },
    { x: cx + 2, y: inner.y0 - 1 },
    { x: cx - 3, y: inner.y1 + 1 },
    { x: cx + 2, y: inner.y1 + 1 },
    { x: inner.x0 - 1, y: cy - 3 },
    { x: inner.x0 - 1, y: cy + 2 },
    { x: inner.x1 + 1, y: cy - 3 },
    { x: inner.x1 + 1, y: cy + 2 },
  ];
  for (const t of towers) plan.big(t.x, t.y, 'tower');
}

/**
 * El castillo de la capital: muralla propia con torres, patio empedrado y la
 * torre del homenaje con el salón del trono (piso de mármol, estandartes y
 * braseros). La puerta mira a la avenida.
 */
function buildCastle(plan: Plan, style: Style, q: Rect, cityName: string, cx: number): RegionData {
  const walls: Rect = { x0: q.x0 + 1, y0: q.y0 + 1, x1: q.x1 - 2, y1: q.y1 - 2 };
  plan.claim({ x0: q.x0, y0: q.y0, x1: q.x1, y1: q.y1 });
  plan.fill(walls, Terrain.Flagstone);
  const gateY = Math.floor((walls.y0 + walls.y1) / 2);
  plan.enclose(
    walls,
    RAMPART,
    [-1, 0, 1].map((d) => ({ x: walls.x0, y: gateY + d })),
  );
  // Camino de la avenida a la puerta del castillo.
  plan.fill({ x0: cx + 2, y0: gateY - 1, x1: walls.x0, y1: gateY + 1 }, style.avenue);
  for (const t of [
    { x: walls.x0 - 1, y: walls.y0 - 1 },
    { x: walls.x1 + 1, y: walls.y0 - 1 },
    { x: walls.x0 - 1, y: walls.y1 + 1 },
    { x: walls.x1 + 1, y: walls.y1 + 1 },
  ])
    plan.big(t.x, t.y, 'tower');
  plan.put(walls.x0 + 1, gateY - 2, 'banner');
  plan.put(walls.x0 + 1, gateY + 2, 'banner');
  // La torre del homenaje: el salón del trono al fondo del patio.
  const keep: Rect = {
    x0: Math.floor((walls.x0 + walls.x1) / 2) - 1,
    y0: walls.y0 + 2,
    x1: walls.x1 - 2,
    y1: walls.y1 - 3,
  };
  plan.fill(keep, Terrain.MarbleDark);
  const doorY = Math.floor((keep.y0 + keep.y1) / 2);
  plan.enclose(keep, STONE, [
    { x: keep.x0, y: doorY },
    { x: keep.x0, y: doorY + 1 },
  ]);
  plan.fill({ x0: keep.x0 + 1, y0: doorY, x1: keep.x1, y1: doorY + 1 }, Terrain.MarbleLight);
  plan.put(keep.x1, doorY, 'throne');
  plan.put(keep.x1, doorY - 2, 'banner');
  plan.put(keep.x1, doorY + 3, 'banner');
  plan.put(keep.x0 + 2, keep.y0 + 1, 'brazier');
  plan.put(keep.x0 + 2, keep.y1, 'brazier');
  // Patio con árboles y pozo.
  plan.put(walls.x0 + 3, walls.y0 + 2, 'well');
  plan.put(walls.x0 + 2, walls.y1 - 1, 'oak');
  plan.put(walls.x0 + 5, walls.y1 - 1, 'flowers');
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

/** Una casa en la cuadra, con la puerta hacia la plaza. Devuelve el piso de adentro. */
function building(
  plan: Plan,
  style: Style,
  whole: Rect,
  cx: number,
  cy: number,
  random: SeededRandom,
): Rect | null {
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
    return { x0: c.x - 1, y0: c.y - 1, x1: c.x + 1, y1: c.y + 1 };
  }
  const w = lot.x1 - lot.x0;
  const h = lot.y1 - lot.y0;
  // Algunas cuadras quedan de jardín, con un árbol y flores.
  if (random.next() < 0.12) {
    plan.put(lot.x0 + Math.floor(w / 2), lot.y0 + Math.floor(h / 2), style.trees[0] ?? 'oak');
    plan.put(lot.x0 + 1, lot.y1, 'flowers');
    return null;
  }
  const house: Rect = {
    x0: lot.x0,
    y0: lot.y0,
    x1: lot.x0 + Math.max(3, w - 1 - Math.floor(random.next() * 2)),
    y1: lot.y0 + Math.max(3, h - 1 - Math.floor(random.next() * 2)),
  };
  plan.fill({ ...house, x1: house.x1, y1: house.y1 }, style.floor);
  // La puerta, en la pared del lado de la plaza.
  const mid = center(house);
  const towardX = cx - mid.x;
  const towardY = cy - mid.y;
  const door: Position =
    Math.abs(towardX) > Math.abs(towardY)
      ? towardX > 0
        ? { x: house.x1 + 1, y: mid.y }
        : { x: house.x0, y: mid.y }
      : towardY > 0
        ? { x: mid.x, y: house.y1 + 1 }
        : { x: mid.x, y: house.y0 };
  plan.enclose(house, style.walls, [door]);
  plan.ground(door.x, door.y, style.floor);
  // Muebles: barriles y cajones contra las paredes.
  for (let i = 0; i < 2; i++) {
    const x = house.x0 + 1 + Math.floor(random.next() * (house.x1 - house.x0));
    const y = house.y0 + 1;
    if (plan.isFree(x, y) && !(x === door.x))
      plan.put(x, y, random.next() < 0.5 ? 'barrel' : 'crate');
  }
  return { x0: house.x0 + 1, y0: house.y0 + 1, x1: house.x1, y1: house.y1 };
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

/** La caballeriza afuera de la muralla: un galpón con el caballerizo y un corral. */
function buildStable(plan: Plan, style: Style, r: Rect, spec: CitySpec): void {
  if (r.x1 - r.x0 < 12 || r.y1 - r.y0 < 6) return;
  plan.claim(r);
  const barn: Rect = { x0: r.x1 - 6, y0: r.y0, x1: r.x1 - 2, y1: r.y0 + 4 };
  plan.fill(barn, Terrain.Wood);
  const door = { x: barn.x1 + 1, y: barn.y0 + 2 };
  plan.enclose(barn, style.walls, [door]);
  plan.ground(door.x, door.y, Terrain.Wood);
  plan.npcs.push({
    role: 'stablemaster',
    position: { x: barn.x0 + 2, y: barn.y0 + 2 },
    ...named(spec, 'stablemaster'),
  });
  plan.put(barn.x0 + 1, barn.y0 + 1, 'barrel');
  // Corral de cerca con una abertura hacia el camino.
  const pen: Rect = { x0: r.x0 + 1, y0: r.y0 + 1, x1: barn.x0 - 3, y1: r.y1 - 1 };
  plan.fill(pen, Terrain.Dirt);
  plan.enclose(pen, FENCE, [{ x: pen.x1 + 1, y: Math.floor((pen.y0 + pen.y1) / 2) }]);
  plan.put(pen.x0 + 2, pen.y0 + 2, 'crate');
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
