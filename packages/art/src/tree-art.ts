import type { Rgb } from './pixel-art';
import type { VolumeCanvas } from './volume';
import {
  add,
  axesAlong,
  clipping,
  cross,
  noise,
  normalize,
  ramp,
  scale,
  tone,
  type Material,
  type Ramp,
  type Vec3,
} from './volume';

/**
 * Árboles que crecen como árboles: un tronco que se abre en ramas madre,
 * cada una se divide en ramas más finas (el grosor se reparte como en la
 * naturaleza: la sección de la madre es la suma de las de sus hijas) y las
 * hojas brotan en las ramitas de la punta, en matas pequeñas con el borde
 * recortado. Cada especie tiene su manera de ramificarse.
 */

type Rand = () => number;

/** Generador con semilla (mulberry32): el mismo árbol cada vez. */
function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UP: Vec3 = [0, 1, 0];
const FLAT: readonly [Vec3, Vec3, Vec3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
/** Ángulo áureo: así se reparten las ramas alrededor de su madre (filotaxis). */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Hacia dónde mira la cámara del mundo (en el modelo). */
const VIEW = normalize([1, Math.SQRT2, 1]);
/** Exponente del reparto de grosor entre ramas hijas (regla de Leonardo, ~2 a 2,5). */
const PIPE = 2.3;

interface Tree {
  readonly c: VolumeCanvas;
  readonly rand: Rand;
  /** Tamaño de esta variante (1 = normal). */
  readonly size: number;
}

function startTree(c: VolumeCanvas, seed: number, variant: number): Tree {
  return { c, rand: seeded(seed + variant * 7919), size: 0.92 + variant * 0.07 };
}

/** Dos direcciones perpendiculares a `d`. */
function basis(d: Vec3): [Vec3, Vec3] {
  const ref: Vec3 = Math.abs(d[1]) < 0.9 ? UP : [1, 0, 0];
  const u = normalize(cross(ref, d));
  return [u, cross(d, u)];
}

/** Dirección que se abre `angle` respecto de `d`, hacia el lado `azimuth`. */
function turn(d: Vec3, angle: number, azimuth: number): Vec3 {
  const [u, v] = basis(d);
  const side = add(scale(u, Math.cos(azimuth)), scale(v, Math.sin(azimuth)));
  return normalize(add(scale(d, Math.cos(angle)), scale(side, Math.sin(angle))));
}

/** Componente horizontal de una dirección (o de un punto, visto desde el tronco). */
function horizontal(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[2]);
  return length < 1e-6 ? [1, 0, 0] : [v[0] / length, 0, v[2] / length];
}

/** Cómo se dobla una rama al crecer. */
interface Bending {
  /** Cuánto se tuerce al azar en cada tramo (0 = recta). */
  readonly wiggle: number;
  /** Hacia dónde tira (luz, peso), según el punto, la dirección y el avance (0 a 1). */
  readonly pull?: (p: Vec3, d: Vec3, k: number) => Vec3;
  /** Largo de cada tramo. */
  readonly segment?: number;
}

/** Una rama ya dibujada: su eje, para colgarle hijas, hojas o raíces aéreas. */
interface Axis {
  readonly points: readonly Vec3[];
  readonly dirs: readonly Vec3[];
  readonly radii: readonly number[];
}

/** Dibuja una rama que se va doblando, de grosor `r0` a `r1`. */
function grow(
  t: Tree,
  start: Vec3,
  dir: Vec3,
  length: number,
  r0: number,
  r1: number,
  bend: Bending,
  material: Material,
): Axis {
  const steps = Math.max(2, Math.round(length / (bend.segment ?? 5)));
  const step = length / steps;
  const points: Vec3[] = [start];
  const dirs: Vec3[] = [dir];
  const radii: number[] = [r0];
  let p = start;
  let d = dir;
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    let next = add(d, scale([t.rand() - 0.5, t.rand() - 0.5, t.rand() - 0.5], bend.wiggle));
    if (bend.pull) next = add(next, bend.pull(p, d, k));
    d = normalize(next);
    const q = add(p, scale(d, step));
    const r = r0 + (r1 - r0) * k;
    t.c.limb(p, q, radii[i - 1] ?? r0, r, material);
    p = q;
    points.push(q);
    dirs.push(d);
    radii.push(r);
  }
  return { points, dirs, radii };
}

