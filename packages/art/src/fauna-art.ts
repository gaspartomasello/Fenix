import type { FaunaKind } from '@fenix/shared/creatures/fauna-catalog';
import type { Direction } from '@fenix/shared/geometry/direction';
import { OUTLINE } from './character-art';
import { biteOffset, fur, gait, tailWag } from './creature-motion';
import {
  cameraFor,
  cyclePhase,
  spriteCanvas,
  type CanvasFactory,
  type CharacterFrame,
} from './humanoid-rig';
import {
  MOUNTED_ART_HEIGHT,
  MOUNTED_ART_WIDTH,
  MOUNTED_FEET_Y,
  drawQuadruped,
  type BodyKit,
  type Coat,
  type HeadAnchors,
  type QuadrupedBuild,
  ELEPHANT_COAT,
  WILD_ELEPHANT,
} from './mount-art';
import type { PixelImage, Rgb } from './pixel-art';
import {
  add,
  axesAlong,
  metal,
  noise,
  normalize,
  pitch,
  ramp,
  scale,
  solid,
  tone,
  type Material,
  type Ramp,
  type Vec3,
  type VolumeCanvas,
} from './volume';

/**
 * La fauna de las tierras salvajes, cada animal con su modelo de volumen:
 * - con pezuñas (ciervos, cabras, ovejas, vacas, toros, jabalíes): el mismo
 *   esqueleto de las monturas, sin montura;
 * - con zarpas (osos, felinos, lobos): un cuadrúpedo con medidas, orejas,
 *   cola y pelaje de cada especie (rosetas del jaguar, del leopardo…);
 * - y los de forma propia: gorila, morsa, pájaros, rana, serpientes,
 *   escorpiones y cocodrilos.
 * El hombre lagarto, que anda en dos patas, está con los monstruos.
 */
export type FaunaArtKind = Exclude<FaunaKind, 'lizardman'>;

/** Lienzo de cada animal y dónde apoya los pies. */
export interface FaunaLayout {
  readonly width: number;
  readonly height: number;
  readonly feetY: number;
  readonly headY: number;
  readonly zoom: number;
}

const SMALL = { width: 48, height: 48, feetY: 42 };
const BEAST = { width: 88, height: 80, feetY: 72 };
/** Los grandes (osos grandes, gorila, morsa, cocodrilo) no se achican al tile: sobresalen. */
const BIG = { width: 120, height: 104, feetY: 92 };
const HOOVED = { width: MOUNTED_ART_WIDTH, height: MOUNTED_ART_HEIGHT, feetY: MOUNTED_FEET_Y };
const ELEPHANT_ART = { width: 208, height: 208, feetY: 176 };

const LAYOUTS: Readonly<Record<FaunaArtKind, FaunaLayout>> = {
  rabbit: { ...SMALL, headY: 26, zoom: 1.9 },
  eagle: { ...SMALL, headY: 16, zoom: 1.6 },
  raven: { ...SMALL, headY: 24, zoom: 1.7 },
  swallow: { ...SMALL, headY: 28, zoom: 1.8 },
  bullfrog: { ...SMALL, headY: 26, zoom: 1.9 },
  snake: { ...SMALL, headY: 26, zoom: 1.7 },
  'king-cobra': { ...SMALL, headY: 12, zoom: 1.6 },
  scorpion: { ...SMALL, headY: 18, zoom: 1.6 },
  hind: { ...HOOVED, headY: HOOVED.feetY - 50, zoom: 1 },
  'great-hart': { ...HOOVED, headY: HOOVED.feetY - 72, zoom: 1.12 },
  goat: { ...HOOVED, headY: HOOVED.feetY - 34, zoom: 1 },
  'mountain-goat': { ...HOOVED, headY: HOOVED.feetY - 40, zoom: 1 },
  sheep: { ...HOOVED, headY: HOOVED.feetY - 32, zoom: 1 },
  cow: { ...HOOVED, headY: HOOVED.feetY - 49, zoom: 1.12 },
  bull: { ...HOOVED, headY: HOOVED.feetY - 59, zoom: 1.22 },
  boar: { ...HOOVED, headY: HOOVED.feetY - 26, zoom: 1 },
  'black-bear': { ...BEAST, headY: 36, zoom: 1.25 },
  'brown-bear': { ...BIG, headY: 52, zoom: 1.4 },
  grizzly: { ...BIG, headY: 41, zoom: 1.55 },
  'polar-bear': { ...BIG, headY: 44, zoom: 1.55 },
  cougar: { ...BEAST, headY: 40, zoom: 1.25 },
  panther: { ...BEAST, headY: 40, zoom: 1.25 },
  jaguar: { ...BEAST, headY: 40, zoom: 1.25 },
  'snow-leopard': { ...BEAST, headY: 42, zoom: 1.2 },
  'white-wolf': { ...BEAST, headY: 40, zoom: 1.25 },
  gorilla: { ...BIG, headY: 48, zoom: 1.45 },
  walrus: { ...BIG, headY: 59, zoom: 1.45 },
  python: { ...BEAST, headY: 50, zoom: 1.25 },
  'king-scorpion': { ...BEAST, headY: 40, zoom: 1.35 },
  alligator: { ...BEAST, headY: 54, zoom: 1.25 },
  crocodile: { ...BIG, headY: 71, zoom: 1.5 },
  'wild-elephant': { ...ELEPHANT_ART, headY: 64, zoom: 1.12 },
};

export function isFaunaArtKind(kind: string): kind is FaunaArtKind {
  return kind in LAYOUTS;
}

export function faunaLayout(kind: FaunaArtKind): FaunaLayout {
  return LAYOUTS[kind];
}

/** Dibuja un cuadro de un animal. */
export function drawFaunaFrame(
  kind: FaunaArtKind,
  direction: Direction,
  frame: CharacterFrame,
  canvasFor: CanvasFactory = spriteCanvas,
): PixelImage {
  const layout = LAYOUTS[kind];
  const canvas = canvasFor(layout.width, layout.height, cameraFor(direction, layout.zoom, layout));
  DRAW[kind](canvas, frame);
  return canvas.toImage(OUTLINE);
}

// ── Pelajes ─────────────────────────────────────────────────────────

/**
 * Rosetas (jaguar, leopardo): manchas en anillo sobre una grilla torcida;
 * `filled` las hace manchas llenas.
 */
function rosettes(base: Ramp, belly: Ramp, spot: Ramp, cell: number, filled = false): Material {
  return (s) => {
    if (s.n[1] < -0.4) return tone(belly, s.light);
    const g: Vec3 = [s.p[0] / cell, s.p[1] / cell, s.p[2] / cell];
    let best = 9;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const ix = Math.floor(g[0]) + dx;
          const iy = Math.floor(g[1]) + dy;
          const iz = Math.floor(g[2]) + dz;
          const c: Vec3 = [
            ix + noise(ix, iy, iz),
            iy + noise(iy, iz, ix + 7),
            iz + noise(iz, ix, iy + 13),
          ];
          best = Math.min(best, Math.hypot(g[0] - c[0], g[1] - c[1], g[2] - c[2]));
        }
    if (best < 0.22) return tone(filled ? spot : base, s.light, filled ? 0 : -1);
    if (best < 0.4) return tone(spot, s.light);
    return tone(base, s.light);
  };
}

const dark = (rgb: Rgb): Material => solid(ramp(rgb));

// ── Cuadrúpedos con zarpas: osos, felinos, lobos ────────────────────

interface PawBuild {
  readonly coat: Material;
  readonly paw: Ramp;
  /** Alto del lomo (centro del cuerpo) y medio largo, ancho y alto del cuerpo. */
  readonly back: number;
  readonly length: number;
  readonly girth: number;
  readonly depth: number;
  readonly leg: number;
  readonly stride: number;
  /** Cabeza: radio, largo y grosor del hocico, y dónde queda respecto del pecho. */
  readonly head: number;
  readonly snout: readonly [number, number];
  readonly neck: readonly [number, number];
  readonly ears: 'round' | 'pointy';
  readonly tail: 'bushy' | 'cat' | 'stub';
  readonly tailColor?: Material;
  /** Joroba de los hombros (grizzly). */
  readonly hump?: number;
  readonly eyes: Rgb;
  readonly nose: Rgb;
}

function drawPawed(c: VolumeCanvas, frame: CharacterFrame, b: PawBuild): void {
  const step = gait(frame, b.stride);
  const bob = step.lift * 0.8;
  const y = b.back + bob;
  const front = b.length * 0.62;
  const legs: [number, number, number][] = [
    [1, front, step.pairA],
    [-1, front, step.pairB],
    [1, -front, step.pairB],
    [-1, -front, step.pairA],
  ];
  for (const [side, z, swing] of legs) {
    const x = side * b.girth * 0.62;
    const top: Vec3 = [x, y - b.depth * 0.3, z];
    const knee: Vec3 = [x, b.back * 0.45 + bob * 0.5, z + swing * 0.45 + (z < 0 ? -0.8 : 0.4)];
    const paw: Vec3 = [x, 0.9, z + swing];
    c.limb(top, knee, b.leg, b.leg * 0.72, b.coat);
    c.limb(knee, paw, b.leg * 0.72, b.leg * 0.62, b.coat);
    c.ellipsoid(
      add(paw, [0, -0.1, 0.6]),
      axesAlong([0, 0, 1]),
      [b.leg * 0.8, 0.8, b.leg],
      solid(b.paw),
    );
  }
  // Cuerpo: tronco, pecho y anca.
  c.ellipsoid([0, y, 0], axesAlong([0, 0.04, 1]), [b.girth, b.depth, b.length], b.coat);
  c.sphere([0, y + 0.4, front], b.depth * 1.08, b.coat);
  c.sphere([0, y, -front], b.depth, b.coat);
  if (b.hump) c.sphere([0, y + b.depth * 0.7, front * 0.7], b.hump, b.coat);

  // Cola.
  const wag = tailWag(frame);
  const rear: Vec3 = [0, y + b.depth * 0.3, -b.length - 0.5];
  if (b.tail === 'stub') c.sphere(rear, b.depth * 0.3, b.coat);
  else if (b.tail === 'bushy') {
    const mid: Vec3 = [wag * 0.6, y - b.depth * 0.2, -b.length - 4];
    c.limb(rear, mid, 1.6, 1.8, b.coat);
    c.limb(mid, [wag, y - b.depth * 1.1, -b.length - 6.5], 1.8, 0.9, b.tailColor ?? b.coat);
  } else {
    // Cola larga de felino: baja y se curva hacia arriba en la punta.
    const pts: Vec3[] = [
      rear,
      [wag * 0.5, y - b.depth * 0.6, -b.length - 4],
      [wag, y - b.depth * 1.1, -b.length - 8],
      [wag * 1.4, y - b.depth * 0.5, -b.length - 11],
    ];
    pts.slice(1).forEach((p, i) => {
      const from = pts[i] ?? p;
      c.limb(from, p, 1 - i * 0.15, 0.85 - i * 0.15, i === 2 ? (b.tailColor ?? b.coat) : b.coat);
    });
  }

  // Cuello y cabeza.
  const head: Vec3 = add([0, y + b.neck[0], front + b.neck[1]], biteOffset(frame, 2.4));
  c.limb([0, y + 0.8, front + 1], head, b.head * 0.95, b.head * 0.85, b.coat);
  c.sphere(head, b.head, b.coat);
  const muzzle = add(head, [0, -b.head * 0.28, b.head * 0.7 + b.snout[0] * 0.5]);
  c.ellipsoid(
    muzzle,
    axesAlong([0, -0.15, 1]),
    [b.snout[1], b.snout[1] * 0.85, b.snout[0]],
    b.coat,
  );
  c.decal(add(muzzle, [0, b.snout[1] * 0.3, b.snout[0] * 0.98]), [0, 0, 1], b.nose, 2, 1);
  for (const side of [1, -1] as const) {
    if (b.ears === 'round') {
      c.sphere(
        add(head, [side * b.head * 0.62, b.head * 0.78, -b.head * 0.2]),
        b.head * 0.32,
        b.coat,
      );
    } else {
      c.ellipsoid(
        add(head, [side * b.head * 0.55, b.head * 0.9, -b.head * 0.25]),
        axesAlong([0, 0, 1], [side * -0.25, 1, 0]),
        [b.head * 0.26, b.head * 0.5, b.head * 0.2],
        b.coat,
      );
    }
    c.decal(
      add(head, [side * b.head * 0.45, b.head * 0.25, b.head * 0.82]),
      normalize([side * 0.5, 0.2, 1]),
      b.eyes,
    );
  }
}

// ── Osos ────────────────────────────────────────────────────────────

interface BearBuild {
  readonly coat: Ramp;
  readonly belly: Ramp;
  /** Hocico (el oso negro lo tiene más claro). */
  readonly muzzle: Ramp;
  readonly paw: Ramp;
  /** Tamaño (1 = oso negro). */
  readonly size: number;
  /** Joroba de los hombros (la del grizzly es grande). */
  readonly hump: number;
  /** Cabeza más larga y cuello más largo (oso polar). */
  readonly long?: boolean;
}

/**
 * Oso: cuerpo macizo con los hombros altos y el lomo que baja hacia el anca,
 * patas gruesas como columnas con zarpas anchas y uñas claras, cuello corto
 * y cabeza grande y baja, con hocico marcado, nariz negra y orejas redondas.
 * Camina pesado: las patas en diagonal y el cuerpo que se mece.
 */
function drawBear(c: VolumeCanvas, frame: CharacterFrame, b: BearBuild): void {
  const k = b.size;
  const step = gait(frame, 2.2 * k);
  const sway = step.lift * 0.6;
  const coat = fur(b.coat, b.belly, 15 * k);
  const paw = solid(b.paw);
  const claw = solid(ramp([214, 206, 186]));

  // Patas: muslo grueso que se afina poco, zarpa ancha y chata con uñas.
  const legs: [number, number, number][] = [
    [1, 5 * k, step.pairA],
    [-1, 5 * k, step.pairB],
    [1, -5.6 * k, step.pairB],
    [-1, -5.6 * k, step.pairA],
  ];
  for (const [side, z, swing] of legs) {
    const front = z > 0;
    const x = side * 3.1 * k;
    const top: Vec3 = [x, (front ? 10.5 : 10) * k + sway, z];
    const knee: Vec3 = [
      x * 1.02,
      5.2 * k + sway * 0.4,
      z + swing * 0.45 + (front ? 0.4 : -0.6) * k,
    ];
    const foot: Vec3 = [x, 1.3 * k, z + swing];
    c.limb(top, knee, 2.7 * k, 2.2 * k, coat);
    c.limb(knee, foot, 2.2 * k, 1.9 * k, coat);
    c.ellipsoid(
      add(foot, [0, -0.3 * k, 0.6 * k]),
      axesAlong([0, 0, 1]),
      [2 * k, 1.1 * k, 2.5 * k],
      paw,
    );
    for (const toe of [-0.9, 0, 0.9])
      c.sphere(add(foot, [toe * k, -0.6 * k, 2.9 * k]), 0.3 * k, claw);
  }

  // Cuerpo: tronco, hombros altos con la joroba, anca más baja y redonda.
  const y = sway;
  c.ellipsoid([0, 11 * k + y, -0.4 * k], axesAlong([0, -0.06, 1]), [4.9 * k, 5.2 * k, 9 * k], coat);
  c.sphere([0, 12.4 * k + y, 4.4 * k], 5.4 * k, coat);
  c.sphere([0, 11.2 * k + y, -5.6 * k], 4.9 * k, coat);
  c.sphere([0, 14.6 * k + y, 3.4 * k], b.hump * k, coat);
  c.sphere([0, 12 * k + y, -9.6 * k], 1.1 * k, coat);

  // Cuello corto y grueso; la cabeza va baja, a la altura de los hombros.
  const reach = b.long ? 1.35 : 1;
  const head: Vec3 = add([0, 12.2 * k + y, (9 + 1.8 * reach) * k], biteOffset(frame, 2.6 * k));
  c.limb([0, 13 * k + y, 6 * k], head, 4 * k, 3.4 * k, coat);
  c.sphere(head, 3.5 * k, coat);
  // Frente ancha y hocico largo, más claro.
  const snout = add(head, [0, -0.9 * k, 3.2 * k * reach]);
  c.ellipsoid(
    snout,
    axesAlong([0, -0.12, 1]),
    [1.8 * k, 1.6 * k, 2.6 * k * reach],
    solid(b.muzzle),
  );
  c.ellipsoid(
    add(snout, [0, 0.3 * k, 2.3 * k * reach]),
    axesAlong([0, 0, 1]),
    [1 * k, 0.75 * k, 0.6 * k],
    solid(ramp([18, 16, 16])),
  );
  c.decal(add(snout, [0, -1.2 * k, 1.8 * k]), [0, -0.4, 1], [60, 30, 30], 2, 1);
  for (const side of [1, -1] as const) {
    // Orejas redondas y chicas, arriba a los costados.
    c.ellipsoid(
      add(head, [side * 2.3 * k, 2.7 * k, -0.6 * k]),
      axesAlong([0, 0, 1]),
      [1.15 * k, 1.15 * k, 0.6 * k],
      (s) => (s.n[2] > 0.4 ? tone(b.paw, s.light) : tone(b.coat, s.light)),
    );
    c.decal(
      add(head, [side * 1.4 * k, 1 * k, 3 * k]),
      normalize([side * 0.4, 0.2, 1]),
      [16, 12, 10],
    );
  }
}