/** Punto, dirección y grosor a una fracción `k` del largo de la rama. */
function along(axis: Axis, k: number): { p: Vec3; d: Vec3; r: number } {
  const last = axis.points.length - 1;
  const at = Math.max(0, Math.min(last, k * last));
  const i = Math.min(last - 1, Math.floor(at));
  const f = at - i;
  const a = axis.points[i] ?? [0, 0, 0];
  const b = axis.points[i + 1] ?? a;
  return {
    p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f],
    d: axis.dirs[i + 1] ?? UP,
    r: (axis.radii[i] ?? 1) + ((axis.radii[i + 1] ?? 1) - (axis.radii[i] ?? 1)) * f,
  };
}

/** Punta de una ramita, donde brotan hojas o flores. */
interface Tip {
  readonly p: Vec3;
  readonly d: Vec3;
}

/** Cómo se ramifica una copa que se abre (roble, ceibo, gomero…), nivel por nivel. */
interface Ramification {
  /** Niveles de ramas desde la rama madre (1) hasta las ramitas (`levels`). */
  readonly levels: number;
  /** Hijas en la punta (horquilla) y a los costados, según el nivel. */
  readonly fork: (level: number, rand: Rand) => number;
  readonly lateral: (level: number, rand: Rand) => number;
  /** Apertura de la hija respecto de la madre, en radianes. */
  readonly angle: (level: number) => number;
  /** Largo de la hija respecto de la madre. */
  readonly ratio: (level: number) => number;
  readonly bend: (level: number) => Bending;
  /** Grosor mínimo de una ramita. */
  readonly twig: number;
  /** Probabilidad de que una hija esté quebrada (queda un muñón). */
  readonly broken?: number;
  /** Se llama con cada rama dibujada (para raíces aéreas o ramas colgantes). */
  readonly onAxis?: (level: number, axis: Axis) => void;
}

function ramify(
  t: Tree,
  plan: Ramification,
  start: Vec3,
  dir: Vec3,
  length: number,
  radius: number,
  level: number,
  material: Material,
  tips: Tip[],
): void {
  const last = level >= plan.levels;
  const endRadius = last ? Math.max(plan.twig * 0.6, radius * 0.5) : radius * 0.8;
  const axis = grow(t, start, dir, length, radius, endRadius, plan.bend(level), material);
  plan.onAxis?.(level, axis);
  if (last) {
    const end = along(axis, 1);
    tips.push({ p: end.p, d: end.d });
    const mid = along(axis, 0.45);
    tips.push({ p: mid.p, d: mid.d });
    return;
  }
  const fork = plan.fork(level, t.rand);
  const lateral = plan.lateral(level, t.rand);
  let azimuth = t.rand() * Math.PI * 2;
  for (let i = 0; i < fork + lateral; i++) {
    azimuth += GOLDEN + (t.rand() - 0.5) * 0.7;
    const isFork = i < fork;
    const k = isFork ? 1 : 0.3 + t.rand() * 0.5;
    const from = along(axis, k);
    const childRadius = isFork
      ? endRadius * Math.pow(fork, -1 / PIPE) * (0.9 + t.rand() * 0.2)
      : from.r * 0.55;
    const angle = plan.angle(level) * (0.8 + t.rand() * 0.4) * (isFork ? 1 : 1.3);
    const childLength = length * plan.ratio(level) * (0.85 + t.rand() * 0.3) * (isFork ? 1 : 0.8);
    const childDir = turn(from.d, angle, azimuth);
    if (plan.broken && t.rand() < plan.broken) {
      // Rama quebrada: un muñón corto con el corte a la vista.
      grow(
        t,
        from.p,
        childDir,
        childLength * 0.18,
        childRadius,
        childRadius * 0.85,
        { wiggle: 0 },
        material,
      );
      continue;
    }
    ramify(
      t,
      plan,
      from.p,
      childDir,
      childLength,
      Math.max(plan.twig, childRadius),
      level + 1,
      material,
      tips,
    );
  }
}

/** Raíces que asoman en la base y se hunden en el suelo. */
function roots(t: Tree, radius: number, count: number, reach: number, material: Material): void {
  let azimuth = t.rand() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    azimuth += (Math.PI * 2) / count + (t.rand() - 0.5) * 0.8;
    const out = [Math.cos(azimuth), 0, Math.sin(azimuth)] as const;
    const length = reach * (0.7 + t.rand() * 0.5);
    t.c.limb(
      [out[0] * radius * 0.4, radius * 1.3, out[2] * radius * 0.4],
      [out[0] * length, 0.3, out[2] * length],
      radius * 0.5,
      radius * 0.14,
      material,
    );
  }
}

// ── Materiales ──────────────────────────────────────────────────────

/**
 * Corteza: grietas según `crack` (de 0 a 1, más alto = más hondo) y alguna
 * placa más clara.
 */