const BLACK_BEAR: BearBuild = {
  coat: ramp([44, 40, 42]),
  belly: ramp([58, 52, 52]),
  muzzle: ramp([150, 118, 84]),
  paw: ramp([28, 24, 24]),
  size: 1,
  hump: 2.6,
};

const BROWN_BEAR: BearBuild = {
  coat: ramp([116, 80, 50]),
  belly: ramp([140, 102, 68]),
  muzzle: ramp([150, 112, 76]),
  paw: ramp([60, 42, 30]),
  size: 1.05,
  hump: 3,
};

const GRIZZLY: BearBuild = {
  coat: ramp([128, 96, 64]),
  belly: ramp([170, 140, 104]),
  muzzle: ramp([176, 146, 110]),
  paw: ramp([66, 50, 36]),
  size: 1.22,
  hump: 4.2,
};

const POLAR_BEAR: BearBuild = {
  coat: ramp([236, 232, 218]),
  belly: ramp([216, 210, 194]),
  muzzle: ramp([226, 222, 206]),
  paw: ramp([190, 186, 172]),
  size: 1.2,
  hump: 2.2,
  long: true,
};

const CAT: PawBuild = {
  coat: fur(ramp([186, 142, 90]), ramp([222, 200, 160]), 30),
  paw: ramp([160, 120, 80]),
  back: 9.5,
  length: 8.5,
  girth: 3.2,
  depth: 3.4,
  leg: 1.5,
  stride: 2.4,
  head: 2.7,
  snout: [1.1, 1.3],
  neck: [2.4, 3.6],
  ears: 'round',
  tail: 'cat',
  eyes: [220, 190, 60],
  nose: [70, 40, 36],
};

const COUGAR: PawBuild = { ...CAT, tailColor: dark([50, 38, 30]) };

const PANTHER: PawBuild = {
  ...CAT,
  coat: rosettes(ramp([40, 38, 44]), ramp([52, 50, 56]), ramp([26, 24, 28]), 2.2),
  paw: ramp([28, 26, 30]),
  eyes: [230, 210, 70],
  nose: [16, 14, 16],
};

const JAGUAR: PawBuild = {
  ...CAT,
  coat: rosettes(ramp([206, 152, 64]), ramp([236, 222, 188]), ramp([40, 30, 22]), 3.2),
  paw: ramp([180, 130, 60]),
  length: 9,
  girth: 3.5,
  depth: 3.6,
  head: 2.9,
};

const SNOW_LEOPARD: PawBuild = {
  ...CAT,
  coat: rosettes(ramp([206, 204, 196]), ramp([236, 234, 228]), ramp([70, 70, 74]), 3.2),
  paw: ramp([190, 188, 180]),
  tailColor: rosettes(ramp([206, 204, 196]), ramp([236, 234, 228]), ramp([70, 70, 74]), 1.6),
  eyes: [150, 200, 200],
};

const WHITE_WOLF: PawBuild = {
  coat: fur(ramp([226, 226, 222]), ramp([240, 238, 234]), 15),
  paw: ramp([200, 200, 196]),
  back: 12,
  length: 7.5,
  girth: 3.5,
  depth: 3.8,
  leg: 1.7,
  stride: 2.4,
  head: 3.1,
  snout: [3, 1.5],
  neck: [4.6, 4.6],
  ears: 'pointy',
  tail: 'bushy',
  eyes: [200, 170, 60],
  nose: [22, 18, 18],
};

// ── Cuadrúpedos con pezuñas (sin montura) ───────────────────────────

const noAnchors = (at: (p: Vec3) => Vec3): HeadAnchors => ({
  bit: { 1: at([0, 0, 0]), [-1]: at([0, 0, 0]) },
  withers: at([0, 0, 0]),
});

/** Pelaje de un animal con pezuñas: cuerpo, patas y pezuñas. */
function hoovedCoat(body: Material, leg: Ramp, hoof: Ramp): Coat {
  return {
    body,
    mane: leg,
    blaze: false,
    blanket: leg,
    leg: () => (s) => tone(leg, s.light),
    hoof: () => hoof,
  };
}

/** Cabeza alargada a lo largo de `h` desde `top`. */
function headAlong(top: Vec3, h: Vec3): (t: number, offset?: Vec3) => Vec3 {
  return (t, offset = [0, 0, 0]) => add(add(top, scale(h, t)), offset);
}

const DEER_COAT = ramp([156, 104, 62]);
const DEER_BELLY = ramp([224, 206, 176]);

function deerBody(antlers: boolean): QuadrupedBuild['body'] {
  return ({ canvas, at, axes, coat, gait }: BodyKit): HeadAnchors => {
    const along = axes([0, 0, 1]);
    canvas.ellipsoid(at([0, 22, 0]), along, [5.2, 5.6, 11.5], coat.body);
    canvas.ellipsoid(at([0, 22.6, 7.5]), along, [5, 5.6, 5.4], coat.body);
    canvas.ellipsoid(at([0, 22.6, -7.6]), along, [5.2, 5.4, 5], coat.body);
    const base = at([0, 24, 10]);
    const top = at([0, 33.5, 14]);
    canvas.limb(base, top, 3.4, 2.4, coat.body);
    const h = normalize(pitch([0, -0.45, 1], gait.nod * 0.6 + gait.pitch));
    const head = headAlong(top, h);
    canvas.ellipsoid(head(1.2, [0, 0.6, 0]), axesAlong(h), [2.4, 2.4, 3], coat.body);
    canvas.limb(head(2.2), head(6.4), 1.8, 1.2, coat.body);
    canvas.sphere(head(6.6, [0, -0.3, 0]), 1.1, solid(ramp([40, 30, 26])));
    const eye = solid(ramp([20, 16, 14]));
    for (const side of [1, -1] as const) {
      canvas.sphere(head(2, [side * 1.9, 0.9, 0]), 0.55, eye);
      // Orejas grandes y abiertas.
      canvas.ellipsoid(
        head(0, [side * 2.6, 2.4, 0]),
        axesAlong([side, 0.6, -0.2]),
        [0.6, 1, 2],
        coat.body,
      );
      if (antlers) {
        // Astas: un tronco que se abre en puntas.
        const antler = solid(ramp([206, 190, 160]));
        const root = head(0.4, [side * 1.2, 2.4, 0]);
        const main = add(root, [side * 4.2, 7.5, -2]);
        canvas.limb(root, main, 0.55, 0.4, antler);
        canvas.limb(main, add(main, [side * 2.6, 5.4, -2.2]), 0.4, 0.2, antler);
        canvas.limb(main, add(main, [side * -0.6, 4.2, 1.4]), 0.35, 0.2, antler);
        const low = add(root, [side * 1.4, 2.8, -0.6]);
        canvas.limb(low, add(low, [side * 0.6, 1.4, 2.6]), 0.35, 0.2, antler);
        canvas.limb(main, add(main, [side * 3.4, 1.4, 0.6]), 0.35, 0.2, antler);
      }
    }
    // Colita blanca.
    canvas.ellipsoid(at([0, 24, -12.4]), along, [1.2, 1.8, 1], solid(DEER_BELLY));
    return noAnchors(at);
  };
}

const DEER_LEGS = {
  front: {
    top: [3, 17.5, 9.5] as Vec3,
    lengths: [8.4, 7.4, 2] as const,
    rest: [0.02, 0, 0.45] as const,
    thickness: [1.9, 0.85] as const,
    hind: false,
  },
  hind: {
    top: [3.2, 18.5, -8.8] as Vec3,
    lengths: [9, 7.8, 2] as const,
    rest: [-0.38, 0.1, 0.45] as const,
    thickness: [2.3, 0.85] as const,
    hind: true,
  },
};

const HIND: QuadrupedBuild = {
  ...DEER_LEGS,
  hoof: 1.2,
  pivot: [0, 22, 0],
  saddle: null,
  padded: false,
  body: deerBody(false),
};
const HART: QuadrupedBuild = { ...HIND, body: deerBody(true) };
const DEER: Coat = hoovedCoat(fur(DEER_COAT, DEER_BELLY, 25), DEER_COAT, ramp([40, 32, 28]));

function goatBody(horns: 'small' | 'curved', size: number): QuadrupedBuild['body'] {
  return ({ canvas, at, axes, coat, gait }: BodyKit): HeadAnchors => {
    const along = axes([0, 0, 1]);
    const k = size;
    canvas.ellipsoid(at([0, 14 * k, 0]), along, [4.4 * k, 4.6 * k, 8.2 * k], coat.body);
    canvas.ellipsoid(at([0, 14.4 * k, 5.6 * k]), along, [4.2 * k, 4.6 * k, 4 * k], coat.body);
    const base = at([0, 15.5 * k, 7.5 * k]);
    const top = at([0, 21 * k, 10 * k]);
    canvas.limb(base, top, 2.6 * k, 2 * k, coat.body);
    const h = normalize(pitch([0, -0.6, 1], gait.nod * 0.6 + gait.pitch));
    const head = headAlong(top, h);
    canvas.ellipsoid(head(1, [0, 0.4, 0]), axesAlong(h), [1.9 * k, 2 * k, 2.4 * k], coat.body);
    canvas.limb(head(1.8 * k), head(4.8 * k), 1.4 * k, 1 * k, coat.body);
    // Barba.
    canvas.limb(
      head(3.8 * k, [0, -1.2 * k, 0]),
      head(3.4 * k, [0, -3.4 * k, 0]),
      0.7 * k,
      0.3,
      coat.body,
    );
    const horn = solid(ramp([96, 84, 70]));
    for (const side of [1, -1] as const) {
      canvas.sphere(
        head(1.6 * k, [side * 1.5 * k, 0.8 * k, 0]),
        0.45 * k,
        solid(ramp([200, 170, 40])),
      );
      canvas.ellipsoid(
        head(0, [side * 2 * k, 1 * k, 0]),
        axesAlong([side, -0.2, -0.3]),
        [0.5, 0.6, 1.6],
        coat.body,
      );
      const root = head(0.2, [side * 0.8 * k, 1.8 * k, 0]);
      if (horns === 'small') {
        canvas.limb(root, add(root, [side * 0.6, 2.4 * k, -1.6 * k]), 0.5 * k, 0.15, horn);
      } else {
        // Cuernos grandes que se curvan hacia atrás.
        const a = add(root, [side * 0.8, 2.6 * k, -1.4 * k]);
        const b = add(a, [side * 1.2, 0.6 * k, -2.6 * k]);
        canvas.limb(root, a, 0.8 * k, 0.6 * k, horn);
        canvas.limb(a, b, 0.6 * k, 0.4 * k, horn);
        canvas.limb(b, add(b, [side * 0.6, -1.8 * k, -0.4 * k]), 0.4 * k, 0.15, horn);
      }
    }
    canvas.limb(at([0, 16 * k, -8.4 * k]), at([0, 17.4 * k, -9.6 * k]), 0.8, 0.4, coat.body);
    return noAnchors(at);
  };
}

function goatLegs(k: number): Pick<QuadrupedBuild, 'front' | 'hind'> {
  return {
    front: {
      top: [2.6 * k, 11.5 * k, 6.4 * k],
      lengths: [5.4 * k, 4.6 * k, 1.4 * k],
      rest: [0.02, 0, 0.4],
      thickness: [1.6 * k, 0.75 * k],
      hind: false,
    },
    hind: {
      top: [2.8 * k, 12 * k, -6 * k],
      lengths: [5.8 * k, 4.8 * k, 1.4 * k],
      rest: [-0.38, 0.1, 0.4],
      thickness: [1.9 * k, 0.75 * k],
      hind: true,
    },
  };
}

const GOAT_HAIR = ramp([226, 222, 210]);
const GOAT: QuadrupedBuild = {
  ...goatLegs(1),
  hoof: 1,
  pivot: [0, 14, 0],
  saddle: null,
  padded: false,
  body: goatBody('small', 1),
};
const MOUNTAIN_GOAT: QuadrupedBuild = {
  ...goatLegs(1.15),
  hoof: 1.1,
  pivot: [0, 16, 0],
  saddle: null,
  padded: false,
  body: goatBody('curved', 1.15),
};
const goatCoat = (hair: Ramp, legs: Ramp): Coat =>
  hoovedCoat(fur(hair, hair, 99), legs, ramp([60, 50, 44]));

/** Lana en vellones redondos, clara con sombras. */
const fleece: Material = (s) => {
  const tuft = noise(Math.floor(s.p[0] * 1.4), Math.floor(s.p[1] * 1.4), Math.floor(s.p[2] * 1.4));
  return tone(ramp([232, 226, 210]), s.light, tuft > 0.72 ? 1 : tuft < 0.25 ? -1 : 0);
};

function sheepBody({ canvas, at, axes, gait }: BodyKit): HeadAnchors {
  const along = axes([0, 0, 1]);
  // El vellón: varias bolas de lana.
  for (const [x, y, z, r] of [
    [0, 14, 0, 6],
    [0, 14.5, 4.8, 5.2],
    [0, 14.5, -4.8, 5.2],
    [2.4, 16, 1, 4],
    [-2.4, 16, -1, 4],
  ] as const) {
    canvas.ellipsoid(at([x, y, z]), along, [r, r * 0.95, r], fleece);
  }
  const face = solid(ramp([60, 52, 48]));
  const top = at([0, 16.5, 8.6]);
  const h = normalize(pitch([0, -0.5, 1], gait.nod * 0.6 + gait.pitch));
  const head = headAlong(top, h);
  canvas.ellipsoid(head(1.4), axesAlong(h), [1.8, 2, 2.8], face);
  canvas.sphere(head(-0.6, [0, 1.6, 0]), 2, fleece);
  for (const side of [1, -1] as const) {
    canvas.ellipsoid(
      head(0.4, [side * 2.2, 0.6, 0]),
      axesAlong([side, -0.3, -0.2]),
      [0.5, 0.6, 1.5],
      face,
    );
    canvas.sphere(head(1.8, [side * 1.4, 0.8, 0]), 0.4, solid(ramp([20, 18, 16])));
  }
  return noAnchors(at);
}

const SHEEP: QuadrupedBuild = {
  ...goatLegs(0.95),
  hoof: 1,
  pivot: [0, 14, 0],
  saddle: null,
  padded: false,
  body: sheepBody,
};

/**
 * Vacas y toros: tronco largo y hondo con el lomo recto, caderas que se
 * marcan atrás, cuello grueso con papada, cabeza grande que cuelga hacia
 * adelante con el hocico ancho, orejas de costado y cuernos. El toro es más
 * macizo, con morrillo sobre la cruz, cuernos abiertos y argolla en la nariz;
 * la vaca tiene ubre.
 */