function barkOf(colors: Ramp, crack: (p: Vec3) => number, deep = 0.7): Material {
  return (s) => {
    const c = crack(s.p);
    return tone(colors, s.light, c > deep ? -1 : c < 0.06 ? 1 : 0);
  };
}

/** Grietas a lo largo del tronco (roble, álamo, sauce). */
const furrows = (p: Vec3): number =>
  noise(Math.floor((p[0] - p[2]) * 0.9), Math.floor(p[1] / 3.4), Math.floor((p[0] + p[2]) * 0.9));

/** Placas de corteza (pino). */
const plates = (p: Vec3): number =>
  noise(Math.floor(p[1] / 2.6), Math.floor((p[0] - p[2]) / 2.4), Math.floor((p[0] + p[2]) / 2.4));

/** Arrugas horizontales de la corteza lisa (gomero). */
const creases = (p: Vec3): number =>
  noise(Math.floor(p[1] / 1.6), Math.floor((p[0] + p[2]) / 5), Math.floor((p[0] - p[2]) / 5));

/** Corteza corchosa, con grietas en red (ceibo). */
const cork = (p: Vec3): number =>
  noise(Math.floor(p[0] / 1.7), Math.floor(p[1] / 1.7), Math.floor(p[2] / 1.7));

/** Luz del mundo (en el modelo): de arriba y de la izquierda de la pantalla. */
const SUN = normalize([0.1, 1, 0.75]);

/** Volumen de una copa: centro y radios (horizontal y vertical). */
interface CrownShape {
  readonly center: Vec3;
  readonly width: number;
  readonly height: number;
}

/** La copa que envuelve a un conjunto de puntas. */
function crownOf(tips: readonly Tip[]): CrownShape {
  const center = scale(
    tips.reduce<Vec3>((sum, tip) => add(sum, tip.p), [0, 0, 0]),
    1 / Math.max(1, tips.length),
  );
  let width = 1;
  let height = 1;
  for (const { p } of tips) {
    width = Math.max(width, Math.hypot(p[0] - center[0], p[2] - center[2]));
    height = Math.max(height, Math.abs(p[1] - center[1]));
  }
  return { center, width, height };
}

/**
 * Hojas. La luz no sale de cada mata sino de la copa entera (como un solo
 * volumen, más oscura adentro y abajo), y cada mata le suma el relieve de
 * sus hojas; el borde se recorta con ruido: hojas sueltas, no pelotas.
 */
function leaves(
  colors: Ramp,
  crown: CrownShape,
  seed: number,
  ragged = 0.45,
  grain = 1.2,
): Material {
  return clipping((s) => {
    const facing = s.n[0] * VIEW[0] + s.n[1] * VIEW[1] + s.n[2] * VIEW[2];
    const leaf = noise(
      Math.floor(s.p[0] / grain) + seed,
      Math.floor(s.p[1] / grain),
      Math.floor(s.p[2] / grain),
    );
    if (facing < 0.45 && leaf < ragged) return null;
    const rel: Vec3 = [
      (s.p[0] - crown.center[0]) / crown.width,
      (s.p[1] - crown.center[1]) / crown.height,
      (s.p[2] - crown.center[2]) / crown.width,
    ];
    const depth = Math.min(1, Math.hypot(...rel));
    const outward = normalize(add(scale(normalize(rel), 0.6), scale(s.n, 0.4)));
    const sun = Math.max(0, outward[0] * SUN[0] + outward[1] * SUN[1] + outward[2] * SUN[2]);
    // Adentro de la copa llega menos luz.
    const light = (0.3 + 0.7 * sun) * (0.55 + 0.45 * depth);
    return tone(colors, light, leaf > 0.88 ? 1 : leaf < 0.12 ? -1 : 0);
  });
}

/** Matas de hojas alrededor de cada punta: varias chicas, no una grande. */
function foliage(
  t: Tree,
  tips: readonly Tip[],
  colors: Ramp,
  size: number,
  options: {
    chance?: number;
    flat?: number;
    seed?: number;
    ragged?: number;
    perTip?: number;
    crown?: CrownShape;
  } = {},
): void {
  if (tips.length === 0) return;
  const material = leaves(
    colors,
    options.crown ?? crownOf(tips),
    options.seed ?? 0,
    options.ragged,
  );
  const perTip = options.perTip ?? 3;
  for (const tip of tips) {
    if (options.chance !== undefined && t.rand() > options.chance) continue;
    for (let i = 0; i < perTip; i++) {
      const r = size * (0.75 + t.rand() * 0.5);
      const offset: Vec3 = [
        (t.rand() - 0.5) * size * 1.6,
        (t.rand() - 0.3) * size * 1.1,
        (t.rand() - 0.5) * size * 1.6,
      ];
      t.c.ellipsoid(
        add(add(tip.p, scale(tip.d, r * 0.3)), offset),
        FLAT,
        [r, r * (options.flat ?? 0.75), r],
        material,
      );
    }
  }
}