function cattleBody(bull: boolean): QuadrupedBuild['body'] {
  return ({ canvas, at, axes, coat, gait }: BodyKit): HeadAnchors => {
    const along = axes([0, 0, 1]);
    const k = bull ? 1.08 : 1;
    const p = (x: number, y: number, z: number): Vec3 => at([x * k, y * k, z * k]);
    const body = coat.body;
    // Tronco: costillar, pecho, grupa y panza honda; lomo recto encima.
    canvas.ellipsoid(p(0, 21, 0), along, [7 * k, 7.4 * k, 12.5 * k], body);
    canvas.ellipsoid(p(0, 21, 8.5), along, [6.6 * k, 7.6 * k, 6 * k], body);
    canvas.ellipsoid(p(0, 22, -9), along, [6.8 * k, 7 * k, 6 * k], body);
    canvas.ellipsoid(p(0, 17.5, 0.5), along, [6.4 * k, 4.8 * k, 9.5 * k], body);
    canvas.ellipsoid(p(0, 26.6, -0.5), along, [4.8 * k, 1.8 * k, 11.5 * k], body);
    for (const side of [1, -1] as const) {
      // Caderas (los huesos de la grupa) y paletas.
      canvas.sphere(p(side * 4.4, 26.2, -8.6), 2.2 * k, body);
      canvas.ellipsoid(p(side * 4.6, 20, 9.5), axes([0, 1, 0.15]), [2.6 * k, 5 * k, 3.6 * k], body);
    }
    if (bull) {
      // Morrillo: la giba de músculo sobre la cruz y el cuello.
      canvas.ellipsoid(p(0, 27.5, 9), axes([0, 0.35, 1]), [5.2, 4.4, 7], body);
    }

    // Cuello grueso, casi horizontal, con la papada colgando abajo.
    const poll = p(0, bull ? 24 : 24.5, 17.5);
    canvas.limb(p(0, 23, 10), poll, (bull ? 6.4 : 5.2) * k, (bull ? 4.6 : 3.8) * k, body);
    canvas.ellipsoid(
      p(0, 17, 13.5),
      axes([0, -0.5, 1]),
      [1.6 * k, (bull ? 4.4 : 3.4) * k, 3.6 * k],
      body,
    );

    // Cabeza larga que baja hacia adelante.
    const h = normalize(pitch([0, -0.62, 1], gait.nod * 0.6 + gait.pitch));
    const head = headAlong(poll, h);
    const hx = axesAlong(h);
    // La cabeza del toro es más ancha y pesada.
    if (bull) canvas.ellipsoid(head(2.2, [0, 0.8, 0]), hx, [4.2, 3.8, 3.8], body);
    canvas.ellipsoid(head(1.6, [0, 0.4, 0]), hx, [3.5 * k, 3.4 * k, 3.4 * k], body);
    canvas.limb(head(2.6), head(7.8), 3 * k, 2.6 * k, body);
    canvas.ellipsoid(head(4.6, [0, -1.7, 0]), hx, [2.6 * k, 1.6 * k, 3.4 * k], body);
    // Hocico ancho y húmedo, con los ollares.
    const nose = bull ? ramp([70, 52, 50]) : ramp([214, 160, 152]);
    canvas.ellipsoid(head(8.7, [0, -0.2, 0]), hx, [3 * k, 2.4 * k, 1.8 * k], solid(nose));
    const dark = solid(ramp([24, 18, 16]));
    for (const side of [1, -1] as const) {
      canvas.sphere(head(10.2, [side * 1.2 * k, 0.2, 0]), 0.5 * k, dark);
      // Ojos a los costados.
      canvas.sphere(head(2.6, [side * 3.2 * k, 1, 0]), 0.75, (s) =>
        s.light > 0.9 ? [220, 220, 220] : [22, 18, 16],
      );
      // Orejas que salen de costado, chatas.
      canvas.ellipsoid(
        head(0.8, [side * 4 * k, 0.4, 0]),
        axesAlong([side, -0.25, -0.35]),
        [1.4 * k, 0.6 * k, 2.4 * k],
        (s) => (s.n[1] < 0 ? tone(ramp([214, 160, 152]), s.light, -1) : body(s)),
      );
      // Cuernos: en la vaca, cortos y hacia arriba; en el toro, abiertos y hacia adelante.
      const horn = solid(ramp([232, 222, 196]));
      const root = head(0.4, [side * 2.6 * k, 2.6, 0]);
      const mid = add(root, bull ? [side * 5, 0.4, 0.4] : [side * 1.8, 0.8, 0]);
      const tip = add(mid, bull ? [side * 1, 2.6, 3.2] : [side * 0.4, 1.8, 0.6]);
      canvas.limb(root, mid, bull ? 1.7 : 0.9, bull ? 1.2 : 0.6, horn);
      canvas.limb(mid, tip, bull ? 1.2 : 0.6, 0.3, solid(ramp([70, 60, 50])));
    }
    if (bull) {
      // Argolla en la nariz.
      canvas.limb(
        head(9.6, [-0.9, -1.4, 0]),
        head(9.6, [0.9, -1.4, 0]),
        0.35,
        0.35,
        metal(ramp([214, 172, 64])),
      );
    }

    // Cola larga pegada a la grupa, con borla.
    const tail = p(0, 27, -14.5);
    const end = add(tail, [gait.tailSwing * 0.4, -13 * k, -1.6]);
    canvas.limb(tail, end, 0.7, 0.5, body);
    canvas.ellipsoid(
      add(end, [0, -1.2, 0]),
      axesAlong([0, 1, 0]),
      [1, 1.8, 1],
      solid(ramp([40, 32, 28])),
    );
    if (!bull) {
      // Ubre con cuatro pezones.
      const udder = solid(ramp([226, 172, 164]));
      canvas.ellipsoid(p(0, 13.6, -6), along, [2.8, 2.2, 3], udder);
      for (const x of [-1.1, 1.1])
        for (const z of [-7, -5]) canvas.limb(p(x, 12.4, z), p(x, 10.8, z), 0.4, 0.3, udder);
    }
    return noAnchors(at);
  };
}

function cattleLegs(k: number): Pick<QuadrupedBuild, 'front' | 'hind'> {
  return {
    front: {
      top: [4.4 * k, 15 * k, 9 * k],
      lengths: [6.6 * k, 5.2 * k, 1.6 * k],
      rest: [0.02, 0, 0.3],
      thickness: [3.1 * k, 1.55 * k],
      hind: false,
    },
    hind: {
      top: [4.6 * k, 16 * k, -9.5 * k],
      lengths: [7.2 * k, 5.4 * k, 1.6 * k],
      rest: [-0.22, 0.12, 0.3],
      thickness: [3.5 * k, 1.55 * k],
      hind: true,
    },
  };
}

/** Ruido suave (interpolado) para manchas de borde redondeado. */
function smoothNoise(x: number, y: number, z: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const s = (t: number): number => t * t * (3 - 2 * t);
  let total = 0;
  for (let dx = 0; dx <= 1; dx++)
    for (let dy = 0; dy <= 1; dy++)
      for (let dz = 0; dz <= 1; dz++) {
        const w = (dx ? s(fx) : 1 - s(fx)) * (dy ? s(fy) : 1 - s(fy)) * (dz ? s(fz) : 1 - s(fz));
        total += w * noise(x0 + dx, y0 + dy, z0 + dz);
      }
  return total;
}

/** Vaca overa: manchas negras grandes y redondeadas sobre blanco. */
const holstein: Material = (s) => {
  const blot = smoothNoise(s.p[0] / 5, s.p[1] / 4.5, s.p[2] / 5.5) > 0.56;
  return tone(blot ? ramp([40, 36, 36]) : ramp([232, 228, 220]), s.light);
};

/** Toro: cuero oscuro y corto, con brillo sobre los músculos y el hocico más claro. */
const bullHide: Material = (s) => {
  const shade = smoothNoise(s.p[0] / 6, s.p[1] / 6, s.p[2] / 6) > 0.62 ? -1 : 0;
  return tone(ramp([66, 44, 34]), s.light, s.light > 0.86 ? 1 : shade);
};

const COW: QuadrupedBuild = {
  ...cattleLegs(1),
  hoof: 1.4,
  pivot: [0, 21, 0],
  saddle: null,
  padded: false,
  body: cattleBody(false),
};
const BULL: QuadrupedBuild = {
  ...cattleLegs(1.08),
  hoof: 1.5,
  pivot: [0, 22, 0],
  saddle: null,
  padded: false,
  body: cattleBody(true),
};

function boarBody({ canvas, at, axes, coat, gait }: BodyKit): HeadAnchors {
  const along = axes([0, 0, 1]);
  canvas.ellipsoid(at([0, 10, 0]), along, [4.4, 4.8, 8.4], coat.body);
  canvas.ellipsoid(at([0, 11, 4.4]), along, [4.6, 5.4, 5], coat.body);
  // Cresta de cerdas en el lomo.
  canvas.ellipsoid(at([0, 15, 2.5]), along, [1.2, 1.6, 6], solid(ramp([46, 36, 30])));
  const top = at([0, 10.5, 9]);
  const h = normalize(pitch([0, -0.25, 1], gait.nod * 0.6 + gait.pitch));
  const head = headAlong(top, h);
  canvas.ellipsoid(head(1.4), axesAlong(h), [3, 3.2, 3.6], coat.body);
  canvas.limb(head(3), head(6), 2, 1.6, coat.body);
  canvas.ellipsoid(head(6.2), axesAlong(h), [1.6, 1.3, 0.6], solid(ramp([120, 90, 80])));
  const tusk = solid(ramp([236, 226, 200]));
  for (const side of [1, -1] as const) {
    canvas.sphere(head(2, [side * 2, 1.4, 0]), 0.45, solid(ramp([20, 16, 14])));
    canvas.ellipsoid(
      head(0.6, [side * 1.8, 2.8, 0]),
      axesAlong([side * 0.3, 1, -0.3]),
      [0.6, 1.4, 0.4],
      coat.body,
    );
    const root = head(5, [side * 1.4, -0.8, 0]);
    canvas.limb(root, add(root, [side * 0.8, 1.8, 0.6]), 0.4, 0.15, tusk);
  }
  canvas.limb(at([0, 12, -8.4]), at([gait.tailSwing * 0.2, 9, -9.4]), 0.4, 0.3, coat.body);
  return noAnchors(at);
}