// ── Especies ────────────────────────────────────────────────────────

export type TreeSpecies =
  'oak' | 'pine' | 'snow-pine' | 'ceibo' | 'gomero' | 'willow' | 'poplar' | 'dead-tree';

/** Sombra en el suelo de cada especie (radios en pixeles de pantalla). */
export const TREE_SHADOWS: Readonly<Record<TreeSpecies, readonly [number, number]>> = {
  oak: [42, 17],
  pine: [26, 11],
  ceibo: [30, 12],
  gomero: [52, 21],
  willow: [40, 16],
  poplar: [15, 6],
  'dead-tree': [24, 10],
  'snow-pine': [26, 11],
};

export function drawTree(c: VolumeCanvas, species: TreeSpecies, variant: number): void {
  TREES[species](c, variant);
}

const OAK_BARK = barkOf(ramp([96, 76, 58]), furrows);
const OAK_LEAF = ramp([62, 116, 48]);

/**
 * Roble: tronco corto y grueso que a media altura se abre en tres o cuatro
 * ramas madre sinuosas, bien abiertas; copa ancha y redondeada, más ancha
 * que alta, con huecos entre las matas donde se ven las ramas.
 */
function oak(c: VolumeCanvas, variant: number): void {
  const t = startTree(c, 101, variant);
  const s = t.size;
  roots(t, 5.6 * s, 5, 12 * s, OAK_BARK);
  const trunk = grow(
    t,
    [0, 0, 0],
    turn(UP, 0.06 + t.rand() * 0.06, t.rand() * Math.PI * 2),
    28 * s,
    5.8 * s,
    4.6 * s,
    { wiggle: 0.12, segment: 4 },
    OAK_BARK,
  );
  const plan: Ramification = {
    levels: 4,
    fork: () => 2,
    lateral: (level, rand) => (level < 3 ? 1 + (rand() < 0.5 ? 1 : 0) : rand() < 0.6 ? 1 : 0),
    angle: (level) => [0, 0.5, 0.6, 0.7][level] ?? 0.7,
    ratio: (level) => [0, 0.66, 0.64, 0.6][level] ?? 0.6,
    bend: () => ({
      wiggle: 0.28,
      // Crecen hacia afuera y un poco hacia arriba, buscando luz.
      pull: (p) => add(scale(horizontal(p), 0.09), [0, 0.05, 0]),
    }),
    twig: 0.45,
  };
  const tips: Tip[] = [];
  const scaffolds = 3 + (variant % 2);
  let azimuth = t.rand() * Math.PI * 2;
  for (let i = 0; i < scaffolds; i++) {
    azimuth += (Math.PI * 2) / scaffolds + (t.rand() - 0.5) * 0.6;
    const from = along(trunk, i === 0 ? 1 : 0.72 + t.rand() * 0.28);
    ramify(
      t,
      plan,
      from.p,
      turn(UP, 0.7 + t.rand() * 0.25, azimuth),
      24 * s,
      3.3 * s,
      1,
      OAK_BARK,
      tips,
    );
  }
  foliage(t, tips, OAK_LEAF, 3.4 * s, { seed: variant * 13 });
}

const PINE_BARK = barkOf(ramp([126, 80, 54]), plates, 0.72);
const PINE_NEEDLES = ramp([40, 88, 52]);
const SNOW = ramp([226, 232, 242]);

/**
 * Pino: un solo tronco recto hasta la punta (la guía manda) con pisos de
 * ramas casi horizontales cada tanto; las de abajo, más largas y caídas, las
 * de arriba cortas y alzadas: copa cónica. Abajo el tronco queda pelado, con
 * muñones de ramas secas, y las agujas forman almohadillas sobre cada rama.
 */