const BOAR: QuadrupedBuild = {
  front: {
    top: [2.6, 7.5, 5.4],
    lengths: [3.8, 3, 1],
    rest: [0.02, 0, 0.35],
    thickness: [1.8, 0.9],
    hind: false,
  },
  hind: {
    top: [2.8, 8, -5.4],
    lengths: [4.2, 3.2, 1],
    rest: [-0.34, 0.1, 0.35],
    thickness: [2, 0.9],
    hind: true,
  },
  hoof: 0.8,
  pivot: [0, 10, 0],
  saddle: null,
  padded: false,
  body: boarBody,
};
const BOAR_COAT = ramp([96, 74, 58]);

// ── Formas propias ──────────────────────────────────────────────────

function drawRabbit(c: VolumeCanvas, frame: CharacterFrame): void {
  // Salta: el cuerpo sube y baja entero.
  const cycle = cyclePhase(frame);
  const hop = cycle ? Math.abs(Math.sin(cycle.phase * Math.PI * 2)) * 2 : 0;
  const coat = fur(ramp([160, 136, 110]), ramp([226, 216, 200]), 5);
  c.ellipsoid([0, 3.4 + hop, -0.6], axesAlong([0, 0.25, 1]), [2.2, 2.4, 3.2], coat);
  for (const side of [1, -1] as const) {
    c.ellipsoid([side * 1.6, 1.4 + hop * 0.5, -1.6], axesAlong([0, 0, 1]), [0.8, 1.2, 2], coat);
    c.limb([side * 0.9, 2.4 + hop, 1.6], [side * 0.9, 0.5 + hop * 0.3, 2.2], 0.5, 0.4, coat);
  }
  const head: Vec3 = add([0, 5.4 + hop, 2.6], biteOffset(frame, 1));
  c.sphere(head, 1.7, coat);
  for (const side of [1, -1] as const) {
    // Orejas largas.
    c.ellipsoid(
      add(head, [side * 0.7, 2.6, -0.8]),
      axesAlong([0, 0.2, -1], [side * -0.2, 1, 0]),
      [0.55, 2.2, 0.35],
      coat,
    );
    c.decal(add(head, [side * 0.9, 0.5, 1.2]), normalize([side * 0.6, 0.2, 1]), [20, 16, 14]);
  }
  c.sphere([0, 4 + hop, -3.6], 0.9, solid(ramp([240, 236, 228])));
}

interface BirdBuild {
  readonly body: Ramp;
  readonly wing: Ramp;
  readonly belly: Ramp;
  readonly beak: Rgb;
  readonly size: number;
  readonly head?: Ramp;
  readonly forkedTail?: boolean;
}

function drawBird(c: VolumeCanvas, frame: CharacterFrame, b: BirdBuild): void {
  const k = b.size;
  const cycle = cyclePhase(frame);
  const hop = cycle ? Math.abs(Math.sin(cycle.phase * Math.PI * 4)) * 0.8 * k : 0;
  const attack = typeof frame === 'string' && /^(slash|thrust|punch)/.test(frame);
  const body: Material = (s) => (s.n[1] < -0.3 ? tone(b.belly, s.light) : tone(b.body, s.light));
  const legs = solid(ramp([200, 170, 80]));
  for (const side of [1, -1] as const) {
    c.limb(
      [side * 0.8 * k, 2.4 * k + hop, 0],
      [side * 0.8 * k, 0.3, 0.3 * k],
      0.25 * k,
      0.2 * k,
      legs,
    );
  }
  c.ellipsoid([0, 3.8 * k + hop, 0], axesAlong([0, 0.35, 1]), [1.8 * k, 1.8 * k, 3 * k], body);
  // Alas plegadas; al atacar, abiertas.
  for (const side of [1, -1] as const) {
    if (attack) {
      c.ellipsoid(
        [side * 4 * k, 6 * k + hop, -0.4 * k],
        axesAlong([0, 0, 1], [side * -0.5, 1, 0]),
        [3.6 * k, 0.4 * k, 2 * k],
        solid(b.wing),
      );
    } else {
      c.ellipsoid(
        [side * 1.5 * k, 4 * k + hop, -0.8 * k],
        axesAlong([0, 0.25, 1]),
        [0.6 * k, 1.3 * k, 2.8 * k],
        solid(b.wing),
      );
    }
  }
  // Cola.
  const tail = solid(b.wing);
  if (b.forkedTail) {
    for (const side of [1, -1] as const)
      c.limb(
        [0, 3.6 * k + hop, -2.6 * k],
        [side * 0.9 * k, 2.6 * k + hop, -5.4 * k],
        0.5 * k,
        0.15,
        tail,
      );
  } else {
    c.ellipsoid(
      [0, 3.2 * k + hop, -3.6 * k],
      axesAlong([0, -0.3, 1]),
      [1.2 * k, 0.3 * k, 1.6 * k],
      tail,
    );
  }
  const head: Vec3 = add([0, 6 * k + hop, 2.4 * k], biteOffset(frame, 1 * k));
  c.sphere(head, 1.3 * k, b.head ? solid(b.head) : body);
  c.limb(
    add(head, [0, -0.2 * k, 1 * k]),
    add(head, [0, -0.6 * k, 2.6 * k]),
    0.5 * k,
    0.1,
    solid(ramp(b.beak)),
  );
  for (const side of [1, -1] as const)
    c.decal(
      add(head, [side * 0.8 * k, 0.3 * k, 0.8 * k]),
      normalize([side * 0.6, 0.2, 1]),
      [16, 12, 10],
    );
}

function drawFrog(c: VolumeCanvas, frame: CharacterFrame): void {
  const cycle = cyclePhase(frame);
  const hop = cycle ? Math.abs(Math.sin(cycle.phase * Math.PI * 2)) * 1.6 : 0;
  const skin: Material = (s) => {
    if (s.n[1] < -0.3) return tone(ramp([214, 206, 150]), s.light);
    const spot =
      noise(Math.floor(s.p[0] * 1.2), Math.floor(s.p[1] * 1.2), Math.floor(s.p[2] * 1.2)) > 0.78;
    return tone(ramp([92, 128, 60]), s.light, spot ? -1 : 0);
  };
  c.ellipsoid([0, 2.6 + hop, 0], axesAlong([0, 0.3, 1]), [3, 2.2, 3.4], skin);
  for (const side of [1, -1] as const) {
    // Patas de atrás grandes y dobladas.
    c.ellipsoid([side * 2.6, 1.4 + hop * 0.5, -1.8], axesAlong([0, 0.2, 1]), [1.1, 1.2, 2.4], skin);
    c.ellipsoid([side * 3, 0.4, 0.2], axesAlong([side * 0.3, 0, 1]), [0.9, 0.3, 1.8], skin);
    c.limb([side * 1.6, 2 + hop, 2], [side * 2, 0.4, 2.8], 0.45, 0.4, skin);
    // Ojos saltones.
    const eye: Vec3 = [side * 1.5, 4.4 + hop, 2.2];
    c.sphere(eye, 0.85, solid(ramp([200, 180, 60])));
    c.decal(add(eye, [0, 0.1, 0.8]), [0, 0, 1], [10, 10, 10]);
  }
  c.decal([0, 2 + hop, 3.4], [0, 0, 1], [60, 30, 30], 3, 1);
}

function drawWalrus(c: VolumeCanvas, frame: CharacterFrame): void {
  const cycle = cyclePhase(frame);
  const heave = cycle ? Math.sin(cycle.phase * Math.PI * 2) : 0;
  const skin: Material = (s) => {
    const wrinkle =
      noise(Math.floor(s.p[0] * 0.9), Math.floor(s.p[1] * 1.6), Math.floor(s.p[2] * 0.9)) > 0.8;
    return tone(ramp([150, 104, 82]), s.light, wrinkle ? -1 : 0);
  };
  c.ellipsoid([0, 6 + heave * 0.5, -2], axesAlong([0, 0.15, 1]), [6.4, 5.6, 9.6], skin);
  c.ellipsoid([0, 8, 5], axesAlong([0, 0.4, 1]), [5.2, 5.6, 5], skin);
  for (const side of [1, -1] as const) {
    c.ellipsoid(
      [side * 5.4, 1.6, 4 + heave * side],
      axesAlong([side * 0.6, -0.2, 1]),
      [1, 0.6, 3],
      skin,
    );
    c.ellipsoid([side * 2.4, 1, -11.4], axesAlong([side * 0.5, 0, -1]), [1.2, 0.5, 2.6], skin);
  }
  const head: Vec3 = add([0, 10.6, 9.4], biteOffset(frame, 1.6));
  c.sphere(head, 3.4, skin);
  c.ellipsoid(add(head, [0, -1.2, 2.4]), axesAlong([0, -0.2, 1]), [2.8, 1.8, 1.6], skin);
  const tusk = solid(ramp([238, 232, 214]));
  for (const side of [1, -1] as const) {
    const root = add(head, [side * 1.1, -2, 3]);
    c.limb(root, add(root, [side * 0.3, -4.8, 0.6]), 0.55, 0.3, tusk);
    c.decal(add(head, [side * 1.6, 1, 2.6]), normalize([side * 0.5, 0.2, 1]), [20, 14, 12]);
  }
  c.decal(add(head, [0, -0.8, 4]), [0, 0, 1], [100, 76, 62], 3, 1);
}