function pine(c: VolumeCanvas, variant: number, snowy = false): void {
  const t = startTree(c, 211 + (snowy ? 50 : 0), variant);
  const s = t.size;
  const height = 104 * s;
  roots(t, 3.4 * s, 4, 7 * s, PINE_BARK);
  const trunk = grow(
    t,
    [0, 0, 0],
    UP,
    height,
    3.6 * s,
    0.5,
    { wiggle: 0.03, segment: 6 },
    PINE_BARK,
  );
  for (let i = 0; i < 3; i++) {
    const from = along(trunk, 0.08 + i * 0.05);
    grow(
      t,
      from.p,
      turn(UP, 1.6, t.rand() * Math.PI * 2),
      4 * s,
      0.8,
      0.4,
      { wiggle: 0.2 },
      PINE_BARK,
    );
  }
  const green = leaves(
    PINE_NEEDLES,
    { center: [0, height * 0.55, 0], width: 30 * s, height: height * 0.5 },
    variant * 7,
    0.5,
    1,
  );
  // En la nieve, lo que mira al cielo queda blanco.
  const needles: Material = snowy
    ? clipping((sample) => {
        const color = green(sample);
        if (!color || sample.n[1] < 0.88) return color;
        if (noise(Math.floor(sample.p[0] / 1.5), Math.floor(sample.p[2] / 1.5), 5) < 0.3)
          return color;
        return tone(
          SNOW,
          sample.light,
          noise(Math.floor(sample.p[0]), Math.floor(sample.p[2])) > 0.85 ? -1 : 0,
        );
      })
    : green;
  let azimuth = t.rand() * Math.PI * 2;
  for (let y = 22 * s; y < height - 5; y += 7.2 * s * (0.9 + t.rand() * 0.2)) {
    const k = y / height;
    const whorl = 4 + Math.floor(t.rand() * 2);
    const length = (30 * (1 - k) ** 0.85 + 3.5) * s;
    // De 100° (abajo, caídas) a 55° (arriba, alzadas) respecto de la vertical.
    const tilt = 1.75 - k * 0.8;
    const from = along(trunk, k);
    for (let j = 0; j < whorl; j++) {
      azimuth += (Math.PI * 2) / whorl + (t.rand() - 0.5) * 0.7;
      const branch = grow(
        t,
        from.p,
        turn(UP, tilt + (t.rand() - 0.5) * 0.15, azimuth),
        length,
        Math.max(0.5, 1.4 * s * (1 - k * 0.6)),
        0.35,
        // Cuelgan por el peso y la punta se levanta.
        { wiggle: 0.1, pull: (_p, _d, kk) => [0, kk > 0.65 ? 0.1 : -0.05, 0], segment: 3.5 },
        PINE_BARK,
      );
      for (let m = 0.4; m <= 1.001; m += Math.min(0.25, 2 / length)) {
        const at = along(branch, m);
        const size = (1.7 + 1.4 * (1 - m * 0.5)) * s * (0.8 + (1 - k) * 0.35);
        t.c.ellipsoid(
          add(at.p, [0, 0.8, 0]),
          axesAlong(horizontal(at.d)),
          [size * 0.95, size * 0.34, size * 1.25],
          needles,
        );
      }
    }
  }
  // La guía: un penacho fino en la punta.
  for (let k = 0.93; k <= 1.001; k += 0.035) {
    const at = along(trunk, k);
    t.c.ellipsoid(at.p, FLAT, [2 * s, 2.4 * s, 2 * s], needles);
  }
}

const CEIBO_BARK = barkOf(ramp([130, 106, 82]), cork, 0.6);
const CEIBO_LEAF = ramp([86, 134, 60]);
const CEIBO_FLOWER = ramp([204, 34, 40]);

/**
 * Ceibo: árbol bajo de tronco grueso, retorcido e inclinado, con nudos y
 * corteza corchosa; se abre enseguida en pocas ramas tortuosas que suben,
 * con follaje ralo y racimos de flores rojas en las puntas.
 */
function ceibo(c: VolumeCanvas, variant: number): void {
  const t = startTree(c, 307, variant);
  const s = t.size * 1.08;
  roots(t, 6.2 * s, 4, 10 * s, CEIBO_BARK);
  const lean = t.rand() * Math.PI * 2;
  const trunk = grow(
    t,
    [0, 0, 0],
    turn(UP, 0.3 + t.rand() * 0.12, lean),
    20 * s,
    6.4 * s,
    5 * s,
    { wiggle: 0.3, segment: 3.5 },
    CEIBO_BARK,
  );
  // Nudos del tronco.
  for (let i = 0; i < 3; i++) {
    const at = along(trunk, 0.2 + t.rand() * 0.6);
    const side = turn(at.d, Math.PI / 2, t.rand() * Math.PI * 2);
    t.c.sphere(add(at.p, scale(side, at.r * 0.8)), 2.4 * s, CEIBO_BARK);
  }
  const plan: Ramification = {
    levels: 3,
    fork: () => 2,
    lateral: () => 1,
    angle: (level) => (level === 1 ? 0.6 : 0.72),
    ratio: (level) => (level === 1 ? 0.7 : 0.66),
    bend: () => ({ wiggle: 0.45, pull: () => [0, 0.1, 0], segment: 3.5 }),
    twig: 0.5,
  };
  const tips: Tip[] = [];
  let azimuth = lean + Math.PI;
  for (let i = 0; i < 3; i++) {
    azimuth += (Math.PI * 2) / 3 + (t.rand() - 0.5) * 0.8;
    const from = along(trunk, i === 0 ? 1 : 0.8 + t.rand() * 0.2);
    ramify(
      t,
      plan,
      from.p,
      turn(from.d, 0.75 + t.rand() * 0.3, azimuth),
      21 * s,
      3.4 * s,
      1,
      CEIBO_BARK,
      tips,
    );
  }
  foliage(t, tips, CEIBO_LEAF, 3 * s, { chance: 0.75, seed: variant * 5 + 3 });
  // Racimos de flores: cada flor es un pétalo carnoso, como una cresta de gallo.
  const flower = leaves(CEIBO_FLOWER, crownOf(tips), 11, 0.15, 0.9);
  for (const tip of tips) {
    if (t.rand() > 0.4) continue;
    const dir = normalize(add(tip.d, [0, 0.6, 0]));
    for (let i = 0; i < 4; i++) {
      const p = add(tip.p, scale(dir, 1.4 + i * 1.3));
      // Pétalos que se abren hacia los costados, no una vela.
      const petal = axesAlong(turn(dir, 1.1, i * GOLDEN));
      t.c.ellipsoid(p, petal, [1.1, 1.1, 2] as Vec3, flower);
    }
  }
}

const GOMERO_BARK = barkOf(ramp([112, 106, 94]), creases, 0.78);
const GOMERO_LEAF = ramp([40, 88, 46]);

/**
 * Gomero: un tronco enorme hecho de varios troncos fundidos y retorcidos,
 * con aletones (raíces tablares) que se abren en el suelo; ramas madre
 * gruesas casi horizontales que se estiran lejos, raíces aéreas que cuelgan
 * de ellas (algunas llegan al suelo y se vuelven columnas) y una copa ancha
 * y baja, densa, de hojas grandes y brillantes.
 */
function gomero(c: VolumeCanvas, variant: number): void {
  const t = startTree(c, 401, variant);
  const s = t.size;
  // Troncos fundidos que se enroscan.
  for (let i = 0; i < 4; i++) {
    const phase = (i * Math.PI) / 2 + t.rand() * 0.4;
    let prev: Vec3 = [Math.cos(phase) * 3.4 * s, 0, Math.sin(phase) * 3.4 * s];
    for (let y = 3; y <= 40 * s; y += 3) {
      const a = phase + y * 0.05;
      const spread = 3.4 * s * (1 - (y / (40 * s)) * 0.35);
      const next: Vec3 = [Math.cos(a) * spread, y, Math.sin(a) * spread];
      t.c.limb(prev, next, 4.6 * s, 4.6 * s, GOMERO_BARK);
      prev = next;
    }
  }
  // Aletones: tablas finas que bajan del tronco al suelo.
  let azimuth = t.rand() * Math.PI * 2;
  for (let i = 0; i < 6; i++) {
    azimuth += (Math.PI * 2) / 6 + (t.rand() - 0.5) * 0.5;
    const out: Vec3 = [Math.cos(azimuth), 0, Math.sin(azimuth)];
    const reach = (9 + t.rand() * 6) * s;
    const top = (14 + t.rand() * 5) * s;
    for (let f = 0; f <= 1.001; f += 0.1) {
      const r = 6 * s + reach * f;
      const y = top * (1 - f) ** 1.4;
      t.c.limb(
        add(scale(out, r), [0, y, 0]),
        add(scale(out, r), [0, 0.3, 0]),
        1.3,
        1.3,
        GOMERO_BARK,
      );
    }
  }
  const tips: Tip[] = [];
  const hanging: Axis[] = [];
  const plan: Ramification = {
    levels: 3,
    fork: () => 2,
    lateral: (level) => (level === 1 ? 1 : 2),
    angle: (level) => (level === 1 ? 0.5 : 0.6),
    ratio: (level) => (level === 1 ? 0.6 : 0.6),
    bend: (level) => ({
      wiggle: 0.2,
      pull: (p) => add(scale(horizontal(p), 0.04), [0, level === 1 ? 0.01 : 0.035, 0]),
    }),
    twig: 0.6,
    onAxis: (level, axis) => {
      if (level === 1) hanging.push(axis);
    },
  };
  const limbs = 5;
  for (let i = 0; i < limbs; i++) {
    azimuth += (Math.PI * 2) / limbs + (t.rand() - 0.5) * 0.5;
    const from: Vec3 = [0, (37 + t.rand() * 5) * s, 0];
    ramify(
      t,
      plan,
      from,
      turn(UP, 1.2 + t.rand() * 0.18, azimuth),
      31 * s,
      4.2 * s,
      1,
      GOMERO_BARK,
      tips,
    );
  }
  // Raíces aéreas: cuelgan de las ramas madre; las que tocan el suelo engrosan.
  for (const axis of hanging) {
    for (const k of [0.35, 0.6, 0.85]) {
      if (t.rand() > 0.7) continue;
      const at = along(axis, k);
      const start = add(at.p, [0, -at.r * 0.6, 0]);
      const toGround = t.rand() < 0.45;
      const length = toGround ? start[1] : start[1] * (0.25 + t.rand() * 0.35);
      grow(
        t,
        start,
        [0, -1, 0],
        length,
        toGround ? 1.4 : 0.8,
        toGround ? 1.8 : 0.5,
        { wiggle: 0.06, segment: 4 },
        GOMERO_BARK,
      );
    }
  }
  // La copa es una cúpula cerrada: también hay hojas sobre el tronco.
  for (let i = 0; i < 14; i++) {
    const a = t.rand() * Math.PI * 2;
    const r = t.rand() * 18 * s;
    tips.push({ p: [Math.cos(a) * r, (52 + t.rand() * 8) * s, Math.sin(a) * r], d: UP });
  }
  foliage(
    t,
    tips.filter((tip) => tip.p[1] > 38 * s),
    GOMERO_LEAF,
    4.4 * s,
    {
      seed: variant * 3 + 1,
      flat: 0.62,
      ragged: 0.4,
      perTip: 4,
    },
  );
}