function drawGorilla(c: VolumeCanvas, frame: CharacterFrame): void {
  // Anda apoyado en los nudillos: brazos largos adelante, patas cortas atrás.
  const step = gait(frame, 2);
  const bob = step.lift * 0.8;
  const hair = fur(ramp([46, 44, 48]), ramp([60, 58, 62]), 99);
  const silver = fur(ramp([140, 140, 144]), ramp([120, 120, 124]), 99);
  const skin = solid(ramp([40, 36, 36]));
  for (const side of [1, -1] as const) {
    const swing = side === 1 ? step.pairA : step.pairB;
    // Brazo: hombro alto, nudillos en el suelo.
    c.limb([side * 5, 17 + bob, 4], [side * 5.6, 8, 6 + swing * 0.5], 2.4, 2, hair);
    c.limb([side * 5.6, 8, 6 + swing * 0.5], [side * 5.4, 1, 7 + swing], 2, 1.6, hair);
    c.ellipsoid([side * 5.4, 0.9, 7.4 + swing], axesAlong([0, 0, 1]), [1.4, 1, 1.4], skin);
    // Pierna corta.
    const back = side === 1 ? step.pairB : step.pairA;
    c.limb([side * 3, 9 + bob, -4], [side * 3.2, 4.4, -3 + back * 0.5], 2.2, 1.8, hair);
    c.limb([side * 3.2, 4.4, -3 + back * 0.5], [side * 3.2, 0.8, -2.4 + back], 1.8, 1.4, hair);
    c.ellipsoid([side * 3.2, 0.6, -1.8 + back], axesAlong([0, 0, 1]), [1.2, 0.7, 1.8], skin);
  }
  // Tronco inclinado, espalda plateada, pecho ancho.
  c.ellipsoid([0, 13 + bob, -1], axesAlong([0, 0.5, 1]), [5.2, 5.6, 6.6], hair);
  c.ellipsoid([0, 15.6 + bob, -2.6], axesAlong([0, 0.5, 1]), [4.4, 2.6, 4.6], silver);
  c.sphere([0, 16.6 + bob, 4], 5.2, hair);
  const head: Vec3 = add([0, 19.4 + bob, 7.6], biteOffset(frame, 1.6));
  c.sphere(head, 3, hair);
  c.sphere(add(head, [0, 2, -0.8]), 2.2, hair);
  c.ellipsoid(add(head, [0, -0.6, 2.2]), axesAlong([0, 0, 1]), [2.2, 1.8, 1.2], skin);
  c.ellipsoid(add(head, [0, 1.2, 2]), axesAlong([1, 0, 0]), [2.6, 0.7, 0.8], skin);
  for (const side of [1, -1] as const)
    c.decal(add(head, [side * 1.1, 0.8, 2.8]), normalize([side * 0.4, 0, 1]), [150, 90, 40]);
}

/** Cuerpo de serpiente que ondula por el suelo; la cobra levanta la cabeza con la capucha abierta. */
function drawSerpent(
  c: VolumeCanvas,
  frame: CharacterFrame,
  s: {
    readonly scale: Material;
    readonly belly: Ramp;
    readonly thick: number;
    readonly length: number;
    readonly cobra: boolean;
  },
): void {
  const cycle = cyclePhase(frame);
  const phase = cycle ? cycle.phase * Math.PI * 2 : 0;
  const n = 14;
  const points: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const z = s.length * (0.45 - t);
    const x = Math.sin(t * Math.PI * 2.2 + phase) * s.length * 0.14 * (0.4 + t);
    points.push([x, s.thick * 0.85, z]);
  }
  const body: Material = (p) => (p.n[1] < -0.3 ? tone(s.belly, p.light) : s.scale(p));
  for (let i = 0; i < n; i++) {
    const a = points[i] ?? [0, 0, 0];
    const b = points[i + 1] ?? a;
    const r = s.thick * (1 - (i / n) * 0.75);
    c.limb(a, b, r, r * 0.95, body);
  }
  const neck = points[0] ?? [0, 0, 0];
  const bite = biteOffset(frame, s.thick * 1.6);
  let head: Vec3;
  if (s.cobra) {
    // Se yergue: el cuello sube y la capucha se abre.
    const up: Vec3 = add([neck[0], s.thick * 7, neck[2] + s.thick * 0.6], bite);
    c.limb(neck, up, s.thick, s.thick * 0.9, body);
    c.ellipsoid(
      add(up, [0, -s.thick * 1.6, -0.3]),
      axesAlong([0, 0.15, 1]),
      [s.thick * 3, s.thick * 3.2, s.thick * 0.55],
      body,
    );
    head = add(up, [0, s.thick * 0.6, s.thick * 1]);
  } else {
    head = add(neck, add([0, s.thick * 0.6, s.thick * 1.6], bite));
  }
  c.ellipsoid(head, axesAlong([0, -0.1, 1]), [s.thick * 1.15, s.thick * 0.85, s.thick * 1.7], body);
  for (const side of [1, -1] as const)
    c.decal(
      add(head, [side * s.thick * 0.7, s.thick * 0.4, s.thick * 0.8]),
      normalize([side * 0.6, 0.3, 1]),
      [220, 180, 40],
    );
}

/** Escamas en bandas (cobra) o en manchas (pitón). */
function banded(base: Ramp, band: Ramp, width: number): Material {
  return (s) => tone(Math.floor(s.p[2] / width) % 3 === 0 ? band : base, s.light);
}
function blotched(base: Ramp, blot: Ramp, cell: number): Material {
  return (s) =>
    tone(
      noise(Math.floor(s.p[0] / cell), Math.floor(s.p[1] / cell), Math.floor(s.p[2] / cell)) > 0.5
        ? blot
        : base,
      s.light,
    );
}

function drawScorpion(c: VolumeCanvas, frame: CharacterFrame, k: number, shell: Ramp): void {
  const step = gait(frame, 1 * k);
  const carapace: Material = (s) =>
    tone(
      shell,
      s.light,
      noise(Math.floor(s.p[0] * 1.5), Math.floor(s.p[2] * 1.5), 3) > 0.8 ? 1 : 0,
    );
  const leg = solid(shell, -1);
  for (const side of [1, -1] as const) {
    for (let i = 0; i < 4; i++) {
      const z = (1.8 - i * 1.3) * k;
      const swing = (i % 2 === 0) === (side === 1) ? step.pairA : step.pairB;
      const hip: Vec3 = [side * 1.6 * k, 2 * k, z];
      const knee: Vec3 = [side * 3.6 * k, 3 * k, z + swing * 0.3];
      const foot: Vec3 = [side * 4.8 * k, 0.3, z + swing * 0.6 - 0.4 * k];
      c.limb(hip, knee, 0.4 * k, 0.32 * k, leg);
      c.limb(knee, foot, 0.32 * k, 0.2 * k, leg);
    }
    // Pinzas.
    const pinch = biteOffset(frame, 1.4 * k);
    const elbow: Vec3 = [side * 2.6 * k, 2.4 * k, 3.6 * k];
    const claw: Vec3 = add([side * 2.2 * k, 2.2 * k, 6.2 * k], pinch);
    c.limb([side * 1.2 * k, 2.2 * k, 2.4 * k], elbow, 0.5 * k, 0.45 * k, carapace);
    c.limb(elbow, claw, 0.45 * k, 0.6 * k, carapace);
    c.ellipsoid(
      add(claw, [0, 0, 0.8 * k]),
      axesAlong([side * -0.2, 0, 1]),
      [0.9 * k, 0.6 * k, 1.4 * k],
      carapace,
    );
  }
  c.ellipsoid([0, 2.2 * k, 0.6 * k], axesAlong([0, 0, 1]), [1.9 * k, 1.1 * k, 3 * k], carapace);
  // Cola en segmentos que se arquea sobre el lomo, con el aguijón.
  const attack = typeof frame === 'string' && /-1$/.test(frame) ? 1.5 * k : 0;
  const seg: Vec3[] = [
    [0, 2.4 * k, -2.2 * k],
    [0, 3.8 * k, -3.8 * k],
    [0, 6 * k, -4.4 * k],
    [0, 8 * k, -3.4 * k],
    [0, 8.8 * k, -1.6 * k + attack],
  ];
  seg.slice(1).forEach((p, i) => {
    const from = seg[i] ?? p;
    c.limb(from, p, (0.8 - i * 0.1) * k, (0.7 - i * 0.1) * k, carapace);
  });
  const stinger = seg[4] ?? [0, 0, 0];
  c.limb(stinger, add(stinger, [0, -1.4 * k, 1.2 * k]), 0.4 * k, 0.1, solid(ramp([40, 30, 24])));
}

function drawCrocodile(c: VolumeCanvas, frame: CharacterFrame, hide: Ramp, k: number): void {
  const step = gait(frame, 1.6);
  const scales: Material = (s) => {
    if (s.n[1] < -0.3) return tone(ramp([200, 196, 150]), s.light);
    const ridge = Math.abs(s.p[0]) < 1.2 * k && s.n[1] > 0.6;
    const scute = noise(Math.floor(s.p[0] * 0.9), Math.floor(s.p[2] * 0.9), 5) > 0.7;
    return tone(hide, s.light, ridge || scute ? -1 : 0);
  };
  const wag = tailWag(frame);
  for (const [side, z, swing] of [
    [1, 4, step.pairA],
    [-1, 4, step.pairB],
    [1, -4, step.pairB],
    [-1, -4, step.pairA],
  ] as const) {
    // Patas cortas y abiertas a los costados.
    const hip: Vec3 = [side * 2.6 * k, 2.6 * k, z * k];
    const elbow: Vec3 = [side * 4.4 * k, 1.8 * k, z * k + swing * 0.4];
    const foot: Vec3 = [side * 4.8 * k, 0.4, z * k + swing];
    c.limb(hip, elbow, 1 * k, 0.8 * k, scales);
    c.limb(elbow, foot, 0.8 * k, 0.7 * k, scales);
  }
  c.ellipsoid([0, 2.6 * k, 0], axesAlong([0, 0, 1]), [3.2 * k, 1.8 * k, 7.5 * k], scales);
  // Cola larga que se va afinando y se mueve de lado a lado.
  const tail: Vec3[] = [
    [0, 2.4 * k, -6 * k],
    [wag * 1.2, 2 * k, -10 * k],
    [wag * 2.4, 1.6 * k, -14 * k],
    [wag * 3, 1.2 * k, -18 * k],
  ];
  tail.slice(1).forEach((p, i) => {
    const from = tail[i] ?? p;
    c.limb(from, p, (2.2 - i * 0.6) * k, (1.6 - i * 0.5) * k, scales);
  });
  // Cabeza chata y hocico largo; al morder, abre la boca.
  const bite = typeof frame === 'string' && /-1$/.test(frame) ? 0.35 : 0;
  const head: Vec3 = [0, 2.8 * k, 8.4 * k];
  c.ellipsoid(head, axesAlong([0, 0, 1]), [2.2 * k, 1.5 * k, 2.4 * k], scales);
  c.ellipsoid(
    add(head, [0, -0.2 * k, 4 * k]),
    axesAlong([0, bite, 1]),
    [1.3 * k, 0.6 * k, 3.6 * k],
    scales,
  );
  c.ellipsoid(
    add(head, [0, -0.9 * k, 3.6 * k]),
    axesAlong([0, -bite, 1]),
    [1.2 * k, 0.45 * k, 3.4 * k],
    scales,
  );
  const teeth = solid(ramp([236, 230, 210]));
  for (const side of [1, -1] as const) {
    c.sphere(add(head, [side * 1.1 * k, 1.2 * k, 0.6 * k]), 0.6 * k, solid(ramp([200, 180, 60])));
    for (let t = 0; t < 3; t++)
      c.sphere(add(head, [side * 1.1 * k, -0.6 * k, (2.4 + t * 1.6) * k]), 0.25 * k, teeth);
  }
}

// ── Cada especie ────────────────────────────────────────────────────

const DRAW: Readonly<Record<FaunaArtKind, (c: VolumeCanvas, frame: CharacterFrame) => void>> = {
  rabbit: drawRabbit,
  hind: (c, f) => void drawQuadruped(c, HIND, DEER, f),
  'great-hart': (c, f) => void drawQuadruped(c, HART, DEER, f),
  goat: (c, f) => void drawQuadruped(c, GOAT, goatCoat(GOAT_HAIR, GOAT_HAIR), f),
  'mountain-goat': (c, f) =>
    void drawQuadruped(c, MOUNTAIN_GOAT, goatCoat(ramp([150, 128, 100]), ramp([120, 100, 80])), f),
  sheep: (c, f) =>
    void drawQuadruped(c, SHEEP, hoovedCoat(fleece, ramp([60, 52, 48]), ramp([40, 34, 30])), f),
  cow: (c, f) =>
    void drawQuadruped(c, COW, hoovedCoat(holstein, ramp([232, 228, 220]), ramp([50, 40, 34])), f),
  bull: (c, f) =>
    void drawQuadruped(c, BULL, hoovedCoat(bullHide, ramp([50, 34, 28]), ramp([30, 24, 20])), f),
  boar: (c, f) =>
    void drawQuadruped(
      c,
      BOAR,
      hoovedCoat(fur(BOAR_COAT, ramp([120, 96, 76]), 13), BOAR_COAT, ramp([40, 32, 28])),
      f,
    ),
  eagle: (c, f) =>
    drawBird(c, f, {
      body: ramp([110, 74, 44]),
      wing: ramp([84, 56, 36]),
      belly: ramp([130, 92, 56]),
      beak: [230, 190, 60],
      size: 1.6,
      head: ramp([236, 232, 222]),
    }),
  raven: (c, f) =>
    drawBird(c, f, {
      body: ramp([34, 32, 40]),
      wing: ramp([28, 26, 34]),
      belly: ramp([44, 42, 50]),
      beak: [30, 28, 30],
      size: 1.15,
    }),
  swallow: (c, f) =>
    drawBird(c, f, {
      body: ramp([40, 56, 110]),
      wing: ramp([30, 40, 84]),
      belly: ramp([232, 214, 190]),
      beak: [30, 28, 30],
      size: 1,
      forkedTail: true,
    }),
  bullfrog: drawFrog,
  walrus: drawWalrus,
  gorilla: drawGorilla,
  'wild-elephant': (c, f) => void drawQuadruped(c, WILD_ELEPHANT, ELEPHANT_COAT, f),
  'black-bear': (c, f) => drawBear(c, f, BLACK_BEAR),
  'brown-bear': (c, f) => drawBear(c, f, BROWN_BEAR),
  grizzly: (c, f) => drawBear(c, f, GRIZZLY),
  'polar-bear': (c, f) => drawBear(c, f, POLAR_BEAR),
  cougar: (c, f) => drawPawed(c, f, COUGAR),
  panther: (c, f) => drawPawed(c, f, PANTHER),
  jaguar: (c, f) => drawPawed(c, f, JAGUAR),
  'snow-leopard': (c, f) => drawPawed(c, f, SNOW_LEOPARD),
  'white-wolf': (c, f) => drawPawed(c, f, WHITE_WOLF),
  snake: (c, f) =>
    drawSerpent(c, f, {
      scale: blotched(ramp([120, 110, 60]), ramp([70, 64, 36]), 1.4),
      belly: ramp([200, 190, 140]),
      thick: 1.2,
      length: 12,
      cobra: false,
    }),
  'king-cobra': (c, f) =>
    drawSerpent(c, f, {
      scale: banded(ramp([120, 96, 50]), ramp([40, 34, 24]), 1.2),
      belly: ramp([214, 196, 130]),
      thick: 1,
      length: 13,
      cobra: true,
    }),
  python: (c, f) =>
    drawSerpent(c, f, {
      scale: blotched(ramp([150, 130, 80]), ramp([70, 54, 34]), 2),
      belly: ramp([214, 204, 160]),
      thick: 2.2,
      length: 34,
      cobra: false,
    }),
  scorpion: (c, f) => drawScorpion(c, f, 1, ramp([150, 104, 50])),
  'king-scorpion': (c, f) => drawScorpion(c, f, 1.8, ramp([60, 50, 56])),
  alligator: (c, f) => drawCrocodile(c, f, ramp([66, 78, 56]), 1.25),
  crocodile: (c, f) => drawCrocodile(c, f, ramp([98, 108, 64]), 1.4),
};