const WILLOW_BARK = barkOf(ramp([102, 86, 66]), furrows);
const WILLOW_LEAF = ramp([124, 156, 68]);

/**
 * Sauce llorón: tronco corto que se abre en varias ramas que suben y se
 * arquean hacia afuera; de ellas cuelgan cortinas de ramitas finas, cargadas
 * de hojas angostas, casi hasta el suelo.
 */
function willow(c: VolumeCanvas, variant: number): void {
  const t = startTree(c, 503, variant);
  const s = t.size;
  roots(t, 5 * s, 4, 9 * s, WILLOW_BARK);
  const trunk = grow(
    t,
    [0, 0, 0],
    turn(UP, 0.12 + t.rand() * 0.1, t.rand() * Math.PI * 2),
    22 * s,
    5 * s,
    4 * s,
    { wiggle: 0.15, segment: 4 },
    WILLOW_BARK,
  );
  const arches: Axis[] = [];
  const plan: Ramification = {
    levels: 2,
    fork: () => 2,
    lateral: () => 1,
    angle: () => 0.5,
    ratio: () => 0.58,
    // Suben y después se arquean por su propio peso.
    bend: () => ({
      wiggle: 0.15,
      pull: (p, _d, k) => add(scale(horizontal(p), 0.08), [0, k < 0.45 ? 0.06 : -0.16, 0]),
    }),
    twig: 0.7,
    onAxis: (_level, axis) => arches.push(axis),
  };
  const tips: Tip[] = [];
  let azimuth = t.rand() * Math.PI * 2;
  for (let i = 0; i < 5; i++) {
    azimuth += (Math.PI * 2) / 5 + (t.rand() - 0.5) * 0.6;
    const from = along(trunk, 0.8 + t.rand() * 0.2);
    ramify(
      t,
      plan,
      from.p,
      turn(UP, 0.55 + t.rand() * 0.2, azimuth),
      26 * s,
      2.6 * s,
      1,
      WILLOW_BARK,
      tips,
    );
  }
  const shape: CrownShape = { center: [0, 34 * s, 0], width: 30 * s, height: 30 * s };
  const strand = leaves(WILLOW_LEAF, shape, variant * 9 + 2, 0.5, 0.9);
  for (const axis of arches) {
    for (let k = 0.3; k <= 1.001; k += 0.09) {
      const at = along(axis, k);
      const length = Math.max(8, at.p[1] - (5 + t.rand() * 14) * s);
      grow(
        t,
        at.p,
        normalize(add(horizontal(at.p), [0, -0.4, 0])),
        length,
        1.2 * s,
        0.7 * s,
        // Las ramitas cuelgan derecho, apenas mecidas.
        { wiggle: 0.06, pull: () => [0, -0.6, 0], segment: 4 },
        strand,
      );
    }
  }
  foliage(t, tips, WILLOW_LEAF, 2.8 * s, {
    seed: variant * 9 + 2,
    ragged: 0.5,
    perTip: 2,
    crown: shape,
  });
}

const POPLAR_BARK = barkOf(ramp([98, 92, 82]), furrows);
const POPLAR_LEAF = ramp([82, 136, 56]);

/**
 * Álamo (de los de cortina, columnar): tronco recto y alto hasta la punta,
 * con muchas ramas cortas pegadas al tronco que suben casi paralelas a él;
 * copa angosta como un huso.
 */
function poplar(c: VolumeCanvas, variant: number): void {
  const t = startTree(c, 601, variant);
  const s = t.size;
  const height = 118 * s;
  roots(t, 3.8 * s, 4, 7 * s, POPLAR_BARK);
  const trunk = grow(
    t,
    [0, 0, 0],
    UP,
    height,
    3.9 * s,
    0.5,
    { wiggle: 0.025, segment: 8 },
    POPLAR_BARK,
  );
  const foliageOf = leaves(
    POPLAR_LEAF,
    { center: [0, height * 0.56, 0], width: 12 * s, height: height * 0.46 },
    variant * 4,
    0.45,
    1,
  );
  let azimuth = t.rand() * Math.PI * 2;
  for (let y = 10 * s; y < height - 3; y += 2.6 * s) {
    const k = y / height;
    azimuth += GOLDEN;
    const length = (4 + 13 * Math.sin(Math.PI * Math.min(1, (k - 0.04) / 0.98)) ** 0.8) * s;
    const from = along(trunk, k);
    const branch = grow(
      t,
      from.p,
      turn(UP, 0.32 + t.rand() * 0.15, azimuth),
      length,
      0.9,
      0.35,
      { wiggle: 0.08, pull: () => [0, 0.06, 0], segment: 3 },
      POPLAR_BARK,
    );
    if (k < 0.12) continue;
    for (const m of [0.35, 0.7, 1]) {
      const at = along(branch, m);
      const r = (2.2 + t.rand() * 1) * s;
      t.c.ellipsoid(at.p, FLAT, [r, r * 1.1, r], foliageOf);
    }
  }
}

const DEAD_BARK = barkOf(ramp([146, 138, 124]), furrows, 0.62);

/** Árbol seco: ramas torcidas y peladas, con muñones de las que se quebraron. */
function deadTree(c: VolumeCanvas, variant: number): void {
  const t = startTree(c, 709, variant);
  const s = t.size;
  roots(t, 5 * s, 4, 10 * s, DEAD_BARK);
  const trunk = grow(
    t,
    [0, 0, 0],
    turn(UP, 0.12 + t.rand() * 0.1, t.rand() * Math.PI * 2),
    26 * s,
    5 * s,
    3.8 * s,
    { wiggle: 0.22, segment: 4 },
    DEAD_BARK,
  );
  const plan: Ramification = {
    levels: 4,
    fork: () => 2,
    lateral: (level, rand) => (rand() < 0.6 ? 1 : 0) * (level < 4 ? 1 : 0),
    angle: (level) => [0, 0.6, 0.65, 0.75][level] ?? 0.75,
    ratio: () => 0.62,
    bend: () => ({ wiggle: 0.38, pull: () => [0, 0.04, 0], segment: 3.5 }),
    twig: 0.4,
    broken: 0.18,
  };
  const tips: Tip[] = [];
  let azimuth = t.rand() * Math.PI * 2;
  for (let i = 0; i < 3; i++) {
    azimuth += (Math.PI * 2) / 3 + (t.rand() - 0.5) * 0.7;
    const from = along(trunk, i === 0 ? 1 : 0.65 + t.rand() * 0.3);
    ramify(
      t,
      plan,
      from.p,
      turn(UP, 0.6 + t.rand() * 0.3, azimuth),
      20 * s,
      2.8 * s,
      1,
      DEAD_BARK,
      tips,
    );
  }
  // Un hueco en el tronco.
  const hole = along(trunk, 0.45);
  const dark: Rgb = [40, 32, 26];
  c.decal(add(hole.p, scale(normalize([1, 0, 1]), hole.r)), [1, 0, 1], dark, 2, 3);
}

const TREES: Readonly<Record<TreeSpecies, (c: VolumeCanvas, variant: number) => void>> = {
  oak,
  pine,
  ceibo,
  gomero,
  willow,
  poplar,
  'dead-tree': deadTree,
  'snow-pine': (c, variant) => pine(c, variant, true),
};
