import type { StaticKind } from '@fenix/shared';
import { PixelImage, type Rgb } from './pixel-art';
import { TREE_SHADOWS, drawTree, type TreeSpecies } from './tree-art';
import {
  VolumeCanvas,
  clipping,
  WorldProjection,
  axesAlong,
  metal,
  noise,
  ramp,
  solid,
  tone,
  type Material,
  type Ramp,
  type Vec3,
} from './volume';

/**
 * Lienzo de un objeto fijo, en pixeles de pantalla (se muestra sin escalar).
 * El rombo del tile donde está apoyado ocupa la parte de abajo: centro en
 * GROUND, y el resto es para lo que sube (árboles, paredes, faroles).
 */
export const STATIC_ART_WIDTH = 136;
export const STATIC_ART_HEIGHT = 168;
export const STATIC_GROUND = { x: 68, y: 146 } as const;
export const STATIC_VARIANTS = 3;

/** Objetos que marcan algo en el mapa pero no se dibujan (la montaña la dibuja el terreno). */
export const INVISIBLE_STATICS: ReadonlySet<StaticKind> = new Set<StaticKind>(['mountain']);

const OUTLINE: Rgb = [27, 19, 14];

/**
 * Medio lado del tile en el modelo: un paso en x se ve de largo 1 en la
 * diagonal de la pantalla, así el borde del tile (22 px en x y en y) mide 22·√2.
 */
const H = 22 * Math.SQRT2 * 0.5;

type Model = (c: VolumeCanvas, variant: number) => void;

/** Lienzo de un objeto fijo: medidas y dónde queda el punto de apoyo. */
export interface StaticFrame {
  readonly width: number;
  readonly height: number;
  readonly ground: { readonly x: number; readonly y: number };
}

const STANDARD_FRAME: StaticFrame = {
  width: STATIC_ART_WIDTH,
  height: STATIC_ART_HEIGHT,
  ground: STATIC_GROUND,
};

interface StaticSpec {
  readonly model: Model;
  /** Radios de la sombra en el suelo (en pixeles de pantalla). */
  readonly shadow?: readonly [number, number];
  /** Lienzo propio para los objetos grandes (el faro); si no, el de siempre. */
  readonly frame?: StaticFrame;
  /** Sin contorno: lo que va pegado al piso (una alfombra) se junta con el tile de al lado. */
  readonly flat?: boolean;
}

/** El lienzo en que se dibuja un objeto fijo. */
export function staticFrame(kind: StaticKind): StaticFrame {
  return SPECS[kind].frame ?? STANDARD_FRAME;
}

/** Dibuja un objeto fijo. Las variantes cambian detalles (copa, flores, piedras…). */
export function drawStatic(kind: StaticKind, variant: number): PixelImage {
  const spec = SPECS[kind];
  const frame = staticFrame(kind);
  const canvas = new VolumeCanvas(
    frame.width,
    frame.height,
    new WorldProjection(frame.ground.x, frame.ground.y),
  );
  spec.model(canvas, variant % STATIC_VARIANTS);
  const body = canvas.toImage(spec.flat ? null : OUTLINE);
  const image = new PixelImage(frame.width, frame.height);
  if (spec.shadow) softShadow(image, frame, spec.shadow[0], spec.shadow[1]);
  image.draw(body, 0, 0);
  return image;
}

/** Sombra difusa en el suelo, corrida a la derecha (la luz viene de la izquierda). */
function softShadow(image: PixelImage, frame: StaticFrame, rx: number, ry: number): void {
  const cx = frame.ground.x + rx * 0.25;
  const cy = frame.ground.y + ry * 0.2;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d < 1) image.set(x, y, [0, 0, 0], Math.round(90 * (1 - d) ** 1.5));
    }
  }
}

const UP: readonly [Vec3, Vec3, Vec3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** Cilindro vertical hecho de discos (barriles, troncos, pozos). */
function cylinder(
  c: VolumeCanvas,
  base: Vec3,
  height: number,
  radius: (t: number) => number,
  material: Material,
): void {
  const steps = Math.max(2, Math.ceil(height / 1.2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = radius(t);
    c.ellipsoid([base[0], base[1] + t * height, base[2]], UP, [r, 1, r], material);
  }
}

// ── Materiales ──────────────────────────────────────────────────────

const BARK = ramp([96, 66, 42]);
const STONE = ramp([150, 142, 128]);
const WOOD = ramp([132, 92, 54]);
const IRON = ramp([70, 72, 80]);
const BRICK = ramp([146, 74, 52]);

/** Corteza con vetas verticales. */
const bark: Material = (s) =>
  tone(
    BARK,
    s.light,
    noise(Math.floor(Math.atan2(s.p[2], s.p[0]) * 4), Math.floor(s.p[1] / 3)) > 0.7 ? -1 : 0,
  );

/** Follaje: matas de hojas con luz y sombra, según el ruido del lugar. */
function foliage(colors: Ramp, seed: number): Material {
  return (s) => {
    const clump = noise(
      Math.floor(s.p[0] / 2.5) + seed,
      Math.floor(s.p[1] / 2.5),
      Math.floor(s.p[2] / 2.5),
    );
    const bias = clump > 0.82 ? 1 : clump < 0.2 ? -1 : 0;
    return tone(colors, s.light, bias);
  };
}

/** Piedra con vetas y algo de musgo abajo. */
function rocky(colors: Ramp, seed: number): Material {
  return (s) => {
    const grain = noise(
      Math.floor(s.p[0] / 2) + seed,
      Math.floor(s.p[1] / 2),
      Math.floor(s.p[2] / 2),
    );
    if (s.p[1] < 3 && s.n[1] > 0.3 && grain > 0.6) return tone(ramp([78, 110, 54]), s.light);
    return tone(colors, s.light, grain > 0.85 ? 1 : grain < 0.15 ? -1 : 0);
  };
}

/** Madera con vetas a lo largo de `axis`. */
function planks(colors: Ramp, axis: 0 | 1 | 2, width = 4): Material {
  return (s) => {
    const across = axis === 1 ? s.p[0] + s.p[2] : s.p[1];
    const seam = Math.abs(((across + 100) % width) - width / 2) > width / 2 - 0.5;
    if (seam) return tone(colors, s.light, -1);
    const grain = noise(Math.floor((across + 100) / width), Math.floor(s.p[axis] / 3));
    return tone(colors, s.light, grain > 0.8 ? 1 : 0);
  };
}

/** Pared de piedra en hiladas: bloques con juntas, a lo largo de `along` (0 = x, 2 = z). */
function masonry(along: 0 | 2): Material {
  return (s) => {
    const course = Math.floor(s.p[1] / 6);
    const pos = s.p[along] + (course % 2) * 5 + 100;
    const inCourse = s.p[1] - course * 6;
    // Las caras laterales y el remate no llevan juntas verticales.
    const side = Math.abs(s.n[along]) > 0.6 || s.n[1] > 0.6;
    if (inCourse < 0.9 || (!side && pos % 10 < 0.9)) return tone(STONE, s.light, -1);
    const block = noise(Math.floor(pos / 10), course, along);
    return tone(STONE, s.light, block > 0.75 ? 1 : block < 0.2 ? -1 : 0);
  };
}

/** Material que brilla solo (fuego, cristales, el vidrio del farol). */
function glowing(colors: Ramp): Material {
  return (s) => tone(colors, 0.6 + s.light * 0.4);
}

// ── Vegetación ──────────────────────────────────────────────────────

const bush: Model = (c, variant) => {
  const leaves = foliage(ramp([70, 128, 54]), variant * 5);
  for (const [x, y, z, r] of [
    [-5, 6, 2, 7],
    [5, 6, -2, 7],
    [0, 10, 0, 7.5],
    [2, 5, 6, 6],
    [-3, 5, -6, 6],
  ] as const)
    c.sphere([x, y, z], r, leaves);
  if (variant !== 1) {
    // Bayas rojas.
    for (let i = 0; i < 7; i++) {
      const a = i * 2.3 + variant;
      c.sphere(
        [Math.cos(a) * 7, 7 + (i % 3) * 2, Math.sin(a) * 7],
        1.1,
        solid(ramp([190, 40, 50]), 1),
      );
    }
  }
};

const rock: Model = (c, variant) => {
  const material = rocky(STONE, variant * 11);
  c.ellipsoid([0, 4, 0], axesAlong([1, 0.15, 0.4 + variant * 0.2]), [10, 7, 8], material);
  c.ellipsoid([6, 3, 5], axesAlong([0.3, 0.1, 1]), [5, 4, 5], material);
  if (variant !== 0) c.ellipsoid([-7, 2, 4], axesAlong([1, 0, -0.5]), [4, 3, 4], material);
};

const flowers: Model = (c, variant) => {
  const colors: Rgb[] = [
    [232, 214, 90],
    [218, 116, 162],
    [240, 240, 232],
    [146, 120, 226],
  ];
  const stem = solid(ramp([60, 110, 46]));
  for (let i = 0; i < 14; i++) {
    const x = (noise(i, variant, 1) - 0.5) * 22;
    const z = (noise(i, variant, 2) - 0.5) * 22;
    const h = 3 + noise(i, variant, 3) * 4;
    c.limb([x, 0, z], [x, h, z], 0.4, 0.4, stem);
    const color = colors[Math.floor(noise(i, variant, 4) * colors.length)] ?? [255, 255, 255];
    c.sphere([x, h + 0.8, z], 1.3, solid(ramp(color), 1));
  }
};

// ── Construcciones ──────────────────────────────────────────────────

const WALL_HEIGHT = 48;
const WALL_THICK = 3;

/** Pared sobre el borde de atrás del tile que corre a lo largo de x (0) o z (2). */
function wall(c: VolumeCanvas, along: 0 | 2): void {
  const center: Vec3 =
    along === 0 ? [0, WALL_HEIGHT / 2, -H + WALL_THICK] : [-H + WALL_THICK, WALL_HEIGHT / 2, 0];
  const half: Vec3 =
    along === 0 ? [H, WALL_HEIGHT / 2, WALL_THICK] : [WALL_THICK, WALL_HEIGHT / 2, H];
  c.box(center, UP, half, masonry(along));
  // Remate algo más ancho y claro.
  const cap: Vec3 = along === 0 ? [H, 1.2, WALL_THICK + 0.8] : [WALL_THICK + 0.8, 1.2, H];
  c.box([center[0], WALL_HEIGHT + 1.2, center[2]], UP, cap, solid(STONE, 1));
}

const wallX: Model = (c) => wall(c, 0);
const wallY: Model = (c) => wall(c, 2);
const wallCorner: Model = (c) => {
  wall(c, 0);
  wall(c, 2);
};
const wallPost: Model = (c) => {
  c.box([-H + 4, WALL_HEIGHT / 2 + 1, -H + 4], UP, [4.5, WALL_HEIGHT / 2 + 1, 4.5], masonry(0));
  c.box([-H + 4, WALL_HEIGHT + 3, -H + 4], UP, [5.3, 1.4, 5.3], solid(STONE, 1));
};

/** Cerca de madera: dos postes y dos travesaños sobre el borde de atrás. */
function fence(c: VolumeCanvas, along: 0 | 2): void {
  const wood = planks(WOOD, 1);
  const at = (t: number, y: number): Vec3 => (along === 0 ? [t, y, -H + 1.5] : [-H + 1.5, y, t]);
  for (const t of [-H + 1.5, H - 1.5]) {
    c.box(at(t, 13), UP, [1.6, 13, 1.6], wood);
    c.box(at(t, 26.6), UP, [2, 0.8, 2], solid(WOOD, 1));
  }
  const rail = planks(WOOD, along, 2.5);
  for (const y of [9, 19]) c.box(at(0, y), UP, along === 0 ? [H, 1.3, 0.8] : [0.8, 1.3, H], rail);
}

const fenceX: Model = (c) => fence(c, 0);
const fenceY: Model = (c) => fence(c, 2);

// ── Objetos ─────────────────────────────────────────────────────────

const barrel: Model = (c) => {
  const height = 22;
  // Duelas con aros de hierro.
  const staves: Material = (s) => {
    const y = s.p[1];
    if (Math.abs(y - 4) < 1.1 || Math.abs(y - height + 4) < 1.1) return metal(IRON)(s);
    if (s.n[1] > 0.8) return planks(WOOD, 0, 3)(s);
    const stave = Math.floor((Math.atan2(s.p[2], s.p[0]) + Math.PI) * 3.2);
    return tone(WOOD, s.light, stave % 2 === 0 ? 0 : -1);
  };
  cylinder(c, [0, 0, 0], height, (t) => 8 + Math.sin(t * Math.PI) * 1.6, staves);
};

const crate: Model = (c, variant) => {
  const s = 9 + variant;
  const wood = ramp([168, 124, 76]);
  // Tablas y marco más oscuro en las aristas.
  const material: Material = (sample) => {
    const p = sample.p;
    const nearEdge =
      [
        Math.abs(Math.abs(p[0]) - s),
        Math.abs(Math.abs(p[2]) - s),
        Math.abs(p[1] - s * 2),
        Math.abs(p[1]),
      ].filter((d) => d < 1.6).length >= 2;
    if (nearEdge) return tone(ramp([110, 76, 44]), sample.light);
    return planks(wood, Math.abs(sample.n[0]) > 0.6 ? 2 : 0, 4)(sample);
  };
  c.box(
    [0, s, 0],
    axesAlong([Math.sin(variant * 0.3), 0, Math.cos(variant * 0.3)]),
    [s, s, s],
    material,
  );
};

const well: Model = (c) => {
  // Brocal de piedra, agua adentro, postes, techo de tejas y balde.
  cylinder(c, [0, 0, 0], 12, () => 12, rocky(STONE, 3));
  c.ellipsoid([0, 12.2, 0], UP, [9.5, 0.6, 9.5], (s) =>
    s.light > 0.85 ? [140, 190, 230] : tone(ramp([30, 70, 120]), 0.5),
  );
  const wood = planks(WOOD, 1);
  for (const x of [-11, 11]) c.box([x, 26, 0], UP, [1.6, 16, 1.6], wood);
  c.box([0, 36, 0], UP, [12, 1, 1], solid(WOOD, -1));
  c.limb([0, 36, 0], [0, 24, 0], 0.3, 0.3, solid(ramp([200, 180, 140])));
  cylinder(c, [0, 20, 0], 4, () => 2.4, solid(WOOD));
  const tiles = ramp([156, 66, 50]);
  const roof: Material = (s) => tone(tiles, s.light, Math.floor(s.p[1] / 2) % 2 === 0 ? 0 : -1);
  for (const side of [1, -1]) {
    c.polygon(
      [
        [-14, 42, 0],
        [14, 42, 0],
        [14, 34, side * 12],
        [-14, 34, side * 12],
      ],
      roof,
    );
  }
};

const lamp: Model = (c) => {
  const iron = metal(IRON);
  c.box([0, 1.5, 0], UP, [3.5, 1.5, 3.5], iron);
  cylinder(c, [0, 3, 0], 50, (t) => 1.2 - t * 0.3, iron);
  // Farol: marco de hierro, vidrio encendido y sombrerete.
  c.box([0, 59, 0], UP, [4.5, 6, 4.5], glowing(ramp([255, 214, 120])));
  for (const [x, z] of [
    [-4.5, -4.5],
    [4.5, -4.5],
    [-4.5, 4.5],
    [4.5, 4.5],
  ] as const)
    c.box([x, 59, z], UP, [0.7, 6.2, 0.7], iron);
  c.limb([0, 66, 0], [0, 70, 0], 5.5, 1, iron);
  c.sphere([0, 59, 0], 2.2, glowing(ramp([255, 246, 200])));
};

const sign: Model = (c) => {
  const wood = planks(WOOD, 1);
  c.box([-6, 15, 0], UP, [1.3, 15, 1.3], wood);
  c.box([0, 24, 0], axesAlong([1, 0, -1]), [1, 6, 9], planks(ramp([150, 106, 62]), 1, 3));
};

const shrine: Model = (c) => {
  const stone = ramp([152, 148, 164]);
  const rune = ramp([110, 176, 246]);
  c.box([0, 2, 0], UP, [13, 2, 13], rocky(stone, 2));
  c.box([0, 6, 0], UP, [10, 2, 10], rocky(stone, 4));
  c.box([0, 16, 0], UP, [6, 8, 6], (s) =>
    Math.abs(s.p[1] - 16) < 0.8 || Math.abs(s.p[1] - 20) < 0.8
      ? glowing(rune)(s)
      : rocky(stone, 6)(s),
  );
  // Cristal: dos pirámides unidas, que brilla.
  const crystal = glowing(ramp([120, 190, 250]));
  const top: Vec3 = [0, 44, 0];
  const bottom: Vec3 = [0, 25, 0];
  const ring: Vec3[] = [0, 1, 2, 3].map((i) => [
    Math.cos((i * Math.PI) / 2) * 5,
    34,
    Math.sin((i * Math.PI) / 2) * 5,
  ]);
  for (let i = 0; i < 4; i++) {
    const a = ring[i] ?? top;
    const b = ring[(i + 1) % 4] ?? top;
    c.polygon([top, a, b], crystal);
    c.polygon([bottom, a, b], crystal);
  }
};

const forge: Model = (c) => {
  const bricks: Material = (s) => {
    const course = Math.floor(s.p[1] / 3);
    const along = (Math.abs(s.n[0]) > 0.6 ? s.p[2] : s.p[0]) + (course % 2) * 2.5 + 100;
    if (s.p[1] - course * 3 < 0.6 || along % 5 < 0.6) return tone(ramp([90, 80, 72]), s.light);
    return tone(BRICK, s.light, noise(Math.floor(along / 5), course) > 0.75 ? 1 : 0);
  };
  c.box([0, 11, 0], UP, [13, 11, 11], bricks);
  // Boca del fuego al frente.
  c.box([4, 8, 6], UP, [6, 4, 5.5], glowing(ramp([255, 150, 50])));
  c.sphere([4, 7, 9], 3, glowing(ramp([255, 220, 120])));
  // Chimenea.
  c.box([-5, 34, -4], UP, [4.5, 12, 4.5], bricks);
  c.box([-5, 46.5, -4], UP, [5.3, 1, 5.3], solid(ramp([90, 80, 72])));
};

const anvil: Model = (c) => {
  const iron = metal(ramp([92, 96, 108]));
  cylinder(
    c,
    [0, 0, 0],
    9,
    () => 6,
    (s) =>
      s.n[1] > 0.8
        ? tone(ramp([160, 120, 80]), s.light, Math.hypot(s.p[0], s.p[2]) % 2 < 0.6 ? -1 : 0)
        : bark(s),
  );
  c.box([0, 11.5, 0], UP, [3, 2.5, 2.2], iron);
  c.box([0, 15.5, 0], UP, [8, 1.8, 3.2], iron);
  // Cuerno del yunque.
  c.limb([8, 15.5, 0], [13, 15.8, 0], 2.2, 0.5, iron);
};

// ── Mazmorra ────────────────────────────────────────────────────────

const CAVE_ROCK = ramp([92, 84, 76]);
const BONE = ramp([214, 204, 178]);

/** Roca de cueva: oscura, con vetas y alguna gota de humedad que brilla. */
function caveRock(seed: number): Material {
  return (s) => {
    const grain = noise(
      Math.floor(s.p[0] / 3) + seed,
      Math.floor(s.p[1] / 2.5),
      Math.floor(s.p[2] / 3),
    );
    if (grain > 0.97 && s.light > 0.6) return [170, 176, 184];
    return tone(CAVE_ROCK, s.light, grain > 0.8 ? 1 : grain < 0.25 ? -1 : 0);
  };
}

/** Cara de roca: estratos irregulares y manchas; arriba, la roca maciza casi negra. */
function rockFace(seed: number): Material {
  return (s) => {
    if (s.n[1] > 0.6) {
      const grain = noise(Math.floor(s.p[0] / 3), Math.floor(s.p[2] / 3), seed);
      return tone(ramp([44, 40, 38]), 0.5, grain > 0.75 ? 1 : 0);
    }
    const along = s.p[0] + s.p[2] + 100;
    const wobble = noise(Math.floor(along / 5), seed) * 4;
    const height = s.p[1] + wobble;
    const stratum = Math.floor(height / 6);
    const patch = noise(Math.floor(along / 4), stratum, seed);
    if (height % 6 < 0.8) return tone(CAVE_ROCK, s.light, -1);
    return tone(CAVE_ROCK, s.light, patch > 0.72 ? 1 : patch < 0.22 ? -1 : 0);
  };
}

/** Pared de cueva: un bloque de roca que llena el tile, como las cuevas de UO. */
const caveWall: Model = (c, variant) => {
  c.box([0, 19, 0], UP, [H, 19, H], rockFace(variant * 7));
};

/** Boca de una cueva: un peñasco grande con un hueco oscuro que mira al frente. */
const caveEntrance: Model = (c) => {
  const material = rocky(ramp([128, 118, 106]), 5);
  const front = axesAlong([1, 0, 1]);
  // Peñasco principal y hombros de roca a los costados.
  c.ellipsoid([-8, 14, -8], front, [26, 24, 14], material);
  c.ellipsoid([-2, 30, -10], axesAlong([1, 0.2, 0.6]), [14, 10, 10], material);
  c.ellipsoid([10, 8, -14], axesAlong([0.4, 0, 1]), [9, 9, 9], material);
  c.ellipsoid([-14, 7, 10], axesAlong([1, 0, 0.3]), [9, 8, 8], material);
  c.ellipsoid([12, 4, 8], axesAlong([1, 0.2, 0.2]), [5, 4, 5], material);
  // La boca: un arco negro con un borde de piedra más clara.
  c.ellipsoid([1, 11, 1], front, [12.5, 15, 3], solid(ramp([96, 88, 80]), -1));
  c.ellipsoid([2.5, 10, 2.5], front, [10, 13, 3], (s) => tone(ramp([22, 18, 16]), s.light * 0.15));
  // El suelo de la entrada baja y se oscurece.
  c.ellipsoid([5, 0.4, 5], front, [9, 0.8, 6], (s) => tone(ramp([46, 38, 32]), s.light * 0.4));
};

/** Escalera de madera apoyada contra la roca, para volver a la superficie. */
const ladder: Model = (c) => {
  const wood = planks(WOOD, 1);
  c.ellipsoid([0, 24, -H + 2], UP, [H, 26, 5], caveRock(3));
  for (const x of [-6, 6]) c.limb([x, 0, -4], [x, 54, -H + 5], 1.4, 1.2, wood);
  for (let i = 1; i <= 8; i++) {
    const t = i / 9;
    const z = -4 + t * (-H + 9);
    c.limb([-6, t * 54, z], [6, t * 54, z], 0.9, 0.9, solid(WOOD, 1));
  }
};

/** Brasero: cuenco de hierro sobre un trípode, con fuego que ilumina. */
const brazier: Model = (c) => {
  const iron = metal(IRON);
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 + 0.4;
    c.limb(
      [Math.cos(a) * 7, 0, Math.sin(a) * 7],
      [Math.cos(a) * 3, 16, Math.sin(a) * 3],
      1,
      1,
      iron,
    );
  }
  cylinder(c, [0, 16, 0], 6, (t) => 4 + t * 4, iron);
  const fire = glowing(ramp([255, 150, 50]));
  c.ellipsoid([0, 23, 0], UP, [6, 3, 6], fire);
  c.limb([0, 23, 0], [1, 34, -1], 4, 0.5, glowing(ramp([255, 200, 90])));
  c.limb([-2, 23, 1], [-3, 30, 2], 2.4, 0.4, glowing(ramp([255, 230, 150])));
};

/** Huesos sueltos y un cráneo en el suelo. */
const bones: Model = (c, variant) => {
  const bone = solid(BONE);
  for (let i = 0; i < 5; i++) {
    const x = (noise(i, variant, 21) - 0.5) * 20;
    const z = (noise(i, variant, 22) - 0.5) * 20;
    const a = noise(i, variant, 23) * Math.PI;
    const len = 4 + noise(i, variant, 24) * 4;
    const dx = Math.cos(a) * len;
    const dz = Math.sin(a) * len;
    c.limb([x - dx, 0.8, z - dz], [x + dx, 0.8, z + dz], 0.7, 0.7, bone);
    c.sphere([x - dx, 0.9, z - dz], 1.1, bone);
    c.sphere([x + dx, 0.9, z + dz], 1.1, bone);
  }
  c.sphere([3, 3, 2], 3.2, bone);
  c.ellipsoid([3, 2, 4.6], UP, [2.2, 1.2, 1], solid(BONE, -1));
  for (const x of [1.8, 4.2]) c.sphere([x, 3.4, 4.8], 0.8, solid(ramp([30, 26, 22])));
};

/** Sarcófago de piedra: caja tallada con tapa y una figura yacente apenas marcada. */
const sarcophagus: Model = (c, variant) => {
  const stone = rocky(ramp([132, 128, 124]), variant * 7 + 3);
  const facing = axesAlong([1, 0, 1]);
  c.box([0, 5, 0], facing, [8, 5, 15], stone);
  c.box([0, 11, 0], facing, [9, 1.4, 16], rocky(ramp([150, 146, 140]), variant + 11));
  // La figura de la tapa: cabeza y manos cruzadas.
  const relief = solid(ramp([118, 114, 110]));
  c.sphere([-7 * Math.SQRT1_2, 13, -7 * Math.SQRT1_2], 2.4, relief);
  c.ellipsoid([1, 13, 1], facing, [3, 1, 6], relief);
};

/** Reja de la alcantarilla: un aro de hierro en el piso con barrotes y oscuridad abajo. */
const sewerGrate: Model = (c) => {
  c.ellipsoid([0, 0.3, 0], UP, [10, 0.4, 10], solid(ramp([20, 18, 18])));
  const iron = metal(IRON);
  c.ellipsoid(
    [0, 0.8, 0],
    UP,
    [11, 0.6, 11],
    clipping((s) => (Math.hypot(s.p[0], s.p[2]) > 9 ? iron(s) : null)),
  );
  for (let k = -6; k <= 6; k += 3) {
    const half = Math.sqrt(Math.max(0, 81 - k * k));
    c.limb([k, 1, -half], [k, 1, half], 0.8, 0.8, iron);
  }
};

/** Telaraña en un rincón: hilos finos que brillan apenas. */
const cobweb: Model = (c, variant) => {
  const silk = solid(ramp([214, 214, 220]));
  const top: Vec3 = [-H + 2, 26, -H + 2];
  for (let i = 0; i < 6; i++) {
    const a = (i / 5) * (Math.PI / 2);
    c.limb(
      top,
      [-H + 2 + Math.cos(a) * 16, 26 - Math.sin(a) * 18 - variant * 2, -H + 2 + Math.sin(a) * 4],
      0.25,
      0.2,
      silk,
    );
  }
  for (const r of [5, 10, 14])
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * (Math.PI / 2);
      const b = ((i + 1) / 5) * (Math.PI / 2);
      const at = (t: number): Vec3 => [
        -H + 2 + Math.cos(t) * r,
        26 - Math.sin(t) * r * 1.1,
        -H + 2 + Math.sin(t) * r * 0.25,
      ];
      c.limb(at(a), at(b), 0.2, 0.2, silk);
    }
};

/**
 * Barco amarrado (3 × 3 tiles de agua): casco de tablas que se hunde en el
 * agua, cubierta con borda, dos mástiles con velas recogidas a medias, el
 * bauprés adelante, un farol en la popa y la bandera arriba. El pirata
 * tiene casco oscuro, velas negras y bandera con calavera.
 */
function ship(pirate: boolean): Model {
  return (c) => {
    const along = axesAlong([1, 0, 0]);
    const hullWood = pirate ? ramp([64, 44, 34]) : ramp([128, 84, 48]);
    const stripe = pirate ? ramp([120, 30, 30]) : ramp([196, 170, 90]);
    const hull = clipping((s) => {
      if (s.p[1] < 0) return null;
      if (Math.abs(s.p[1] - 13) < 1.2) return tone(stripe, s.light);
      return tone(hullWood, s.light, Math.floor(s.p[1] / 3) % 2 ? -1 : 0);
    });
    // Casco: largo a lo ancho del tile, con proa afinada.
    c.ellipsoid([0, 6, 0], along, [22, 18, 66], hull);
    c.ellipsoid([40, 10, 0], along, [15, 14, 34], hull);
    // Cubierta y borda.
    const deck = planks(ramp([170, 130, 84]), 2, 2);
    c.box([0, 23, 0], along, [17, 1.2, 58], deck);
    for (const side of [1, -1]) c.box([0, 26, side * 17], along, [1, 2.6, 58], solid(hullWood, 1));
    // Castillo de popa.
    c.box([-46, 30, 0], along, [17, 7, 14], hull);
    c.box([-46, 38, 0], along, [17, 1, 14], deck);
    // Bauprés.
    c.limb([66, 26, 0], [96, 42, 0], 1.6, 0.8, solid(WOOD));
    // Mástiles y velas.
    const sail = pirate ? ramp([40, 38, 40]) : ramp([232, 226, 206]);
    for (const [x, h] of [
      [14, 118],
      [-18, 100],
    ] as const) {
      c.limb([x, 23, 0], [x, h, 0], 2.2, 1.6, solid(WOOD));
      c.limb([x, h - 30, -24], [x, h - 30, 24], 1, 1, solid(WOOD));
      // Vela: un paño apenas inflado colgando de la verga.
      c.polygon(
        [
          [x + 2, h - 30, -22],
          [x + 2, h - 30, 22],
          [x + 7, h - 70, 20],
          [x + 7, h - 70, -20],
        ],
        (s) => tone(sail, 0.45 + s.light * 0.55, Math.abs(s.p[2]) < 1 ? -1 : 0),
      );
    }
    // Bandera arriba del palo mayor.
    const flag = pirate ? ramp([30, 28, 30]) : ramp([170, 40, 40]);
    c.polygon(
      [
        [14, 118, 0],
        [14, 108, 0],
        [-2, 111, 1],
        [-2, 117, 1],
      ],
      solid(flag),
    );
    if (pirate) c.sphere([5, 113, 1.5], 1.6, solid(ramp([230, 226, 214])));
    // Farol de popa.
    c.sphere([-60, 42, 0], 2.4, glowing(ramp([255, 200, 100])));
  };
}

/** Poste de madera del muelle, con un cabo enrollado. */
const pierPost: Model = (c) => {
  c.limb([0, -4, 0], [0, 20, 0], 3, 2.6, solid(WOOD));
  c.ellipsoid([0, 14, 0], UP, [3.8, 1.6, 3.8], solid(ramp([196, 176, 130])));
};

/** Estalagmita: un cono de roca que sube del suelo. */
const stalagmite: Model = (c, variant) => {
  const material = caveRock(variant * 5 + 2);
  cylinder(c, [0, 0, 0], 30 + variant * 6, (t) => 7 * (1 - t) ** 1.2 + 0.6, material);
  if (variant !== 0) cylinder(c, [7, 0, 4], 14, (t) => 4 * (1 - t) + 0.4, material);
};

// ── Lugares del mundo ───────────────────────────────────────────────

/**
 * La montaña es terreno elevado (la ladera de roca la dibuja el terreno): el
 * objeto que la marca no se ve. Encima van riscos sueltos, cada uno distinto.
 */
const mountain: Model = () => {};

/** Roca de los riscos: gris pardo con vetas, más clara arriba. */
function cragRock(seed: number): Material {
  const base = ramp([126, 116, 104]);
  return (s) => {
    const vein =
      Math.sin(s.p[1] * 0.5 + noise(Math.floor(s.p[0] / 3), Math.floor(s.p[2] / 3), seed) * 4) >
      0.86;
    const moss =
      s.n[1] > 0.6 && noise(Math.floor(s.p[0] / 2), Math.floor(s.p[2] / 2), seed + 1) > 0.72;
    if (moss) return tone(ramp([106, 116, 74]), s.light);
    return tone(base, s.light, vein ? -1 : s.p[1] > 40 ? 1 : 0);
  };
}

/**
 * Un risco: lajas de roca apiladas e inclinadas alrededor de un centro, de
 * alturas distintas (`shape` cambia cuántas, qué tan altas y qué tan
 * abiertas: un peñón, una aguja o un peñasco ancho y bajo).
 */
function crag(shape: { count: number; tall: number; spread: number; width: number }): Model {
  return (c, variant) => {
    const rock = cragRock(variant * 7 + shape.count);
    const dark = rocky(ramp([96, 88, 80]), variant * 11 + 5);
    c.ellipsoid([0, 3, 0], UP, [H * 0.9 * shape.spread, 6, H * 0.9 * shape.spread], dark);
    for (let i = 0; i < shape.count; i++) {
      const seed = i * 13 + variant * 101 + shape.count * 7;
      const angle = noise(seed, 1, 61) * Math.PI * 2;
      const reach = i === 0 ? 0 : (4 + noise(seed, 2, 62) * 9) * shape.spread;
      const x = Math.cos(angle) * reach;
      const z = Math.sin(angle) * reach;
      const height = shape.tall * (i === 0 ? 1 : 0.35 + noise(seed, 3, 63) * 0.5);
      const turn = noise(seed, 4, 64) * Math.PI;
      const lean = (noise(seed, 5, 65) - 0.5) * 0.6 - x / 40;
      const axes = axesAlong(
        [Math.cos(turn), 0, Math.sin(turn)],
        [lean, 1, (noise(seed, 6, 66) - 0.5) * 0.5],
      );
      const w = shape.width * (0.7 + noise(seed, 7, 67) * 0.6);
      // Una laja: ancha abajo y afinada arriba (dos bloques y una punta).
      c.box([x, height * 0.3, z], axes, [w, height * 0.3, w * 0.75], i % 2 ? rock : dark);
      c.box([x, height * 0.72, z], axes, [w * 0.7, height * 0.18, w * 0.55], rock);
      c.ellipsoid([x, height * 0.9, z], axes, [w * 0.5, height * 0.12, w * 0.45], rock);
    }
    // Piedras sueltas al pie.
    for (let k = 0; k < 3; k++) {
      const a = noise(k, variant, 71) * Math.PI * 2;
      const r = H * 0.8 * shape.spread;
      c.ellipsoid([Math.cos(a) * r, 1.5, Math.sin(a) * r], UP, [2.4, 1.8, 2], dark);
    }
  };
}

/** Cactus columnar con dos brazos, costillas a lo largo y espinas. */
const cactus: Model = (c, variant) => {
  const green = ramp([78, 128, 66]);
  const ribbed: Material = (s) => {
    const rib = Math.floor((Math.atan2(s.p[2], s.p[0]) + Math.PI) * 2.6);
    if (noise(Math.floor(s.p[0] * 2), Math.floor(s.p[1] * 2), Math.floor(s.p[2] * 2)) > 0.95)
      return [232, 224, 190];
    return tone(green, s.light, rib % 2 === 0 ? 0 : -1);
  };
  const height = 50 + variant * 6;
  cylinder(c, [0, 0, 0], height, (t) => 5.2 - t * 0.6 + (t > 0.94 ? (t - 0.94) * -30 : 0), ribbed);
  for (const [side, at, reach] of [
    [1, 0.38, 12],
    [-1, 0.52 - variant * 0.05, 11],
  ] as const) {
    const y = height * at;
    c.limb([0, y, 0], [side * reach, y + 2, side * reach * 0.3], 3.6, 3.4, ribbed);
    cylinder(
      c,
      [side * reach, y + 2, side * reach * 0.3],
      18 + variant * 3,
      (t) => 3.4 - t * 0.5,
      ribbed,
    );
  }
};

/** Carpa de cuero del campamento orco: dos faldones, palos y la entrada oscura. */
const tent: Model = (c, variant) => {
  const hide = ramp(variant === 2 ? [118, 92, 70] : [146, 116, 80]);
  const patched: Material = (s) => {
    const patch = noise(Math.floor(s.p[0] / 6), Math.floor(s.p[1] / 6), Math.floor(s.p[2] / 6));
    return tone(hide, s.light, patch > 0.8 ? -1 : 0);
  };
  const ridge = 30;
  for (const side of [1, -1]) {
    c.polygon(
      [
        [-16, ridge, 0],
        [16, ridge, 0],
        [18, 0, side * 16],
        [-18, 0, side * 16],
      ],
      patched,
    );
  }
  // El fondo cerrado y la entrada abierta al frente (hacia la cámara, en x).
  c.polygon(
    [
      [-16, ridge, 0],
      [-18, 0, 16],
      [-18, 0, -16],
    ],
    patched,
  );
  c.polygon(
    [
      [16.2, ridge - 2, 0],
      [18.2, 0, 9],
      [18.2, 0, -9],
    ],
    () => [26, 20, 16],
  );
  const pole = solid(ramp([96, 70, 44]));
  for (const x of [-17, 17]) c.limb([x, 0, 0], [x * 0.95, ridge + 6, 0], 0.9, 0.7, pole);
  c.limb([-18, ridge + 1, 0], [18, ridge + 1, 0], 0.8, 0.8, pole);
};

/** Fogata: piedras en ronda, leños cruzados y el fuego, que alumbra. */
const campfire: Model = (c) => {
  const stones = rocky(ramp([118, 110, 100]), 9);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.ellipsoid([Math.cos(a) * 8, 1.4, Math.sin(a) * 8], UP, [2.4, 1.8, 2.2], stones);
  }
  const log = solid(ramp([88, 60, 38]));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + 0.3;
    c.limb(
      [Math.cos(a) * 6, 1.2, Math.sin(a) * 6],
      [-Math.cos(a) * 1.5, 6, -Math.sin(a) * 1.5],
      1.3,
      1,
      log,
    );
  }
  c.ellipsoid([0, 2, 0], UP, [4.5, 2, 4.5], glowing(ramp([255, 120, 40])));
  c.limb([0, 4, 0], [0.6, 15, -0.4], 3.4, 0.4, glowing(ramp([255, 170, 60])));
  c.limb([-1.5, 4, 1], [-2, 11, 1.4], 2, 0.3, glowing(ramp([255, 220, 130])));
};

/** Lápida de piedra con la cruz grabada y el montículo de tierra adelante. */
const gravestone: Model = (c, variant) => {
  const stone = rocky(ramp([146, 142, 136]), variant * 3 + 1);
  const lean = axesAlong([1, 0, 1], [0.08 * (variant - 1), 1, 0]);
  c.box([-4, 9, -4], lean, [6, 9, 2], stone);
  c.ellipsoid([-4 + (variant - 1) * 0.6, 18, -4], lean, [6, 3.4, 2], stone);
  const engraved = solid(ramp([70, 68, 64]));
  c.box([-2.1, 12, -2.1], lean, [0.6, 4, 0.3], engraved);
  c.box([-2.1, 13.2, -2.1], lean, [2.2, 0.6, 0.3], engraved);
  c.ellipsoid([5, 0.6, 5], axesAlong([1, 0, 1]), [10, 1.6, 5], solid(ramp([96, 78, 58])));
};

/**
 * Faro: una torre alta de piedra a franjas blancas y rojas, sobre una base de
 * mampostería de 2 × 2 tiles con puerta; arriba, el balcón con baranda, la
 * linterna que alumbra y el techo de hierro. Se ve desde lejos.
 */
const lighthouse: Model = (c) => {
  const height = 210;
  const base = 2 * H * 0.92;
  const banded: Material = (s) => {
    const band = Math.floor(s.p[1] / 26) % 2;
    const colors = band === 0 ? ramp([226, 222, 212]) : ramp([176, 60, 50]);
    const course = Math.abs((s.p[1] % 5) - 2.5) > 2.1 ? -1 : 0;
    return tone(colors, s.light, course);
  };
  // Base cuadrada que ocupa los cuatro tiles, con zócalo y cornisa.
  c.box([0, 9, 0], axesAlong([0, 0, 1]), [base, 9, base], masonry(0));
  c.box([0, 19, 0], axesAlong([0, 0, 1]), [base * 0.96, 1.4, base * 0.96], rocky(STONE, 4));
  cylinder(c, [0, 20, 0], 10, () => 24, rocky(STONE, 2));
  // La torre se afina al subir.
  cylinder(c, [0, 30, 0], height - 30, (t) => 21 - t * 8, banded);
  // Puerta y ventanitas.
  const wood = solid(ramp([70, 50, 34]));
  c.box([base * 0.7, 8, base * 0.7], axesAlong([1, 0, 1]), [5, 8, 0.8], wood);
  const glass = glowing(ramp([255, 220, 130]));
  for (const k of [0.3, 0.5, 0.7]) {
    const y = 30 + (height - 30) * k;
    const r = 21 - k * 8;
    c.box([r * 0.72, y, r * 0.72], axesAlong([1, 0, 1]), [1.6, 3, 0.4], glass);
  }
  // Balcón con baranda.
  c.ellipsoid([0, height + 2, 0], UP, [17, 2.2, 17], metal(IRON));
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    c.limb(
      [Math.cos(a) * 15.5, height + 3, Math.sin(a) * 15.5],
      [Math.cos(a) * 15.5, height + 9, Math.sin(a) * 15.5],
      0.45,
      0.45,
      metal(IRON),
    );
  }
  // Linterna vidriada que brilla, con parantes.
  cylinder(c, [0, height + 3, 0], 16, () => 9, glowing(ramp([255, 230, 140])));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.limb(
      [Math.cos(a) * 9.4, height + 3, Math.sin(a) * 9.4],
      [Math.cos(a) * 9.4, height + 19, Math.sin(a) * 9.4],
      0.6,
      0.6,
      metal(IRON),
    );
  }
  cylinder(c, [0, height + 19, 0], 12, (t) => 11 * (1 - t) + 0.5, solid(ramp([60, 64, 70])));
  c.sphere([0, height + 32, 0], 1.6, metal(IRON));
};

/** Escombros: bloques de piedra caídos de una construcción en ruinas. */
const rubble: Model = (c, variant) => {
  for (let i = 0; i < 6; i++) {
    const x = (noise(i, variant, 41) - 0.5) * 24;
    const z = (noise(i, variant, 42) - 0.5) * 24;
    const size = 2 + noise(i, variant, 43) * 3.5;
    const turn = noise(i, variant, 44) * Math.PI;
    c.box(
      [x, size * 0.8, z],
      axesAlong([Math.cos(turn), 0.15, Math.sin(turn)]),
      [size * 1.4, size * 0.8, size],
      masonry(0),
    );
  }
};

/** Juncos y totoras: hojas finas y altas con las espigas marrones. */
const reeds: Model = (c, variant) => {
  const leaf = solid(ramp([96, 132, 62]));
  const dark = solid(ramp([70, 102, 50]));
  const head = solid(ramp([110, 72, 44]));
  for (let i = 0; i < 16; i++) {
    const x = (noise(i, variant, 51) - 0.5) * 18;
    const z = (noise(i, variant, 52) - 0.5) * 18;
    const h = 14 + noise(i, variant, 53) * 14;
    const lean: Vec3 = [
      x + (noise(i, variant, 54) - 0.5) * 6,
      h,
      z + (noise(i, variant, 55) - 0.5) * 6,
    ];
    c.limb([x, 0, z], lean, 0.7, 0.3, i % 3 === 0 ? dark : leaf);
    if (i % 4 === 0) c.ellipsoid(lean, UP, [0.9, 2.6, 0.9], head);
  }
};

// ── Plantas y piedras por bioma ─────────────────────────────────────

/** Matas de hojas finas que se arquean (pastizal, yuyos): `colors` da el verde de cada mata. */
function blades(
  c: VolumeCanvas,
  variant: number,
  count: number,
  spread: number,
  height: [number, number],
  colors: readonly Rgb[],
  seed: number,
): void {
  for (let i = 0; i < count; i++) {
    const x = (noise(i, variant, seed) - 0.5) * spread;
    const z = (noise(i, variant, seed + 1) - 0.5) * spread;
    const h = height[0] + noise(i, variant, seed + 2) * (height[1] - height[0]);
    const bend = (noise(i, variant, seed + 3) - 0.5) * h * 0.7;
    const color = colors[Math.floor(noise(i, variant, seed + 4) * colors.length)] ?? [90, 130, 60];
    const mid: Vec3 = [x + bend * 0.4, h * 0.6, z + bend * 0.2];
    const tip: Vec3 = [x + bend, h, z + bend * 0.5];
    const material = solid(ramp(color));
    c.limb([x, 0, z], mid, 0.6, 0.45, material);
    c.limb(mid, tip, 0.45, 0.15, material);
  }
}

/** Pastizal: pasto alto en mata, verde o pajizo según la variante. */
const tallGrass: Model = (c, variant) => {
  const palettes: Rgb[][] = [
    [
      [86, 132, 56],
      [104, 148, 62],
      [70, 112, 46],
    ],
    [
      [168, 150, 86],
      [190, 170, 100],
      [140, 132, 70],
    ],
    [
      [112, 140, 60],
      [150, 156, 78],
      [92, 124, 52],
    ],
  ];
  blades(c, variant, 34, 26, [14, 28], palettes[variant] ?? palettes[0] ?? [], 61);
};

/** Yuyos: hierbas de hoja ancha, una espiga y alguna flor chica. */
const weeds: Model = (c, variant) => {
  const leaf = ramp([80, 126, 58]);
  for (let i = 0; i < 7; i++) {
    const a = noise(i, variant, 71) * Math.PI * 2;
    const r = noise(i, variant, 72) * 9;
    const base: Vec3 = [Math.cos(a) * r, 0, Math.sin(a) * r];
    const tip: Vec3 = [
      base[0] + Math.cos(a) * 5,
      3 + noise(i, variant, 73) * 4,
      base[2] + Math.sin(a) * 5,
    ];
    c.ellipsoid(
      [(base[0] + tip[0]) / 2, tip[1] * 0.6, (base[2] + tip[2]) / 2],
      axesAlong([Math.cos(a), 0.5, Math.sin(a)]),
      [3.6, 0.5, 1.6],
      solid(leaf, noise(i, variant, 74) > 0.5 ? 0 : -1),
    );
  }
  blades(c, variant, 8, 14, [12, 20], [[98, 120, 58]], 75);
  const flower: Rgb =
    variant === 0 ? [236, 220, 90] : variant === 1 ? [240, 240, 236] : [190, 120, 210];
  for (let i = 0; i < 3; i++)
    c.sphere(
      [(noise(i, variant, 76) - 0.5) * 12, 14 + i * 2, (noise(i, variant, 77) - 0.5) * 12],
      1.6,
      solid(ramp(flower), 1),
    );
};

/** Helecho: frondas que salen del centro y se arquean, con folíolos. */
const fern: Model = (c, variant) => {
  const leaf = ramp(variant === 2 ? [60, 110, 50] : [72, 132, 58]);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + variant;
    const out: Vec3 = [Math.cos(a), 0, Math.sin(a)];
    let p: Vec3 = [0, 1, 0];
    let d: Vec3 = normalize3([out[0], 1.4, out[2]]);
    for (let k = 0; k < 6; k++) {
      d = normalize3([d[0], d[1] - 0.32, d[2]]);
      const q: Vec3 = [p[0] + d[0] * 3.8, p[1] + d[1] * 3.8, p[2] + d[2] * 3.8];
      c.limb(p, q, 0.35, 0.25, solid(leaf, -1));
      c.ellipsoid(
        q,
        axesAlong([-d[2], 0.2, d[0]]),
        [4.4 - k * 0.55, 0.5, 1.4],
        solid(leaf, k % 2 === 0 ? 0 : 1),
      );
      p = q;
    }
  }
};

/** Hongos: un grupo de sombreritos sobre tallos claros (rojos con pintas, o pardos). */
const mushrooms: Model = (c, variant) => {
  const capColor: Rgb =
    variant === 0 ? [196, 46, 40] : variant === 1 ? [150, 106, 66] : [216, 180, 120];
  const stem = solid(ramp([226, 216, 196]));
  for (let i = 0; i < 6; i++) {
    const x = (noise(i, variant, 81) - 0.5) * 16;
    const z = (noise(i, variant, 82) - 0.5) * 16;
    const h = 3 + noise(i, variant, 83) * 5;
    const r = 2.2 + noise(i, variant, 84) * 2.6;
    c.limb([x, 0, z], [x, h, z], r * 0.4, r * 0.35, stem);
    c.ellipsoid([x, h, z], UP, [r, r * 0.55, r], (s) => {
      if (
        variant === 0 &&
        s.n[1] > 0.4 &&
        noise(Math.floor(s.p[0] * 2), Math.floor(s.p[2] * 2), i) > 0.82
      )
        return [244, 240, 232];
      return tone(ramp(capColor), s.light);
    });
  }
};

/** Florcitas: flores chiquitas y bajas, salpicadas en el pasto. */
const wildflowers: Model = (c, variant) => {
  const colors: Rgb[][] = [
    [
      [246, 246, 240],
      [250, 220, 80],
    ],
    [
      [176, 120, 230],
      [120, 150, 240],
    ],
    [
      [240, 120, 90],
      [250, 200, 70],
    ],
  ];
  const palette = colors[variant] ?? colors[0] ?? [];
  const stem = solid(ramp([70, 120, 50]));
  for (let i = 0; i < 18; i++) {
    const x = (noise(i, variant, 91) - 0.5) * 24;
    const z = (noise(i, variant, 92) - 0.5) * 24;
    const h = 2.5 + noise(i, variant, 93) * 3.5;
    c.limb([x, 0, z], [x, h, z], 0.3, 0.3, stem);
    const color = palette[i % palette.length] ?? [255, 255, 255];
    c.sphere([x, h + 0.6, z], 1.4, solid(ramp(color), 1));
  }
};

/** Peyote: cactus redondos y bajos, con gajos y una flor rosada arriba. */
const peyote: Model = (c, variant) => {
  const green = ramp([108, 140, 112]);
  const ribbed =
    (cx: number, cz: number): Material =>
    (s) => {
      const rib = Math.floor((Math.atan2(s.p[2] - cz, s.p[0] - cx) + Math.PI) * 1.6);
      return tone(green, s.light, rib % 2 === 0 ? 0 : -1);
    };
  const buttons = 2 + variant;
  for (let i = 0; i < buttons; i++) {
    const x = (noise(i, variant, 101) - 0.5) * 16;
    const z = (noise(i, variant, 102) - 0.5) * 16;
    const r = 4 + noise(i, variant, 103) * 2.4;
    c.ellipsoid([x, r * 0.45, z], UP, [r, r * 0.6, r], ribbed(x, z));
    if (i === 0 || noise(i, variant, 104) > 0.5)
      c.sphere([x, r * 0.95, z], 1.6, solid(ramp([234, 150, 190]), 1));
  }
};

/** Matorral seco: ramitas grises y torcidas con pocas hojas pardas. */
const dryShrub: Model = (c, variant) => {
  const twig = solid(ramp([138, 120, 98]));
  for (let i = 0; i < 12; i++) {
    const a = noise(i, variant, 111) * Math.PI * 2;
    const h = 10 + noise(i, variant, 112) * 12;
    const r = 6 + noise(i, variant, 113) * 9;
    const mid: Vec3 = [Math.cos(a) * r * 0.5, h * 0.6, Math.sin(a) * r * 0.5];
    const tip: Vec3 = [Math.cos(a + 0.4) * r, h, Math.sin(a + 0.4) * r];
    c.limb([0, 0, 0], mid, 0.7, 0.45, twig);
    c.limb(mid, tip, 0.45, 0.2, twig);
    if (i % 3 === 0) c.sphere(tip, 1.2, solid(ramp([150, 128, 72])));
  }
};

/** Piedritas sueltas en el suelo. */
const pebbles: Model = (c, variant) => {
  for (let i = 0; i < 9; i++) {
    const x = (noise(i, variant, 121) - 0.5) * 22;
    const z = (noise(i, variant, 122) - 0.5) * 22;
    const r = 1.4 + noise(i, variant, 123) * 2.4;
    c.ellipsoid(
      [x, r * 0.4, z],
      axesAlong([1, 0, noise(i, variant, 124) - 0.5]),
      [r * 1.3, r * 0.7, r],
      rocky(STONE, i + variant),
    );
  }
};

/** Peñasco: una roca grande que no se puede pasar (granito, arenisca o piedra oscura). */
const boulder: Model = (c, variant) => {
  const colors =
    [ramp([150, 146, 140]), ramp([196, 150, 104]), ramp([104, 100, 98])][variant] ?? STONE;
  const material = rocky(colors, variant * 17 + 3);
  c.ellipsoid([0, 10, 0], axesAlong([1, 0.1, 0.5]), [15, 12, 12], material);
  c.ellipsoid([-9, 6, 7], axesAlong([0.4, 0.2, 1]), [8, 7, 8], material);
  c.ellipsoid([9, 4, -6], axesAlong([1, 0, 0.3]), [7, 5, 6], material);
};

/** Piedra con musgo: el musgo crece arriba y del lado de la sombra. */
const mossyRock: Model = (c, variant) => {
  const stone = rocky(STONE, variant * 13 + 5);
  const moss = ramp([82, 128, 56]);
  const material: Material = (s) => {
    const top =
      s.n[1] + noise(Math.floor(s.p[0] / 2), Math.floor(s.p[1] / 2), Math.floor(s.p[2] / 2)) * 0.5;
    return top > 0.75 ? tone(moss, s.light) : stone(s);
  };
  c.ellipsoid([0, 6, 0], axesAlong([1, 0.15, 0.3 + variant * 0.2]), [11, 8, 9], material);
  if (variant !== 2) c.ellipsoid([7, 3, 5], axesAlong([0.3, 0.1, 1]), [5, 4, 5], material);
};

/** Planta de selva: hojas enormes y anchas que se abren desde el suelo. */
const junglePlant: Model = (c, variant) => {
  const leaf = ramp(variant === 1 ? [40, 96, 46] : [54, 112, 50]);
  const vein = ramp([120, 160, 84]);
  const leaves = 7;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + variant * 0.7;
    // Hojas largas y paradas que se arquean hacia afuera (no platos vistos desde arriba).
    const rise = 0.9 + noise(i, variant, 132) * 0.8;
    const d = normalize3([Math.cos(a), rise, Math.sin(a)]);
    const stemTop: Vec3 = [d[0] * 6, 7 + noise(i, variant, 131) * 7, d[2] * 6];
    c.limb([0, 0, 0], stemTop, 0.6, 0.4, solid(ramp([70, 110, 46])));
    const length = 18 + noise(i, variant, 133) * 8;
    const center: Vec3 = [
      stemTop[0] + d[0] * length * 0.55,
      stemTop[1] + d[1] * length * 0.45,
      stemTop[2] + d[2] * length * 0.55,
    ];
    c.ellipsoid(center, axesAlong([d[0], d[1], d[2]]), [length * 0.55, 0.6, 4], (s) => {
      const across = Math.abs((s.p[0] - center[0]) * -d[2] + (s.p[2] - center[2]) * d[0]);
      return across < 0.4 ? tone(vein, s.light) : tone(leaf, s.light);
    });
  }
};

/** Mata de tundra: arbusto bajo y apretado, rojizo y verde oscuro, con escarcha. */
const tundraShrub: Model = (c, variant) => {
  const colors = [ramp([126, 74, 58]), ramp([82, 96, 60]), ramp([150, 104, 60])];
  for (let i = 0; i < 8; i++) {
    const x = (noise(i, variant, 141) - 0.5) * 14;
    const z = (noise(i, variant, 142) - 0.5) * 14;
    const r = 2.4 + noise(i, variant, 143) * 2;
    const color = colors[(i + variant) % colors.length] ?? colors[0] ?? STONE;
    c.ellipsoid([x, r * 0.6, z], UP, [r, r * 0.7, r], (s) =>
      s.n[1] > 0.8 && noise(Math.floor(s.p[0] * 2), Math.floor(s.p[2] * 2), i) > 0.7
        ? [226, 232, 240]
        : foliage(color, i + variant)(s),
    );
  }
};

const MARBLE = ramp([206, 200, 186]);

/** Fuste de mármol con estrías verticales. */
const fluted: Material = (s) => {
  const flute = Math.floor((Math.atan2(s.p[2], s.p[0]) + Math.PI) * 2.4);
  const worn = noise(Math.floor(s.p[0]), Math.floor(s.p[1] / 2), Math.floor(s.p[2])) > 0.86;
  return tone(MARBLE, s.light, worn ? -1 : flute % 2 === 0 ? 0 : -1);
};

/** Columna antigua: basa, fuste estriado y capitel; las variantes están quebradas a distinta altura. */
const column: Model = (c, variant) => {
  const plain = rocky(MARBLE, 9);
  c.box([0, 2, 0], UP, [9, 2, 9], plain);
  c.box([0, 5, 0], UP, [7.5, 1.2, 7.5], plain);
  const height = variant === 0 ? 70 : variant === 1 ? 42 : 24;
  cylinder(c, [0, 6, 0], height, () => 5.2, fluted);
  if (variant === 0) {
    c.box([0, 6 + height + 1.5, 0], UP, [7, 1.5, 7], plain);
    c.box([0, 6 + height + 4.5, 0], UP, [8.5, 1.5, 8.5], plain);
  } else {
    // Corte quebrado: un pedazo tirado al pie.
    c.ellipsoid([10, 3, 6], axesAlong([1, 0.2, 0.5]), [6, 3, 4], fluted);
  }
};

/** Columna caída: tambores del fuste tirados en el suelo, uno partido. */
const fallenColumn: Model = (c, variant) => {
  const along: Vec3 = variant === 1 ? [0.3, 0, 1] : [1, 0, 0.35];
  const n = normalize3(along);
  for (let i = 0; i < 3; i++) {
    const at: Vec3 = [n[0] * (i - 1) * 13 + i * 1.5, 6, n[2] * (i - 1) * 13 - i];
    c.limb(
      [at[0] - n[0] * 5, at[1], at[2] - n[2] * 5],
      [at[0] + n[0] * 5, at[1] - (i === 2 ? 1.5 : 0), at[2] + n[2] * 5],
      6,
      6,
      fluted,
    );
  }
  c.box([n[0] * -20, 3, n[2] * -20], UP, [6, 3, 6], rocky(MARBLE, 4));
};

function normalize3(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// ── Ciudades ────────────────────────────────────────────────────────

/** Piedra en hiladas de cualquier color: bloques de `block` de largo y juntas de `mortar`. */
function courses(colors: Ramp, mortar: Ramp, along: 0 | 2, height = 6, block = 10): Material {
  return (s) => {
    const course = Math.floor(s.p[1] / height);
    const pos = s.p[along] + (course % 2) * (block / 2) + 100;
    const inCourse = s.p[1] - course * height;
    const side = Math.abs(s.n[along]) > 0.6 || s.n[1] > 0.6;
    if (inCourse < 0.9 || (!side && pos % block < 0.9)) return tone(mortar, s.light);
    const b = noise(Math.floor(pos / block), course, along + 7);
    return tone(colors, s.light, b > 0.75 ? 1 : b < 0.2 ? -1 : 0);
  };
}

/** Una pared sobre el borde de atrás del tile (como `wall`), dibujada por `face`. */
type WallFace = (c: VolumeCanvas, along: 0 | 2) => void;

/** Las cuatro piezas de una pared: a lo largo de x, de z, la esquina y el poste que cierra. */
function wallSet(face: WallFace, post: Model): Record<'x' | 'y' | 'corner' | 'post', Model> {
  return {
    x: (c) => face(c, 0),
    y: (c) => face(c, 2),
    corner: (c, v) => {
      face(c, 0);
      face(c, 2);
      post(c, v);
    },
    post,
  };
}

/** Ubica un punto sobre el borde de atrás: `t` a lo largo, `y` de alto y `inset` hacia adentro. */
const edge = (along: 0 | 2, t: number, y: number, inset: number): Vec3 =>
  along === 0 ? [t, y, -H + inset] : [-H + inset, y, t];
const edgeHalf = (along: 0 | 2, length: number, height: number, thick: number): Vec3 =>
  along === 0 ? [length, height, thick] : [thick, height, length];

/** Cabaña de troncos (pueblo de montaña): troncos apilados con las puntas que asoman. */
const LOG = ramp([120, 82, 50]);
const logWall: WallFace = (c, along) => {
  const log: Material = (s) =>
    tone(LOG, s.light, noise(Math.floor(s.p[along] / 3), Math.floor(s.p[1] / 5)) > 0.75 ? -1 : 0);
  for (let i = 0; i < 8; i++) {
    const y = 3 + i * 5.6;
    c.limb(edge(along, -H - 1.5, y, 3), edge(along, H + 1.5, y, 3), 3, 3, log);
  }
  // Techito de tejuelas arriba.
  c.box(
    edge(along, 0, 46, 3),
    UP,
    edgeHalf(along, H + 2, 1.4, 5),
    planks(ramp([84, 60, 40]), along, 3),
  );
};
const logPost: Model = (c) => {
  cylinder(c, [-H + 3, 0, -H + 3], 48, () => 3.6, bark);
};

/** Casa de tablas sobre pilotes de piedra (pueblo del pantano): tablas verticales y vigas. */
const BOARD = ramp([156, 124, 82]);
const plankWall: WallFace = (c, along) => {
  c.box(edge(along, 0, 3, 2.6), UP, edgeHalf(along, H, 3, 3.2), rocky(ramp([110, 106, 96]), 3));
  c.box(edge(along, 0, 26, 2.6), UP, edgeHalf(along, H, 20, 2.2), (s) => {
    const t = s.p[along] + 100;
    const seam = t % 4 < 0.7;
    const weathered = noise(Math.floor(t / 4), Math.floor(s.p[1] / 9)) > 0.7;
    return tone(BOARD, s.light, seam ? -1 : weathered ? 1 : 0);
  });
  // Vigas: una abajo, una arriba y una en cruz.
  const beam = solid(ramp([90, 64, 42]));
  for (const y of [7, 45]) c.box(edge(along, 0, y, 2.6), UP, edgeHalf(along, H, 1.3, 2.8), beam);
  c.limb(edge(along, -H + 1, 8, 1), edge(along, H - 1, 44, 1), 0.9, 0.9, beam);
};
const plankPost: Model = (c) => {
  c.box([-H + 3, 24, -H + 3], UP, [3, 24, 3], solid(ramp([90, 64, 42])));
};

/** Piedra negra con juntas rojizas (la ciudad del volcán). */
const BASALT = ramp([66, 62, 66]);
const BASALT_MORTAR = ramp([128, 62, 44]);
const basaltWall: WallFace = (c, along) => {
  c.box(
    edge(along, 0, 24, 3),
    UP,
    edgeHalf(along, H, 24, 3),
    courses(BASALT, BASALT_MORTAR, along, 7, 9),
  );
  c.box(edge(along, 0, 49.4, 3), UP, edgeHalf(along, H, 1.4, 3.8), solid(ramp([96, 50, 38])));
};
const basaltPost: Model = (c) => {
  c.box([-H + 4, 25, -H + 4], UP, [4.6, 25, 4.6], courses(BASALT, BASALT_MORTAR, 0, 7, 9));
  c.box([-H + 4, 51, -H + 4], UP, [5.4, 1.4, 5.4], solid(ramp([96, 50, 38])));
};

/** Arenisca: bloques claros y cálidos, con una moldura de dibujo escalonado arriba. */
const SANDSTONE = ramp([206, 176, 128]);
const SANDSTONE_MORTAR = ramp([170, 140, 98]);
const sandstoneWall: WallFace = (c, along) => {
  c.box(
    edge(along, 0, 24, 3),
    UP,
    edgeHalf(along, H, 24, 3),
    courses(SANDSTONE, SANDSTONE_MORTAR, along, 6, 12),
  );
  // Moldura: una franja más oscura con un dibujo de grecas.
  c.box(edge(along, 0, 43, 3.4), UP, edgeHalf(along, H, 2.2, 3.4), (s) => {
    const t = Math.floor((s.p[along] + 100) / 3);
    const row = Math.floor((s.p[1] - 40.8) / 1.5);
    const fret = (t + row) % 3 === 0 || t % 3 === 0;
    return tone(fret ? ramp([132, 96, 62]) : ramp([176, 144, 100]), s.light);
  });
  c.box(edge(along, 0, 49, 3), UP, edgeHalf(along, H, 1.2, 3.8), solid(ramp([222, 196, 150])));
};
const sandstonePost: Model = (c) => {
  c.box([-H + 4, 25, -H + 4], UP, [4.6, 25, 4.6], courses(SANDSTONE, SANDSTONE_MORTAR, 0, 6, 12));
  c.box([-H + 4, 51, -H + 4], UP, [5.4, 1.4, 5.4], solid(ramp([222, 196, 150])));
};

/** Muralla de la ciudad: alta y gruesa, con almenas y un camino de ronda. */
const RAMPART = ramp([168, 160, 144]);
const RAMPART_HEIGHT = 66;
const rampart: WallFace = (c, along) => {
  const stone = courses(RAMPART, ramp([110, 104, 94]), along, 8, 14);
  c.box(
    edge(along, 0, RAMPART_HEIGHT / 2, 6),
    UP,
    edgeHalf(along, H, RAMPART_HEIGHT / 2, 6),
    stone,
  );
  // Zócalo más ancho abajo.
  c.box(edge(along, 0, 4, 6), UP, edgeHalf(along, H, 4, 7.2), rocky(ramp([140, 132, 118]), 5));
  // Almenas: dientes a los dos lados del camino de ronda.
  for (let t = -H + 2.5; t <= H; t += 6.2)
    for (const inset of [1.2, 10.8])
      c.box(edge(along, t, RAMPART_HEIGHT + 3, inset), UP, edgeHalf(along, 2, 3, 1.2), stone);
  // Saeteras.
  const slit = solid(ramp([30, 26, 24]));
  c.box(edge(along, 0, RAMPART_HEIGHT * 0.6, 12.2), UP, edgeHalf(along, 0.8, 5, 0.2), slit);
};
const rampartPost: Model = (c) => {
  const stone = courses(RAMPART, ramp([110, 104, 94]), 0, 8, 14);
  c.box([-H + 6, RAMPART_HEIGHT / 2 + 2, -H + 6], UP, [8, RAMPART_HEIGHT / 2 + 2, 8], stone);
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const)
    c.box([-H + 6 + x * 6, RAMPART_HEIGHT + 7, -H + 6 + z * 6], UP, [2, 3, 2], stone);
};

/**
 * Torre redonda de la muralla (2 × 2 tiles): mampostería, saeteras, almenas,
 * techo cónico de tejas rojas y un banderín en la punta. De noche, la ventana
 * de arriba alumbra.
 */
const tower: Model = (c) => {
  const height = 112;
  const stone = (s: Parameters<Material>[0]) => courses(RAMPART, ramp([110, 104, 94]), 0, 8, 12)(s);
  cylinder(c, [0, 0, 0], 8, () => 27, rocky(ramp([140, 132, 118]), 2));
  cylinder(c, [0, 8, 0], height - 8, (t) => 25 - t * 2, stone);
  // Cornisa y almenas.
  cylinder(c, [0, height, 0], 3, () => 27, stone);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.box(
      [Math.cos(a) * 24.5, height + 7, Math.sin(a) * 24.5],
      axesAlong([-Math.sin(a), 0, Math.cos(a)]),
      [2.6, 4, 2.2],
      stone,
    );
  }
  // Techo cónico de tejas.
  const tiles: Material = (s) =>
    tone(ramp([156, 58, 44]), s.light, Math.floor(s.p[1] / 4) % 2 === 0 ? 0 : -1);
  cylinder(c, [0, height + 4, 0], 46, (t) => 22 * (1 - t) + 0.6, tiles);
  // Banderín.
  c.limb([0, height + 48, 0], [0, height + 62, 0], 0.5, 0.5, metal(IRON));
  c.box([0, height + 59, 4.5], UP, [0.3, 3, 4.5], solid(ramp([40, 70, 150])));
  // Puerta, saeteras y la ventana que alumbra.
  const dark = solid(ramp([34, 28, 26]));
  c.box([18, 9, 18], axesAlong([1, 0, 1]), [5.5, 9, 0.8], solid(ramp([84, 58, 38])));
  for (const y of [40, 70]) c.box([17, y, 17], axesAlong([1, 0, 1]), [0.9, 5, 0.6], dark);
  c.box([17, 96, 17], axesAlong([1, 0, 1]), [2.2, 4, 0.6], glowing(ramp([255, 214, 120])));
};

/** Empalizada: troncos parados con la punta afilada (el refugio de los bandidos). */
const palisade: WallFace = (c, along) => {
  for (let t = -H + 1.6; t <= H; t += 3.3) {
    const h = 30 + noise(Math.floor(t + 50), along) * 6;
    c.limb(edge(along, t, 0, 2), edge(along, t, h, 2), 1.7, 1.7, bark);
    c.limb(edge(along, t, h, 2), edge(along, t, h + 4, 2), 1.7, 0.2, solid(ramp([150, 118, 80])));
  }
  c.box(edge(along, 0, 20, 4.2), UP, edgeHalf(along, H, 1, 0.8), planks(WOOD, along, 3));
};
const palisadePost: Model = (c) => {
  c.limb([-H + 2, 0, -H + 2], [-H + 2, 38, -H + 2], 2.6, 2.4, bark);
  c.limb([-H + 2, 38, -H + 2], [-H + 2, 43, -H + 2], 2.4, 0.3, solid(ramp([150, 118, 80])));
};

/** Reja de hierro con puntas de lanza (alrededor del cementerio). */
function ironFence(c: VolumeCanvas, along: 0 | 2): void {
  const iron = metal(ramp([52, 52, 58]));
  for (let t = -H + 1; t <= H; t += 2.6) {
    c.limb(edge(along, t, 0, 1.4), edge(along, t, 22, 1.4), 0.45, 0.45, iron);
    c.limb(edge(along, t, 22, 1.4), edge(along, t, 24.5, 1.4), 0.9, 0.1, iron);
  }
  for (const y of [5, 19]) c.box(edge(along, 0, y, 1.4), UP, edgeHalf(along, H, 0.6, 0.5), iron);
  for (const t of [-H + 1, H - 1]) c.box(edge(along, t, 13, 1.4), UP, [1.4, 13, 1.4], solid(STONE));
}

/** Cripta (2 × 2): casita de piedra con columnas, techo a dos aguas, puerta de hierro y una cruz. */
const crypt: Model = (c, variant) => {
  const stone = rocky(ramp([148, 144, 138]), variant + 9);
  const half = 2 * H * 0.8;
  const facing = axesAlong([1, 0, 1]);
  c.box([0, 2, 0], facing, [half + 2, 2, half + 2], rocky(ramp([128, 124, 118]), 2));
  c.box(
    [0, 20, 0],
    facing,
    [half, 16, half * 0.8],
    courses(ramp([150, 146, 140]), ramp([110, 106, 100]), 0, 6, 9),
  );
  // Techo a dos aguas: dos losas que bajan desde la cumbrera, a lo ancho.
  for (const side of [1, -1] as const) {
    const out = side * half * 0.42;
    c.box(
      [out * Math.SQRT1_2, 39.5, -out * Math.SQRT1_2],
      axesAlong([1, 0, 1], [side * 0.5 * Math.SQRT1_2, 1, -side * 0.5 * Math.SQRT1_2]),
      [half * 0.6, 1.3, half * 0.95],
      solid(ramp([96, 94, 92])),
    );
  }
  // Columnas al frente y la puerta.
  const front = (k: number, y: number): Vec3 => [
    half * 0.8 * Math.SQRT1_2 + k * Math.SQRT1_2,
    y,
    half * 0.8 * Math.SQRT1_2 - k * Math.SQRT1_2,
  ];
  for (const k of [-11, 11]) c.limb(front(k, 4) as Vec3, front(k, 36) as Vec3, 2, 2, stone);
  c.box(
    [front(0, 0)[0] + 0.6, 13, front(0, 0)[2] + 0.6],
    facing,
    [6, 11, 0.6],
    metal(ramp([60, 60, 66])),
  );
  // Cruz arriba.
  c.box([0, 52, 0], facing, [0.9, 6, 0.9], stone);
  c.box([0, 54, 0], facing, [4, 0.9, 0.9], stone);
};

/** Puesto del mercado: mostrador, cuatro postes y un toldo a rayas con mercadería. */
const stall: Model = (c, variant) => {
  const wood = planks(WOOD, 0, 3);
  const facing = axesAlong([1, 0, 1]);
  const stripes = [
    [ramp([196, 54, 48]), ramp([232, 222, 200])],
    [ramp([48, 92, 170]), ramp([232, 222, 200])],
    [ramp([62, 136, 70]), ramp([226, 200, 90])],
  ][variant % 3] as [Ramp, Ramp];
  for (const [a, b] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const x = (a * 12 + b * 6) * Math.SQRT1_2;
    const z = (-a * 12 + b * 6) * Math.SQRT1_2;
    c.limb([x, 0, z], [x, b > 0 ? 26 : 32, z], 0.9, 0.9, solid(WOOD, -1));
  }
  c.box([4, 7, 4], facing, [13, 7, 3.4], wood);
  c.box([0, 30, 0], axesAlong([1, 0, 1], [-0.25, 1, -0.25]), [14, 0.8, 9], (s) =>
    tone(Math.floor((s.p[0] - s.p[2] + 200) / 5) % 2 === 0 ? stripes[0] : stripes[1], s.light),
  );
  // Mercadería: frutas, panes o vasijas.
  const goods = [ramp([210, 70, 50]), ramp([222, 170, 80]), ramp([120, 160, 70])];
  for (let i = 0; i < 7; i++) {
    const t = i - 3;
    c.sphere(
      [4 + t * 3 * Math.SQRT1_2, 15.6, 4 - t * 3 * Math.SQRT1_2],
      1.8,
      solid(goods[(i + variant) % 3] ?? WOOD),
    );
  }
};

/** Estandarte del reino: mástil con travesaño y un paño azul con borde dorado. */
const banner: Model = (c, variant) => {
  c.limb([-4, 0, -4], [-4, 64, -4], 0.9, 0.7, solid(ramp([90, 64, 42])));
  c.sphere([-4, 65, -4], 1.4, metal(ramp([214, 172, 64])));
  const along: Vec3 = [Math.SQRT1_2, 0, -Math.SQRT1_2];
  c.limb(
    [-4 - along[0] * 8, 60, -4 - along[2] * 8],
    [-4 + along[0] * 8, 60, -4 + along[2] * 8],
    0.6,
    0.6,
    solid(ramp([90, 64, 42])),
  );
  const cloth =
    [ramp([40, 70, 150]), ramp([150, 36, 40]), ramp([50, 110, 60])][variant % 3] ??
    ramp([40, 70, 150]);
  const gold = ramp([214, 172, 64]);
  c.box([-3.4, 47, -3.4], axesAlong([1, 0, 1]), [7.4, 13, 0.3], (s) => {
    const edgeBand = s.p[1] < 35.5 || Math.abs((s.p[0] - s.p[2]) / Math.SQRT2) > 6.4;
    const emblem = Math.hypot((s.p[0] - s.p[2]) / Math.SQRT2, s.p[1] - 49) < 3;
    return tone(edgeBand || emblem ? gold : cloth, s.light);
  });
};

/** Trono: respaldo alto, apoyabrazos, almohadón rojo y adornos de oro. */
const throne: Model = (c) => {
  const gold = metal(ramp([214, 172, 64]));
  const wood = planks(ramp([110, 70, 40]), 1, 3);
  const facing = axesAlong([1, 0, 1]);
  c.box([0, 2, 0], facing, [12, 2, 12], solid(ramp([120, 40, 44])));
  c.box([0, 9, 0], facing, [8, 5, 7], wood);
  c.box([1.6, 14.6, 1.6], facing, [7, 1.4, 6], solid(ramp([170, 40, 48])));
  c.box([-5.4, 26, -5.4], facing, [8, 18, 1.6], wood);
  c.box([-4.6, 30, -4.6], facing, [5.6, 11, 0.4], solid(ramp([170, 40, 48])));
  for (const side of [1, -1] as const) {
    const x = side * 7.5 * Math.SQRT1_2;
    c.box([x, 18, -x], facing, [1.2, 4, 6.4], wood);
    c.sphere([x - 5.4 * Math.SQRT1_2, 44, -x - 5.4 * Math.SQRT1_2], 1.6, gold);
  }
  c.sphere([-5.4 * Math.SQRT1_2 * 2, 46, -5.4 * Math.SQRT1_2 * 2], 2, gold);
};

/** Fuente de la plaza (2 × 2): pileta redonda con agua, columna y taza que derrama. */
const fountain: Model = (c) => {
  const stone = rocky(ramp([176, 170, 160]), 6);
  // Pileta: borde en anillo.
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    c.box(
      [Math.cos(a) * 24, 4, Math.sin(a) * 24],
      axesAlong([-Math.sin(a), 0, Math.cos(a)]),
      [2.4, 4, 2.4],
      stone,
    );
  }
  const water: Material = (s) =>
    tone(
      ramp([70, 140, 200]),
      0.7 + s.light * 0.3,
      noise(Math.floor(s.p[0] / 3), Math.floor(s.p[2] / 3)) > 0.8 ? 1 : 0,
    );
  c.ellipsoid([0, 5, 0], UP, [22, 1, 22], water);
  cylinder(c, [0, 4, 0], 18, (t) => 4 - t * 1.2, stone);
  cylinder(c, [0, 22, 0], 3, (t) => 4 + t * 6, stone);
  c.ellipsoid([0, 25, 0], UP, [9, 0.8, 9], water);
  // Chorros que caen de la taza.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    c.limb(
      [Math.cos(a) * 9, 24, Math.sin(a) * 9],
      [Math.cos(a) * 14, 6, Math.sin(a) * 14],
      0.9,
      1.3,
      glowing(ramp([150, 200, 236])),
    );
  }
};

// ── Interiores y oficios ────────────────────────────────────────────

const STRAW = ramp([214, 184, 96]);
const strawy: Material = (s) =>
  tone(
    STRAW,
    s.light,
    noise(Math.floor(s.p[0] * 2 + s.p[1]), Math.floor(s.p[2] * 2)) > 0.7 ? -1 : 0,
  );
const FURNITURE = ramp([128, 84, 48]);
const DARK_WOOD = ramp([92, 58, 34]);
const LINEN_WHITE = ramp([226, 220, 204]);
const BRASS = ramp([206, 164, 72]);

/** Ejes de un mueble que mira hacia `f` (en el plano). */
const facing = (f: Vec3) => axesAlong(f);
/** Un punto del mueble: `side` a lo ancho, `y` de alto y `fwd` hacia donde mira. */
function local(f: Vec3, side: number, y: number, fwd: number): Vec3 {
  const [a] = axesAlong(f);
  return [a[0] * side + f[0] * fwd, y, a[2] * side + f[2] * fwd];
}

/** Fardo de paja atado con dos hilos (uno, o dos apilados). */
const hayBale: Model = (c, variant) => {
  const f: Vec3 = variant === 1 ? [0, 0, 1] : [1, 0, 0];
  const bale = (y: number, shift: number) => {
    c.box(local(f, shift, y + 5, 0), facing(f), [6, 5, 10], strawy);
    for (const t of [-4.5, 4.5])
      c.box(local(f, shift, y + 5, t), facing(f), [6.2, 5.2, 0.5], solid(ramp([150, 110, 60])));
  };
  bale(0, 0);
  if (variant === 2) bale(10, 1);
};

/** Paja suelta en el piso. */
const hayPile: Model = (c, variant) => {
  c.ellipsoid([0, 2, 0], UP, [8, 3.4, 7], strawy);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3 + variant;
    c.ellipsoid(
      [Math.cos(a) * 6, 1, Math.sin(a) * 6],
      axesAlong([Math.cos(a), 0, Math.sin(a)]),
      [4, 1.4, 2.6],
      strawy,
    );
  }
};

/** Palenque: dos postes con un travesaño donde se atan los caballos, con argollas. */
const hitchingPost: Model = (c) => {
  const f: Vec3 = [Math.SQRT1_2, 0, -Math.SQRT1_2];
  const wood = planks(DARK_WOOD, 1, 3);
  for (const t of [-11, 11]) c.box(local(f, 0, 9, t), facing(f), [1.4, 9, 1.4], wood);
  c.box(local(f, 0, 16, 0), facing(f), [1.1, 1.1, 13], planks(DARK_WOOD, 2, 4));
  for (const t of [-5, 5])
    c.limb(local(f, 0.9, 15, t), local(f, 0.9, 12.6, t), 0.6, 0.6, metal(IRON));
};

/** Bebedero (fuentón): artesa de tablas con agua. */
const waterTrough: Model = (c, variant) => {
  const f: Vec3 = variant === 1 ? [0, 0, 1] : [1, 0, 0];
  c.box(local(f, 0, 4, 0), facing(f), [5, 4, 12], planks(FURNITURE, 2, 3));
  c.box(local(f, 0, 8.1, 0), facing(f), [4, 0.4, 11], (s) =>
    tone(
      ramp([80, 140, 190]),
      0.75 + s.light * 0.25,
      noise(Math.floor(s.p[0] / 2), Math.floor(s.p[2] / 2)) > 0.8 ? 1 : 0,
    ),
  );
  for (const t of [-10, 10]) c.box(local(f, 0, 4, t), facing(f), [5.4, 4.4, 0.8], metal(IRON));
};

/** Tocón con un hacha clavada y astillas alrededor. */
const stumpAxe: Model = (c, variant) => {
  cylinder(c, [0, 0, 0], 11, (t) => 9.5 - t * 0.8, bark);
  // Raíces que se abren al pie.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    c.limb(
      [Math.cos(a) * 7, 2, Math.sin(a) * 7],
      [Math.cos(a) * 12, 0.5, Math.sin(a) * 12],
      2.2,
      0.8,
      bark,
    );
  }
  c.ellipsoid([0, 11, 0], UP, [8.8, 0.6, 8.8], (s) =>
    tone(ramp([206, 166, 110]), s.light, Math.round(Math.hypot(s.p[0], s.p[2])) % 2 === 0 ? -1 : 0),
  );
  // El hacha: la hoja clavada arriba y el mango inclinado hacia afuera.
  c.box([0.5, 12.6, 0.5], axesAlong([1, 0, 1]), [4.6, 2.8, 0.8], metal(ramp([150, 152, 160])));
  c.limb([1.5, 13, 1.5], [7 + variant, 30, 6], 1.5, 1.3, solid(ramp([168, 118, 66])));
  for (let i = 0; i < 6; i++) {
    const a = i * 1.3 + variant;
    c.box(
      [Math.cos(a) * 14, 0.5, Math.sin(a) * 14],
      axesAlong([Math.sin(a), 0, Math.cos(a)]),
      [1.6, 0.5, 0.6],
      solid(ramp([210, 170, 116])),
    );
  }
};

/** Pila de leños: troncos cortados apilados en pirámide, con la cara clara del corte. */
const logPile: Model = (c, variant) => {
  const f: Vec3 = variant === 1 ? [0, 0, 1] : [1, 0, 0];
  const [a] = facing(f);
  const rows = [4, 3, 2];
  rows.forEach((n, row) => {
    for (let i = 0; i < n; i++) {
      const side = (i - (n - 1) / 2) * 6.2;
      const y = 3 + row * 5.4;
      const from = local(f, side, y, -10);
      const to = local(f, side, y, 10);
      c.limb(from, to, 3, 3, bark);
      c.ellipsoid(to, facing(f), [2.8, 2.8, 0.4], (s) =>
        tone(
          ramp([206, 168, 112]),
          s.light,
          Math.round(Math.hypot(s.p[0] - to[0], s.p[1] - to[1]) * 1.4) % 2 === 0 ? -1 : 0,
        ),
      );
    }
  });
  void a;
};

/** Banco de carpintero: tablero grueso, morsa, un serrucho y virutas. */
const workbench: Model = (c) => {
  const f: Vec3 = [Math.SQRT1_2, 0, Math.SQRT1_2];
  const wood = planks(FURNITURE, 0, 4);
  for (const [sx, fz] of [
    [-11, -4],
    [11, -4],
    [-11, 4],
    [11, 4],
  ] as const)
    c.box(local(f, sx, 6, fz), facing(f), [1.2, 6, 1.2], solid(DARK_WOOD));
  c.box(local(f, 0, 13, 0), facing(f), [13, 1.4, 5.4], wood);
  c.box(local(f, -12, 15, 3), facing(f), [1.6, 2, 2], metal(IRON));
  // Serrucho apoyado y una tabla a medio cortar.
  c.box(local(f, 3, 14.8, -1), facing(f), [6, 0.3, 1.8], metal(ramp([176, 178, 186])));
  c.box(local(f, 9.4, 14.8, -1), facing(f), [1.6, 1, 1], solid(ramp([150, 104, 60])));
  c.box(local(f, -3, 14.8, 2), facing(f), [6, 0.5, 2.4], planks(ramp([196, 156, 104]), 0, 3));
  for (let i = 0; i < 4; i++)
    c.sphere(local(f, -8 + i * 5, 0.5, 6), 0.9, solid(ramp([220, 186, 130])));
};

/** Caballete con un serrucho clavado en una tabla. */
const sawhorse: Model = (c) => {
  const f: Vec3 = [1, 0, 0];
  for (const t of [-7, 7])
    for (const side of [-1, 1])
      c.limb(local(f, side * 3, 0, t), local(f, 0, 11, t), 0.8, 0.8, solid(DARK_WOOD));
  c.box(local(f, 0, 11.6, 0), facing(f), [1.4, 1, 9], planks(FURNITURE, 2, 3));
  c.box(local(f, 0, 13, 0), facing(f), [4, 0.6, 8], planks(ramp([196, 156, 104]), 2, 3));
  c.box(
    local(f, 0, 17, 2),
    axesAlong([0, 0, 1], [0, 0.2, 1]),
    [0.2, 4, 3],
    metal(ramp([176, 178, 186])),
  );
};

/** Pila de tablas cortadas. */
const plankStack: Model = (c, variant) => {
  const f: Vec3 = variant === 1 ? [0, 0, 1] : [1, 0, 0];
  for (let i = 0; i < 6; i++)
    c.box(
      local(f, (i % 2) * 0.8, 1 + i * 2, 0),
      facing(f),
      [5, 0.9, 12],
      planks(ramp([186, 144, 92]), 2, 4),
    );
};

/** Mesa de alquimia: frascos de colores, un alambique, un libro abierto y una vela. */
const alchemyTable: Model = (c) => {
  const f: Vec3 = [Math.SQRT1_2, 0, Math.SQRT1_2];
  for (const [sx, fz] of [
    [-10, -4],
    [10, -4],
    [-10, 4],
    [10, 4],
  ] as const)
    c.box(local(f, sx, 6, fz), facing(f), [1, 6, 1], solid(DARK_WOOD));
  c.box(local(f, 0, 12.6, 0), facing(f), [12, 0.9, 5.6], planks(DARK_WOOD, 0, 4));
  const glass =
    (colors: Ramp): Material =>
    (s) =>
      tone(colors, 0.65 + s.light * 0.35, s.light > 0.85 ? 1 : 0);
  // Alambique: bola de vidrio, cuello largo y un frasco que recibe.
  c.sphere(local(f, -6, 16.6, 0), 3.4, glass(ramp([150, 210, 120])));
  c.limb(local(f, -6, 19.6, 0), local(f, -1, 21, -1), 0.6, 0.4, glass(ramp([200, 220, 230])));
  c.limb(local(f, -1, 21, -1), local(f, 1.5, 15.5, -1), 0.4, 0.4, glass(ramp([200, 220, 230])));
  const colors = [
    ramp([200, 50, 60]),
    ramp([70, 110, 210]),
    ramp([220, 190, 60]),
    ramp([150, 70, 190]),
  ];
  colors.forEach((col, i) => {
    const at = local(f, 2 + i * 2.6, 14.6, 2.6 - (i % 2) * 3);
    c.sphere(at, 1.4, glass(col));
    c.limb(add3(at, [0, 1.2, 0]), add3(at, [0, 2.8, 0]), 0.4, 0.35, glass(col));
  });
  // Libro abierto y vela.
  c.box(local(f, 6, 13.8, -3), facing(f), [3, 0.4, 2.2], solid(LINEN_WHITE));
  c.box(local(f, 6, 13.5, -3), facing(f), [3.2, 0.3, 2.4], solid(ramp([120, 40, 40])));
  c.limb(local(f, 10, 13.5, 2), local(f, 10, 17, 2), 0.6, 0.6, solid(LINEN_WHITE));
  c.sphere(local(f, 10, 17.8, 2), 0.7, glowing(ramp([255, 210, 100])));
};

/** Biblioteca contra la pared: estantes llenos de lomos de colores. */
function bookshelf(c: VolumeCanvas, along: 0 | 2, potions: boolean): void {
  const wood = planks(DARK_WOOD, 1, 4);
  c.box(edge(along, 0, 21, 3.4), UP, edgeHalf(along, H - 1, 21, 3), wood);
  const spines = [
    ramp([150, 40, 40]),
    ramp([40, 80, 140]),
    ramp([60, 110, 60]),
    ramp([140, 110, 50]),
    ramp([90, 50, 110]),
  ];
  for (const y of [5, 15, 25, 35]) {
    if (potions) {
      for (let t = -H + 3; t < H - 2; t += 3.4) {
        const col = spines[Math.floor(noise(Math.floor(t + 30), y) * spines.length)] ?? spines[0];
        if (!col) continue;
        const at = edge(along, t, y + 2.2, 6.6);
        c.sphere(at, 1.5, (s) => tone(col, 0.6 + s.light * 0.4, s.light > 0.85 ? 1 : 0));
        c.limb(add3(at, [0, 1.3, 0]), add3(at, [0, 3, 0]), 0.45, 0.4, solid(col));
      }
    } else {
      c.box(edge(along, 0, y + 3.6, 5.6), UP, edgeHalf(along, H - 2.4, 3.6, 1.2), (s) => {
        const t = Math.floor((s.p[along] + 100) / 1.6);
        const col = spines[Math.floor(noise(t, y) * spines.length)] ?? spines[0] ?? FURNITURE;
        return tone(col, s.light, t % 5 === 0 ? -1 : 0);
      });
    }
    c.box(edge(along, 0, y - 0.6, 5), UP, edgeHalf(along, H - 1.4, 0.6, 2.4), solid(DARK_WOOD, -1));
  }
}

/** Caldero de hierro sobre tres patas, con un brebaje verde que burbujea y brasas abajo. */
const cauldron: Model = (c) => {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    c.limb(
      [Math.cos(a) * 6, 0, Math.sin(a) * 6],
      [Math.cos(a) * 4, 6, Math.sin(a) * 4],
      0.7,
      0.7,
      metal(IRON),
    );
  }
  c.ellipsoid([0, 1.4, 0], UP, [4, 1.2, 4], glowing(ramp([255, 120, 40])));
  cylinder(
    c,
    [0, 4, 0],
    9,
    (t) => 6 + Math.sin(t * Math.PI) * 2.4,
    (s) => tone(ramp([62, 60, 66]), s.light, Math.abs(s.p[1] - 11.5) < 0.8 ? 1 : 0),
  );
  c.ellipsoid([0, 12.6, 0], UP, [6.4, 0.6, 6.4], glowing(ramp([110, 220, 90])));
  for (const [x, z] of [
    [-2, 1],
    [2, -2],
    [1, 2.6],
  ] as const)
    c.sphere([x, 13.2, z], 0.9, glowing(ramp([170, 255, 140])));
};

/** Mesa de madera; algunas con jarra, pan o una vela. */
const table: Model = (c, variant) => {
  const f: Vec3 = [1, 0, 0];
  for (const [sx, fz] of [
    [-6, -9],
    [6, -9],
    [-6, 9],
    [6, 9],
  ] as const)
    c.box(local(f, sx, 6, fz), facing(f), [1, 6, 1], solid(DARK_WOOD));
  c.box(local(f, 0, 12.6, 0), facing(f), [8, 1, 11], planks(FURNITURE, 2, 4));
  if (variant === 0) {
    cylinder(c, local(f, 2, 13.6, 3), 3.4, () => 1.3, solid(ramp([180, 140, 90])));
    c.ellipsoid(local(f, -2, 14.4, -4), facing(f), [2, 1, 3], solid(ramp([200, 150, 80])));
  } else if (variant === 1) {
    c.limb(local(f, 0, 13.6, 0), local(f, 0, 17, 0), 0.6, 0.6, solid(LINEN_WHITE));
    c.sphere(local(f, 0, 17.8, 0), 0.7, glowing(ramp([255, 210, 100])));
    c.ellipsoid(local(f, 2, 13.8, 5), facing(f), [2.4, 0.4, 2.4], metal(ramp([170, 170, 176])));
  }
};

/** Silla con respaldo, mirando hacia `f`. */
function chair(c: VolumeCanvas, f: Vec3): void {
  const wood = solid(FURNITURE);
  for (const [sx, fz] of [
    [-3.6, -3.6],
    [3.6, -3.6],
    [-3.6, 3.6],
    [3.6, 3.6],
  ] as const)
    c.box(local(f, sx, 4.5, fz), facing(f), [0.7, 4.5, 0.7], solid(DARK_WOOD));
  c.box(local(f, 0, 9.6, 0), facing(f), [4.4, 0.8, 4.4], planks(FURNITURE, 0, 3));
  for (const sx of [-3.6, 3.6]) c.box(local(f, sx, 16, -3.8), facing(f), [0.7, 7, 0.7], wood);
  c.box(local(f, 0, 21.5, -3.8), facing(f), [4.2, 1.4, 0.6], wood);
  c.box(local(f, 0, 16.5, -3.8), facing(f), [4, 0.6, 0.5], wood);
}

/** Banco largo sin respaldo, a lo largo de x (0) o z (2). */
function bench(c: VolumeCanvas, along: 0 | 2): void {
  const f: Vec3 = along === 0 ? [0, 0, 1] : [1, 0, 0];
  for (const t of [-10, 10]) c.box(local(f, t, 4, 0), facing(f), [1, 4, 3.4], solid(DARK_WOOD));
  c.box(local(f, 0, 8.6, 0), facing(f), [13, 0.9, 4], planks(FURNITURE, along, 4));
}

/** Banqueta redonda de tres patas. */
const stool: Model = (c) => {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    c.limb(
      [Math.cos(a) * 3.4, 0, Math.sin(a) * 3.4],
      [Math.cos(a) * 2.4, 8.6, Math.sin(a) * 2.4],
      0.6,
      0.6,
      solid(DARK_WOOD),
    );
  }
  cylinder(c, [0, 8.4, 0], 1.2, () => 4.2, planks(FURNITURE, 1, 3));
};

/** Mostrador: mueble alto con tapa más oscura (se arman filas de varios). */
const counter: Model = (c, variant) => {
  const f: Vec3 = variant === 1 ? [0, 0, 1] : [1, 0, 0];
  c.box(local(f, 0, 7, 0), facing(f), [6, 7, H], planks(FURNITURE, 1, 3));
  c.box(local(f, 0, 14.6, 0), facing(f), [7, 0.9, H + 0.6], planks(DARK_WOOD, 2, 4));
  if (variant === 2) {
    // Balanza de bronce.
    c.limb(local(f, 0, 15.4, 0), local(f, 0, 21, 0), 0.4, 0.4, metal(BRASS));
    c.limb(local(f, 0, 21, -4), local(f, 0, 21, 4), 0.3, 0.3, metal(BRASS));
    for (const t of [-4, 4]) c.ellipsoid(local(f, 0, 17.5, t), UP, [1.8, 0.4, 1.8], metal(BRASS));
  }
};

/** Cofre con tapa redondeada, flejes de hierro y cerradura de bronce. */
const chest: Model = (c, variant) => {
  const f: Vec3 = variant === 1 ? [0, 0, 1] : [Math.SQRT1_2, 0, Math.SQRT1_2];
  const wood = planks(variant === 2 ? ramp([110, 40, 40]) : FURNITURE, 0, 3);
  c.box(local(f, 0, 4.5, 0), facing(f), [8, 4.5, 5], wood);
  c.ellipsoid(local(f, 0, 9, 0), axesAlong(axesAlong(f)[0]), [8, 3, 5], wood);
  for (const sx of [-5, 5]) c.box(local(f, sx, 6.5, 0), facing(f), [0.7, 6.5, 5.3], metal(IRON));
  c.box(local(f, 0, 7.5, 5.2), facing(f), [1.2, 1.4, 0.4], metal(BRASS));
};

/** Armero: bastidor con lanzas, espadas y un escudo. */
const weaponRack: Model = (c) => {
  const f: Vec3 = [Math.SQRT1_2, 0, Math.SQRT1_2];
  const wood = solid(DARK_WOOD);
  for (const sx of [-10, 10]) c.box(local(f, sx, 14, -2), facing(f), [1, 14, 1], wood);
  for (const y of [6, 22]) c.box(local(f, 0, y, -2), facing(f), [10, 0.8, 1], wood);
  const steel = metal(ramp([176, 178, 186]));
  for (const sx of [-7, -3.5]) {
    c.limb(local(f, sx, 1, -1), local(f, sx + 1, 34, -2.6), 0.5, 0.5, solid(ramp([140, 100, 60])));
    c.limb(local(f, sx + 1, 34, -2.6), local(f, sx + 1.2, 38, -2.8), 0.9, 0.1, steel);
  }
  for (const sx of [1, 4]) {
    c.box(local(f, sx, 14, -0.6), facing(f), [0.5, 9, 0.2], steel);
    c.box(local(f, sx, 23.5, -0.6), facing(f), [2, 0.5, 0.5], metal(BRASS));
    c.limb(local(f, sx, 24, -0.6), local(f, sx, 27, -0.6), 0.5, 0.5, solid(ramp([90, 50, 30])));
  }
  c.ellipsoid(local(f, 7.6, 14, 0), axesAlong(f), [4, 5, 0.8], (s) =>
    tone(ramp([150, 40, 40]), s.light, Math.hypot(s.p[1] - 14, 0) < 1.4 ? 1 : 0),
  );
};

/** Maniquí con cota de malla y yelmo. */
const armorStand: Model = (c) => {
  c.ellipsoid([0, 0.8, 0], UP, [5, 0.8, 5], solid(DARK_WOOD));
  c.limb([0, 1, 0], [0, 26, 0], 0.9, 0.9, solid(DARK_WOOD));
  c.limb([-6, 25, 0], [6, 25, 0], 0.7, 0.7, solid(DARK_WOOD));
  const mail: Material = (s) =>
    tone(
      ramp([150, 152, 160]),
      s.light,
      (Math.floor(s.p[0] * 2) + Math.floor(s.p[1] * 2)) % 2 === 0 ? 0 : -1,
    );
  c.ellipsoid([0, 20, 0], UP, [6, 7.5, 3.6], mail);
  c.ellipsoid([0, 12.6, 0], UP, [5.4, 2.6, 3.4], mail);
  c.sphere([0, 30.5, 0], 3.6, metal(ramp([160, 162, 170])));
  c.box([0, 30, 3.3], axesAlong([0, 0, 1]), [2.6, 0.4, 0.4], solid(ramp([30, 30, 34])));
};

/** Cama: armazón de madera, colchón, frazada y almohada. */
const bed: Model = (c, variant) => {
  const f: Vec3 = variant === 1 ? [1, 0, 0] : [0, 0, 1];
  c.box(local(f, 0, 3.4, 0), facing(f), [7, 3.4, 13], planks(FURNITURE, 2, 4));
  c.box(local(f, 0, 9, -13), facing(f), [7.4, 9, 1], planks(DARK_WOOD, 0, 3));
  c.box(local(f, 0, 7.6, 0), facing(f), [6.4, 1.6, 12.4], solid(LINEN_WHITE));
  const blanket =
    [ramp([150, 40, 44]), ramp([50, 80, 140]), ramp([70, 110, 60])][variant % 3] ??
    ramp([150, 40, 44]);
  c.box(local(f, 0, 9.4, 3.4), facing(f), [6.8, 0.6, 9], (s) =>
    tone(blanket, s.light, Math.floor((s.p[0] + s.p[2] + 99) / 3) % 2 === 0 ? 0 : -1),
  );
  c.ellipsoid(local(f, 0, 10.2, -9.6), facing(f), [4.4, 1.6, 2.2], solid(LINEN_WHITE, 1));
};

/** Hogar: chimenea de piedra con el fuego encendido y leños. */
const hearth: Model = (c) => {
  const f: Vec3 = [Math.SQRT1_2, 0, Math.SQRT1_2];
  const stone = rocky(ramp([140, 128, 116]), 7);
  for (const sx of [-9, 9]) c.box(local(f, sx, 11, 0), facing(f), [3, 11, 5], stone);
  c.box(local(f, 0, 23.5, 0), facing(f), [12.4, 2.4, 6], stone);
  c.box(local(f, 0, 38, -1.5), facing(f), [6, 13, 3.6], stone);
  c.box(local(f, 0, 10, -3.8), facing(f), [6.2, 10, 1], solid(ramp([30, 24, 22])));
  c.limb(local(f, -4, 2, 0), local(f, 4, 2, 1), 1.4, 1.4, bark);
  c.ellipsoid(local(f, 0, 5, 0), UP, [4, 3, 3], glowing(ramp([255, 130, 40])));
  c.limb(local(f, 0, 5, 0), local(f, 0.5, 13, -0.5), 2.6, 0.3, glowing(ramp([255, 200, 90])));
};

/** Tonel acostado sobre un caballete, con canilla de bronce (la taberna). */
const keg: Model = (c, variant) => {
  const f: Vec3 = variant === 1 ? [0, 0, 1] : [1, 0, 0];
  for (const t of [-6, 6]) c.box(local(f, 0, 2.2, t), facing(f), [4.6, 2.2, 0.9], solid(DARK_WOOD));
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const t = -9 + (18 * i) / steps;
    const r = 4.4 + Math.sin((i / steps) * Math.PI) * 1.1;
    const ring = i === 3 || i === steps - 3;
    const end = i === steps;
    c.ellipsoid(
      local(f, 0, 8.6, t),
      axesAlong(f),
      [r, r, 0.7],
      ring
        ? metal(IRON)
        : end
          ? solid(ramp([170, 124, 76]))
          : (s) =>
              tone(FURNITURE, s.light, Math.floor(Math.atan2(s.p[1] - 8.6, 1) * 6) % 2 ? -1 : 0),
    );
  }
  c.limb(local(f, 0, 7, 9.4), local(f, 0, 5.4, 11), 0.5, 0.4, metal(BRASS));
};

/** Alfombra roja con guarda dorada (en el salón del trono y en las casas ricas). */
const carpet: Model = (c) => {
  // Lisa y del mismo rojo en todos los tiles, así varias seguidas forman un camino.
  c.box([0, 0.3, 0], UP, [H, 0.3, H], (s) =>
    tone(
      ramp([150, 36, 40]),
      s.light,
      noise(Math.floor(s.p[0] / 2), Math.floor(s.p[2] / 2)) > 0.85 ? -1 : 0,
    ),
  );
};

/** Candelabro de pie con cinco velas. */
const candelabra: Model = (c) => {
  const brass = metal(BRASS);
  c.ellipsoid([0, 1, 0], UP, [5, 1.2, 5], brass);
  c.limb([0, 1, 0], [0, 26, 0], 1, 0.8, brass);
  const across: Vec3 = [Math.SQRT1_2, 0, -Math.SQRT1_2];
  for (const k of [-2, -1, 0, 1, 2]) {
    const base: Vec3 = [
      across[0] * k * 3.4,
      26 + (k === 0 ? 3 : Math.abs(k) === 1 ? 1 : 0),
      across[2] * k * 3.4,
    ];
    c.limb([0, 24, 0], base, 0.6, 0.6, brass);
    c.ellipsoid(base, UP, [1.4, 0.5, 1.4], brass);
    c.limb(base, [base[0], base[1] + 5, base[2]], 0.9, 0.9, solid(LINEN_WHITE));
    c.limb(
      [base[0], base[1] + 5.4, base[2]],
      [base[0], base[1] + 8, base[2]],
      1,
      0.2,
      glowing(ramp([255, 214, 110])),
    );
  }
};

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

// ── Puertas y ventanas ──────────────────────────────────────────────

/** Qué hay en cada punto de una ventana: vidrio, plomo (las varillas), marco o nada. */
type WindowPart = 'glass' | 'lead' | 'frame' | null;
type WindowShape = (t: number, y: number) => WindowPart;

/** Dentro de una ojiva de medio ancho `w`, entre `y0` y el vértice `apex` (arranca en `spring`). */
function inLancet(
  t: number,
  y: number,
  w: number,
  y0: number,
  spring: number,
  apex: number,
): boolean {
  if (y < y0 || y > apex) return false;
  if (y <= spring) return Math.abs(t) < w;
  const k = (y - spring) / (apex - spring);
  return Math.abs(t) < w * Math.sqrt(1 - k * k) * (1 - k * 0.35);
}

/** Dentro de un arco de medio punto. */
function inRound(t: number, y: number, w: number, y0: number, spring: number): boolean {
  if (y < y0) return false;
  if (y <= spring) return Math.abs(t) < w;
  return t * t + (y - spring) ** 2 < w * w;
}

/** Ventanas góticas (muros de piedra), como las de los vitrales: ojival, doble y de medio punto. */
const GOTHIC: readonly WindowShape[] = [
  // Ojival con emplomado en rombos.
  (t, y) => {
    if (inLancet(t, y, 5.4, 12, 31, 44)) {
      const a = (((t + y) % 2.6) + 2.6) % 2.6;
      const b = (((t - y) % 2.6) + 2.6) % 2.6;
      return a < 0.35 || b < 0.35 ? 'lead' : 'glass';
    }
    return inLancet(t, y, 6.6, 11, 31, 46.5) ? 'frame' : null;
  },
  // Doble ojiva con parteluz y un óculo arriba.
  (t, y) => {
    for (const c of [-3.3, 3.3])
      if (inLancet(t - c, y, 2.4, 13, 30, 39)) return y % 3 < 0.4 ? 'lead' : 'glass';
    if (t * t + (y - 42.5) ** 2 < 3.2) return 'glass';
    return inLancet(t, y, 6.8, 11, 31, 47) ? 'frame' : null;
  },
  // Medio punto con cuadrícula.
  (t, y) => {
    if (inRound(t, y, 5.6, 12, 32)) {
      const grid =
        Math.abs(((t + 100) % 2.2) - 1.1) < 0.22 || Math.abs(((y + 100) % 3) - 1.5) < 0.25;
      return grid ? 'lead' : 'glass';
    }
    return inRound(t, y, 6.8, 11, 32) ? 'frame' : null;
  },
];

/** Ventana cuadrada con cruz de madera (cabañas y casas de tablas). */
const SQUARE: WindowShape = (t, y) => {
  if (Math.abs(t) < 5.4 && y > 15 && y < 33)
    return Math.abs(t) < 0.5 || Math.abs(y - 24) < 0.5 ? 'frame' : 'glass';
  return Math.abs(t) < 6.8 && y > 13.6 && y < 34.6 ? 'frame' : null;
};

/** Ojiva angosta (piedra negra), con vidrio ámbar. */
const NARROW: WindowShape = (t, y) => {
  if (inLancet(t, y, 3, 14, 34, 44)) return y % 3.4 < 0.4 ? 'lead' : 'glass';
  return inLancet(t, y, 4.2, 13, 34, 46) ? 'frame' : null;
};

/**
 * Una pared con ventana: la pared de su estilo y, sobre la cara que se ve,
 * la ventana (marco, vidrio y varillas). El vidrio refleja el cielo de día; de
 * noche la ventana alumbra (ver `lightRadius`).
 */
function windowWall(
  face: WallFace,
  shape: (variant: number) => WindowShape,
  front: number,
  glass: Ramp,
  frame: Ramp,
  shutters: boolean,
): Record<'x' | 'y', Model> {
  const draw = (c: VolumeCanvas, along: 0 | 2, variant: number): void => {
    face(c, along);
    const part = shape(variant);
    const lead = ramp([46, 44, 48]);
    for (const side of [front + 0.35]) {
      c.box(
        edge(along, 0, 29, side),
        UP,
        edgeHalf(along, H - 1, 17, 0.35),
        clipping((s) => {
          const t = s.p[along];
          const kind = part(t, s.p[1]);
          if (!kind) return null;
          if (kind === 'frame') return tone(frame, s.light);
          if (kind === 'lead') return tone(lead, s.light);
          // Reflejo: más claro arriba a la izquierda.
          const shine = s.p[1] > 30 && t < 0 ? 1 : 0;
          return tone(glass, 0.75 + s.light * 0.25, shine);
        }),
      );
    }
    if (shutters)
      for (const k of [-1, 1]) {
        c.box(
          edge(along, k * 9.6, 24, front + 1.2),
          UP,
          edgeHalf(along, 2.6, 9.4, 0.6),
          planks(ramp([70, 96, 70]), 1, 2),
        );
      }
  };
  return { x: (c, v) => draw(c, 0, v), y: (c, v) => draw(c, 2, v) };
}

const SKY_GLASS = ramp([92, 136, 176]);
const AMBER_GLASS = ramp([214, 146, 70]);
const STONE_WINDOW = windowWall(
  wall,
  (v) => GOTHIC[v % GOTHIC.length] ?? SQUARE,
  6,
  SKY_GLASS,
  ramp([186, 178, 160]),
  false,
);
const LOG_WINDOW = windowWall(logWall, () => SQUARE, 6, SKY_GLASS, ramp([110, 76, 46]), true);
const PLANK_WINDOW = windowWall(plankWall, () => SQUARE, 4.8, SKY_GLASS, ramp([96, 66, 40]), true);
const SANDSTONE_WINDOW = windowWall(
  sandstoneWall,
  (v) => GOTHIC[v % GOTHIC.length] ?? SQUARE,
  6,
  ramp([46, 56, 74]),
  ramp([150, 118, 80]),
  false,
);
const BASALT_WINDOW = windowWall(
  basaltWall,
  () => NARROW,
  6,
  AMBER_GLASS,
  ramp([110, 60, 44]),
  false,
);

/** Tipos de puerta: de madera (casas), de hierro (castillo y banco), de mazmorra y de huesos. */
type DoorStyle = 'wood' | 'iron' | 'dungeon' | 'bone';

/**
 * Qué hoja es: una puerta sola, o la hoja de abajo (`l`, la de menor
 * coordenada) o de arriba (`r`) de una puerta doble. Las dos hojas de una
 * doble tienen la bisagra en el marco de afuera, no hay jamba en el medio y
 * se abren de par en par.
 */
type DoorLeaf = 'single' | 'l' | 'r';

const BONE_WHITE = ramp([226, 218, 196]);

/**
 * Una puerta en su marco, sobre el borde de atrás del tile: dos jambas, el
 * dintel y la hoja. Abierta, la hoja gira sobre las bisagras hacia adelante.
 * - madera: tablones, bisagras de hierro y una argolla de bronce;
 * - hierro: planchas remachadas con flejes, en un marco de piedra;
 * - mazmorra: roble oscuro con flejes gruesos, clavos y una mirilla enrejada;
 * - huesos: fémures atados, con calaveras arriba y una calavera de argolla.
 */
function door(
  c: VolumeCanvas,
  along: 0 | 2,
  open: boolean,
  style: DoorStyle = 'wood',
  which: DoorLeaf = 'single',
): void {
  const inset = 3;
  const stone = style === 'iron' || style === 'dungeon';
  // Las jambas: en una doble, solo la del marco de afuera.
  const jambs = which === 'l' ? [-H + 1.6] : which === 'r' ? [H - 1.6] : [-H + 1.6, H - 1.6];
  const frame: Material =
    style === 'bone'
      ? solid(BONE_WHITE)
      : stone
        ? rocky(style === 'dungeon' ? ramp([92, 88, 84]) : ramp([150, 144, 134]), 3)
        : planks(DARK_WOOD, 1, 3);
  if (style === 'bone') {
    // Jambas de fémures y un dintel de costillas.
    for (const t of jambs) {
      c.limb(edge(along, t, 0, inset), edge(along, t, 44, inset), 1.6, 1.6, frame);
      c.sphere(edge(along, t, 44.5, inset), 2.4, frame);
    }
    c.limb(edge(along, -H + 1.6, 44, inset), edge(along, H - 1.6, 44, inset), 1.4, 1.4, frame);
  } else {
    for (const t of jambs) c.box(edge(along, t, 22, inset), UP, edgeHalf(along, 1.6, 22, 3), frame);
    c.box(
      edge(along, 0, 44, inset),
      UP,
      edgeHalf(along, H, 4, 3.2),
      stone ? frame : planks(DARK_WOOD, along, 4),
    );
  }
  // Media hoja: la sola va de jamba a jamba; la de una doble, de su jamba al medio.
  const width = which === 'single' ? H - 3.2 : H - 1.6;
  // La bisagra y hacia dónde crece la hoja (la `r` tiene la bisagra del otro lado).
  const hinge = which === 'r' ? H - 3.2 : -H + 3.2;
  const grow = which === 'r' ? -1 : 1;
  // Un punto de la hoja: `u` desde la bisagra (0) hasta el otro canto (2·width), `y` de alto, `d` hacia afuera.
  const leaf = (u: number, y: number, d: number): Vec3 => {
    if (!open) return edge(along, hinge + grow * u, y, inset + d);
    const a = hinge + grow * (1.2 + d);
    const depth = -H + inset + u;
    return along === 0 ? [a, y, depth] : [depth, y, a];
  };
  const leafHalf = (hu: number, hy: number, hd: number): Vec3 =>
    open ? (along === 0 ? [hd, hy, hu] : [hu, hy, hd]) : edgeHalf(along, hu, hy, hd);
  const across = (s: { p: Vec3 }): number => (open ? s.p[along === 0 ? 2 : 0] : s.p[along]);
  const iron = metal(ramp([60, 60, 66]));
  const w2 = width * 2;
  switch (style) {
    case 'wood': {
      c.box(leaf(width, 19.5, 0), UP, leafHalf(width, 19.5, 1.2), (s) =>
        tone(
          ramp([138, 92, 52]),
          s.light,
          Math.abs(((across(s) + 100) % 3.4) - 1.7) < 0.3 ? -1 : 0,
        ),
      );
      for (const y of [8, 31]) c.box(leaf(3.6, y, 1.3), UP, leafHalf(3.6, 0.8, 0.3), iron);
      c.sphere(leaf(w2 - 2.4, 19, 1.6), 0.9, metal(BRASS));
      break;
    }
    case 'iron': {
      const steel = ramp([120, 124, 132]);
      c.box(leaf(width, 19.5, 0), UP, leafHalf(width, 19.5, 1.2), (s) =>
        tone(
          steel,
          s.light,
          Math.abs(((s.p[1] + 100) % 9.6) - 4.8) < 0.5 ? -1 : s.light > 0.85 ? 1 : 0,
        ),
      );
      for (const y of [5, 14.6, 24.2, 33.8])
        for (let u = 2; u < w2; u += 4) c.sphere(leaf(u, y, 1.3), 0.55, metal(steel));
      c.limb(leaf(w2 - 3, 21, 1.6), leaf(w2 - 3, 17, 2.4), 0.5, 0.5, metal(ramp([60, 60, 66])));
      break;
    }
    case 'dungeon': {
      c.box(leaf(width, 19.5, 0), UP, leafHalf(width, 19.5, 1.6), (s) =>
        tone(ramp([72, 48, 32]), s.light, Math.abs(((across(s) + 100) % 4) - 2) < 0.35 ? -1 : 0),
      );
      for (const y of [6, 19, 32]) {
        c.box(leaf(width, y, 1.7), UP, leafHalf(width, 1.2, 0.3), iron);
        for (let u = 2; u < w2; u += 5) c.sphere(leaf(u, y, 2), 0.6, iron);
      }
      // Mirilla enrejada.
      c.box(leaf(width, 26, 1.7), UP, leafHalf(3, 2.4, 0.2), solid(ramp([18, 16, 16])));
      for (const k of [-1.6, 0, 1.6])
        c.limb(leaf(width + k, 23.4, 2), leaf(width + k, 28.6, 2), 0.35, 0.35, iron);
      c.sphere(leaf(w2 - 2.6, 15, 2.2), 1.1, iron);
      break;
    }
    case 'bone': {
      const bone = solid(BONE_WHITE);
      for (let u = 1.6; u < w2; u += 3.2) {
        c.limb(leaf(u, 1, 0), leaf(u, 36, 0), 1.3, 1.3, bone);
        c.sphere(leaf(u, 1, 0), 1.7, bone);
        c.sphere(leaf(u, 36.4, 0), 1.7, bone);
      }
      // Ataduras y calaveras.
      for (const y of [10, 26])
        c.box(leaf(width, y, 0.9), UP, leafHalf(width, 0.6, 0.4), solid(ramp([90, 64, 40])));
      const dark = solid(ramp([24, 20, 18]));
      for (const u of [width - 5, width + 5]) {
        c.sphere(leaf(u, 40, 0.5), 2.6, bone);
        c.sphere(leaf(u - 0.9, 40.4, 2.6), 0.6, dark);
        c.sphere(leaf(u + 0.9, 40.4, 2.6), 0.6, dark);
      }
      c.sphere(leaf(w2 - 3, 18, 1.8), 1.6, bone);
      c.sphere(leaf(w2 - 3.5, 18.4, 3.2), 0.4, dark);
      c.sphere(leaf(w2 - 2.5, 18.4, 3.2), 0.4, dark);
      break;
    }
  }
  if (open)
    // Se ve el piso del umbral.
    c.box(edge(along, 0, 0.3, inset), UP, edgeHalf(along, H - 3.2, 0.3, 3), solid(DARK_WOOD, -1));
}

/** Las puertas de cada tipo: sola y las dos hojas de una doble, en los dos ejes, cerradas y abiertas. */
function doorSpecs(): Record<string, StaticSpec> {
  const styles: [string, DoorStyle][] = [
    ['door', 'wood'],
    ['iron-door', 'iron'],
    ['dungeon-door', 'dungeon'],
    ['bone-door', 'bone'],
  ];
  const specs: Record<string, StaticSpec> = {};
  for (const [prefix, style] of styles)
    for (const [axis, along] of [
      ['x', 0],
      ['y', 2],
    ] as const)
      for (const which of ['single', 'l', 'r'] as const)
        for (const open of [false, true]) {
          const leaf = which === 'single' ? '' : `-${which}`;
          specs[`${prefix}-${axis}${leaf}${open ? '-open' : ''}`] = {
            model: (c) => door(c, along, open, style, which),
          };
        }
  return specs;
}

const LOG_WALL = wallSet(logWall, logPost);
const PLANK_WALL = wallSet(plankWall, plankPost);
const BASALT_WALL = wallSet(basaltWall, basaltPost);
const SANDSTONE_WALL = wallSet(sandstoneWall, sandstonePost);
const RAMPART_WALL = wallSet(rampart, rampartPost);

/** Los árboles los dibuja `tree-art`, cada especie con su ramificación. */
function tree(species: TreeSpecies): StaticSpec {
  return { model: (c, variant) => drawTree(c, species, variant), shadow: TREE_SHADOWS[species] };
}

// ── Escaleras para subir y bajar de piso ──────────────────────────────

/** Peldaños que suben hacia el fondo del tile (contra la pared de atrás). */
function steps(c: VolumeCanvas, count: number, rise: number, material: Material): void {
  const depth = (2 * H) / count;
  for (let i = 0; i < count; i++) {
    const top = (i + 1) * rise;
    c.box([0, top / 2, H - (i + 0.5) * depth], UP, [H - 3, top / 2, depth / 2], material);
  }
}

/** Escalera de madera: peldaños de tablas entre dos zancas y un pasamanos. */
const stairsWood: Model = (c) => {
  const wood = planks(WOOD, 0, 3);
  steps(c, 6, 6, wood);
  for (const x of [-H + 2, H - 2]) {
    c.limb([x, 3, H], [x, 37, -H], 1.6, 1.6, solid(DARK_WOOD));
    c.limb([x, 3, H - 1], [x, 14, H - 1], 0.9, 0.9, solid(DARK_WOOD));
    c.limb([x, 14, H - 1], [x, 48, -H + 1], 0.8, 0.8, solid(DARK_WOOD, 1));
  }
};

/** Escalera de piedra: bloques macizos en hiladas, con una baranda baja de piedra. */
const stairsStone: Model = (c) => {
  steps(c, 6, 6, masonry(0));
  for (const x of [-H + 1.5, H - 1.5]) {
    for (let i = 0; i < 6; i++) {
      const z = H - (i + 0.5) * ((2 * H) / 6);
      c.box([x, (i + 1) * 3 + 3, z], UP, [1.6, (i + 1) * 3 + 3, (2 * H) / 12], masonry(2));
    }
  }
};

/** Escalera de caracol: una columna con peldaños en abanico que suben girando. */
const spiralStairs: Model = (c) => {
  const stone = masonry(0);
  const iron = metal(IRON);
  cylinder(c, [0, 0, 0], 66, () => 2.6, solid(ramp([118, 110, 98])));
  const count = 11;
  const angle = (i: number): number => Math.PI * 0.7 - (i / count) * Math.PI * 1.6;
  for (let i = 0; i < count; i++) {
    const a = angle(i);
    const y = 3 + i * 6;
    const dir: Vec3 = [Math.cos(a), 0, Math.sin(a)];
    c.box([dir[0] * 8, y, dir[2] * 8], axesAlong(dir), [2.6, 1, 6], stone);
    c.limb(
      [dir[0] * 13.5, y, dir[2] * 13.5],
      [dir[0] * 13.5, y + 11, dir[2] * 13.5],
      0.5,
      0.5,
      iron,
    );
    if (i > 0) {
      const p = angle(i - 1);
      c.limb(
        [Math.cos(p) * 13.5, y + 5, Math.sin(p) * 13.5],
        [dir[0] * 13.5, y + 11, dir[2] * 13.5],
        0.55,
        0.55,
        iron,
      );
    }
  }
};

/** Escalera de mano: apoyada contra la pared de atrás, sube hasta una abertura en el techo. */
const ladderUp: Model = (c) => {
  const wood = planks(WOOD, 1);
  c.box([0, 62, -H + 3], UP, [9, 1.2, 5], solid(ramp([24, 20, 18])));
  for (const x of [-6, 6]) c.limb([x, 0, 2], [x, 62, -H + 4], 1.4, 1.2, wood);
  for (let i = 1; i <= 9; i++) {
    const t = i / 10;
    const z = 2 + t * (-H + 2);
    c.limb([-6, t * 62, z], [6, t * 62, z], 0.9, 0.9, solid(WOOD, 1));
  }
};

/** Bajada: el hueco de la escalera en el piso, con los peldaños que se pierden abajo y una baranda. */
const stairHole: Model = (c) => {
  c.box([0, 0.3, 0], UP, [H - 2, 0.4, H - 2], solid(ramp([18, 15, 13])));
  for (let i = 0; i < 4; i++) {
    const z = H - 5 - i * 6;
    c.box([0, 0.6, z], UP, [H - 5, 0.3, 2.6], (s) => tone(WOOD, s.light * (0.8 - i * 0.18), 0));
  }
  // Baranda en el fondo y los costados (adelante queda abierto: por ahí se baja).
  const rail = solid(DARK_WOOD);
  for (const [x, z] of [
    [-H + 1, -H + 1],
    [H - 1, -H + 1],
    [-H + 1, 2],
    [H - 1, 2],
  ] as const)
    c.limb([x, 0, z], [x, 14, z], 1, 1, rail);
  c.limb([-H + 1, 13, -H + 1], [H - 1, 13, -H + 1], 0.9, 0.9, rail);
  c.limb([-H + 1, 13, -H + 1], [-H + 1, 13, 2], 0.9, 0.9, rail);
  c.limb([H - 1, 13, -H + 1], [H - 1, 13, 2], 0.9, 0.9, rail);
};

/** Trampilla: una tapa de madera levantada contra la pared y el hueco oscuro con la escalera. */
const trapdoor: Model = (c) => {
  c.box([0, 0.3, 3], UP, [12, 0.4, 11], solid(ramp([18, 15, 13])));
  for (const x of [-6, 6]) c.limb([x, 0.5, 13], [x, 0.5, -6], 1, 1, solid(WOOD, -1));
  for (let z = -4; z <= 12; z += 4) c.limb([-6, 0.6, z], [6, 0.6, z], 0.7, 0.7, solid(WOOD));
  const lid = planks(WOOD, 0, 3);
  const back = axesAlong([0, 0.25, -1]);
  c.box([0, 12, -10], back, [12.5, 12, 1.4], lid);
  c.sphere([0, 12, -8.4], 1.6, metal(IRON));
};

/** Parapeto de azotea: un muro bajo de piedra con almenas, sobre el borde de atrás del tile. */
function parapet(c: VolumeCanvas, along: 0 | 2): void {
  const low = 12;
  const at = (t: number, y: number): Vec3 => (along === 0 ? [t, y, -H + 3] : [-H + 3, y, t]);
  const half = (len: number, tall: number): Vec3 => (along === 0 ? [len, tall, 3] : [3, tall, len]);
  c.box(at(0, low / 2), UP, half(H, low / 2), masonry(along));
  // Dos almenas por tile, con el hueco en el medio (como un castillo).
  for (const t of [-H / 2, H / 2]) c.box(at(t, low + 4), UP, half(H / 4, 4), masonry(along));
  c.box(at(0, low + 0.6), UP, half(H, 0.6), solid(STONE, 1));
}

const parapetX: Model = (c) => parapet(c, 0);
const parapetY: Model = (c) => parapet(c, 2);
const parapetCorner: Model = (c) => {
  parapet(c, 0);
  parapet(c, 2);
  // Pináculo en la esquina.
  c.box([-H + 3, 14, -H + 3], UP, [4.5, 14, 4.5], masonry(0));
  c.limb([-H + 3, 28, -H + 3], [-H + 3, 38, -H + 3], 3.4, 0.6, solid(STONE, 1));
};
const parapetPost: Model = (c) => {
  c.box([-H + 3, 14, -H + 3], UP, [4.5, 14, 4.5], masonry(0));
  c.limb([-H + 3, 28, -H + 3], [-H + 3, 38, -H + 3], 3.4, 0.6, solid(STONE, 1));
};

// ── Bajo la ciudad: alcantarillas y catacumbas ───────────────────────

const MOSSY = ramp([112, 110, 88]);
const MOSS = ramp([78, 96, 52]);

/** Bloques grandes de piedra gris oliva, con musgo que cuelga de las juntas. */
function mossyBlocks(seed: number): Material {
  return (s) => {
    const course = Math.floor((s.p[1] + 200) / 7);
    const along = Math.abs(s.n[0]) > Math.abs(s.n[2]) ? s.p[2] : s.p[0];
    const pos = along + (course % 2) * 6 + 200;
    const inCourse = (s.p[1] + 200) % 7;
    if (inCourse < 1 || pos % 12 < 1) return tone(ramp([60, 58, 48]), s.light);
    const block = noise(Math.floor(pos / 12), course, seed);
    const lichen = noise(Math.floor(pos / 4), Math.floor((s.p[1] + 200) / 3), seed + 5);
    const moss = lichen > (s.p[1] < 8 ? 0.72 : 0.9);
    if (moss) return tone(MOSS, s.light, block > 0.5 ? 1 : 0);
    return tone(MOSSY, s.light, block > 0.75 ? 1 : block < 0.25 ? -1 : 0);
  };
}

/** Muro de alcantarilla: un bloque macizo que llena el tile, con el remate escalonado. */
const sewerWall: Model = (c, variant) => {
  const stone = mossyBlocks(variant * 11);
  c.box([0, 18, 0], UP, [H, 18, H], stone);
  // Remate: bloques sueltos a distintas alturas, como un muro viejo.
  for (const [x, z, h] of [
    [-H / 2, -H / 2, 5],
    [H / 2, -H / 2, 3],
    [-H / 2, H / 2, 2],
    [H / 2, H / 2, 4],
  ] as const)
    c.box([x, 36 + h / 2, z], UP, [H / 2, h / 2, H / 2], stone);
};

/** Pared agrietada: el mismo muro con una grieta oscura por donde se pasa (un pasadizo). */
const crackedWall: Model = (c, variant) => {
  const stone = mossyBlocks(variant * 11 + 3);
  c.box([0, 18, 0], UP, [H, 18, H], (s) => {
    const crack = Math.abs(s.p[0] - s.p[2] * 0.3 - Math.sin(s.p[1] / 5) * 2) < 3.2 && s.p[1] < 32;
    if (crack && (s.n[0] > 0.5 || s.n[2] > 0.5)) return tone(ramp([16, 14, 12]), s.light * 0.2);
    return stone(s);
  });
};

/** Baba verde y brillante sobre el piso. */
const slime: Model = (c, variant) => {
  const goo = (s: { light: number }) => tone(ramp([96, 150, 60]), 0.5 + s.light * 0.5);
  for (let i = 0; i < 4; i++) {
    const x = (noise(i, variant, 31) - 0.5) * 18;
    const z = (noise(i, variant, 32) - 0.5) * 18;
    c.ellipsoid(
      [x, 0.5, z],
      UP,
      [3 + noise(i, variant, 33) * 5, 0.7, 2.5 + noise(i, variant, 34) * 4],
      goo,
    );
  }
  c.sphere([2, 1.4, 1], 1.1, solid(ramp([186, 220, 120]), 1));
};

/** Un agujero en el piso del que sale un gas amarillento. */
const noxiousHole: Model = (c) => {
  c.ellipsoid([0, 0.4, 0], UP, [10, 0.5, 9], solid(ramp([122, 112, 70])));
  c.ellipsoid([0, 0.7, 0], UP, [6.5, 0.6, 6], solid(ramp([24, 22, 16])));
  const gas = (s: { light: number }) => tone(ramp([196, 200, 96]), 0.7 + s.light * 0.3);
  c.ellipsoid([1, 7, 0], UP, [5, 4, 5], gas);
  c.ellipsoid([-1, 13, 1], UP, [3.5, 3, 3.5], gas);
  c.ellipsoid([1, 18, -1], UP, [2.2, 2, 2.2], gas);
};

/** Un montón de calaveras y huesos contra la pared (el osario de las catacumbas). */
const skullPile: Model = (c, variant) => {
  const bone = solid(BONE);
  const hollow = solid(ramp([30, 26, 22]));
  for (let i = 0; i < 14; i++) {
    const layer = i < 7 ? 0 : i < 11 ? 1 : 2;
    const x = (noise(i, variant, 41) - 0.5) * (18 - layer * 6);
    const z = (noise(i, variant, 42) - 0.5) * (14 - layer * 4) - 4;
    const y = 3 + layer * 5;
    c.sphere([x, y, z], 3.2, bone);
    c.sphere([x + 1, y + 0.4, z + 2.8], 0.8, hollow);
    c.sphere([x - 1, y + 0.4, z + 2.8], 0.8, hollow);
  }
  for (let i = 0; i < 5; i++) {
    const a = noise(i, variant, 43) * Math.PI;
    c.limb(
      [Math.cos(a) * 10, 1, Math.sin(a) * 6],
      [-Math.cos(a) * 8, 2, -Math.sin(a) * 6],
      0.8,
      0.8,
      bone,
    );
  }
};

/** Una baldosa floja: apenas levantada, con una junta oscura alrededor (esconde un pasadizo). */
const looseFlagstone: Model = (c) => {
  c.box([0, 0.2, 0], UP, [9.5, 0.3, 9.5], solid(ramp([34, 30, 26])));
  c.box(
    [0.6, 1.2, -0.4],
    axesAlong([1, 0.06, 0.02]),
    [8.5, 0.9, 8.5],
    solid(ramp([138, 130, 116])),
  );
};

const SPECS: Readonly<Record<StaticKind, StaticSpec>> = {
  oak: tree('oak'),
  pine: tree('pine'),
  bush: { model: bush, shadow: [13, 6] },
  rock: { model: rock, shadow: [14, 6] },
  flowers: { model: flowers },
  'wall-x': { model: wallX },
  'wall-y': { model: wallY },
  'wall-corner': { model: wallCorner },
  'wall-post': { model: wallPost },
  'fence-x': { model: fenceX },
  'fence-y': { model: fenceY },
  barrel: { model: barrel, shadow: [11, 5] },
  crate: { model: crate, shadow: [14, 6] },
  well: { model: well, shadow: [18, 8] },
  lamp: { model: lamp, shadow: [6, 3] },
  sign: { model: sign, shadow: [9, 4] },
  shrine: { model: shrine, shadow: [18, 8] },
  forge: { model: forge, shadow: [20, 8] },
  anvil: { model: anvil, shadow: [14, 6] },
  'cave-wall': { model: caveWall },
  'cave-entrance': { model: caveEntrance, shadow: [34, 14] },
  ladder: { model: ladder },
  brazier: { model: brazier, shadow: [9, 4] },
  sarcophagus: { model: sarcophagus, shadow: [18, 8] },
  'sewer-grate': { model: sewerGrate },
  'stairs-wood': { model: stairsWood },
  'stairs-stone': { model: stairsStone },
  'spiral-stairs': { model: spiralStairs, shadow: [16, 7] },
  'ladder-up': { model: ladderUp },
  'stair-hole': { model: stairHole },
  trapdoor: { model: trapdoor },
  'parapet-x': { model: parapetX },
  'parapet-y': { model: parapetY },
  'parapet-corner': { model: parapetCorner },
  'parapet-post': { model: parapetPost },
  'sandstone-wall-x': { model: SANDSTONE_WALL.x },
  'sandstone-wall-y': { model: SANDSTONE_WALL.y },
  'sandstone-wall-corner': { model: SANDSTONE_WALL.corner },
  'sandstone-wall-post': { model: SANDSTONE_WALL.post },
  'sandstone-window-x': { model: SANDSTONE_WINDOW.x },
  'sandstone-window-y': { model: SANDSTONE_WINDOW.y },
  'sewer-wall': { model: sewerWall },
  'cracked-wall': { model: crackedWall },
  slime: { model: slime, flat: true },
  'noxious-hole': { model: noxiousHole },
  'skull-pile': { model: skullPile, shadow: [14, 6] },
  'loose-flagstone': { model: looseFlagstone, flat: true },
  cobweb: { model: cobweb },
  ship: {
    model: ship(false),
    frame: { width: 260, height: 250, ground: { x: 130, y: 196 } },
  },
  'pirate-ship': {
    model: ship(true),
    frame: { width: 260, height: 250, ground: { x: 130, y: 196 } },
  },
  'pier-post': { model: pierPost, shadow: [6, 3] },
  bones: { model: bones },
  stalagmite: { model: stalagmite, shadow: [9, 4] },
  ceibo: tree('ceibo'),
  gomero: tree('gomero'),
  willow: tree('willow'),
  poplar: tree('poplar'),
  'dead-tree': tree('dead-tree'),
  mountain: { model: mountain },
  crag: { model: crag({ count: 6, tall: 50, spread: 1.1, width: 11 }), shadow: [24, 11] },
  'crag-spire': { model: crag({ count: 4, tall: 76, spread: 0.8, width: 9 }), shadow: [18, 9] },
  'crag-ledge': { model: crag({ count: 8, tall: 30, spread: 1.35, width: 12 }), shadow: [28, 12] },
  cactus: { model: cactus, shadow: [10, 4] },
  tent: { model: tent, shadow: [26, 11] },
  campfire: { model: campfire, shadow: [10, 4] },
  gravestone: { model: gravestone, shadow: [10, 4] },
  lighthouse: {
    model: lighthouse,
    shadow: [56, 22],
    frame: { width: 200, height: 290, ground: { x: 100, y: 262 } },
  },
  rubble: { model: rubble },
  reeds: { model: reeds },
  'snow-pine': tree('snow-pine'),
  palm: tree('palm'),
  'jungle-tree': tree('jungle-tree'),
  birch: tree('birch'),
  acacia: tree('acacia'),
  'tall-grass': { model: tallGrass },
  weeds: { model: weeds },
  fern: { model: fern },
  mushrooms: { model: mushrooms },
  wildflowers: { model: wildflowers },
  peyote: { model: peyote, shadow: [9, 4] },
  'dry-shrub': { model: dryShrub },
  pebbles: { model: pebbles },
  boulder: { model: boulder, shadow: [22, 9] },
  'mossy-rock': { model: mossyRock, shadow: [14, 6] },
  'jungle-plant': { model: junglePlant, shadow: [16, 7] },
  'tundra-shrub': { model: tundraShrub },
  column: { model: column, shadow: [12, 5] },
  'fallen-column': { model: fallenColumn, shadow: [22, 8] },
  maple: tree('maple'),
  cypress: tree('cypress'),
  baobab: tree('baobab'),
  bamboo: tree('bamboo'),
  'log-wall-x': { model: LOG_WALL.x },
  'log-wall-y': { model: LOG_WALL.y },
  'log-wall-corner': { model: LOG_WALL.corner },
  'log-wall-post': { model: LOG_WALL.post },
  'plank-wall-x': { model: PLANK_WALL.x },
  'plank-wall-y': { model: PLANK_WALL.y },
  'plank-wall-corner': { model: PLANK_WALL.corner },
  'plank-wall-post': { model: PLANK_WALL.post },
  'basalt-wall-x': { model: BASALT_WALL.x },
  'basalt-wall-y': { model: BASALT_WALL.y },
  'basalt-wall-corner': { model: BASALT_WALL.corner },
  'basalt-wall-post': { model: BASALT_WALL.post },
  'rampart-x': { model: RAMPART_WALL.x },
  'rampart-y': { model: RAMPART_WALL.y },
  'rampart-corner': { model: RAMPART_WALL.corner },
  'rampart-post': { model: RAMPART_WALL.post },
  tower: {
    model: tower,
    shadow: [44, 18],
    frame: { width: 168, height: 224, ground: { x: 84, y: 196 } },
  },
  'palisade-x': { model: (c) => palisade(c, 0) },
  'palisade-y': { model: (c) => palisade(c, 2) },
  'palisade-post': { model: palisadePost },
  'iron-fence-x': { model: (c) => ironFence(c, 0) },
  'iron-fence-y': { model: (c) => ironFence(c, 2) },
  crypt: { model: crypt, shadow: [40, 16] },
  stall: { model: stall, shadow: [18, 8] },
  banner: { model: banner, shadow: [8, 3] },
  throne: { model: throne, shadow: [14, 6] },
  fountain: { model: fountain, shadow: [34, 14] },
  'hay-bale': { model: hayBale, shadow: [14, 6] },
  'hay-pile': { model: hayPile },
  'hitching-post': { model: hitchingPost, shadow: [14, 5] },
  'water-trough': { model: waterTrough, shadow: [14, 6] },
  'stump-axe': { model: stumpAxe, shadow: [10, 4] },
  'log-pile': { model: logPile, shadow: [16, 7] },
  workbench: { model: workbench, shadow: [16, 7] },
  'alchemy-table': { model: alchemyTable, shadow: [16, 7] },
  'bookshelf-x': { model: (c) => bookshelf(c, 0, false) },
  'bookshelf-y': { model: (c) => bookshelf(c, 2, false) },
  'potion-shelf-x': { model: (c) => bookshelf(c, 0, true) },
  'potion-shelf-y': { model: (c) => bookshelf(c, 2, true) },
  cauldron: { model: cauldron, shadow: [10, 4] },
  table: { model: table, shadow: [14, 6] },
  stool: { model: stool, shadow: [6, 3] },
  counter: { model: counter, shadow: [12, 5] },
  chest: { model: chest, shadow: [11, 5] },
  'weapon-rack': { model: weaponRack, shadow: [14, 5] },
  'armor-stand': { model: armorStand, shadow: [8, 3] },
  bed: { model: bed, shadow: [16, 7] },
  hearth: { model: hearth, shadow: [16, 6] },
  keg: { model: keg, shadow: [11, 5] },
  'chair-n': { model: (c) => chair(c, [0, 0, -1]), shadow: [7, 3] },
  'chair-e': { model: (c) => chair(c, [1, 0, 0]), shadow: [7, 3] },
  'chair-s': { model: (c) => chair(c, [0, 0, 1]), shadow: [7, 3] },
  'chair-w': { model: (c) => chair(c, [-1, 0, 0]), shadow: [7, 3] },
  'bench-x': { model: (c) => bench(c, 0), shadow: [14, 5] },
  'bench-y': { model: (c) => bench(c, 2), shadow: [14, 5] },
  sawhorse: { model: sawhorse, shadow: [10, 4] },
  'plank-stack': { model: plankStack, shadow: [14, 6] },
  carpet: { model: carpet, flat: true },
  candelabra: { model: candelabra, shadow: [6, 3] },
  ...(doorSpecs() as Record<Extract<StaticKind, `${string}door-${string}`>, StaticSpec>),
  'wall-window-x': { model: STONE_WINDOW.x },
  'wall-window-y': { model: STONE_WINDOW.y },
  'log-window-x': { model: LOG_WINDOW.x },
  'log-window-y': { model: LOG_WINDOW.y },
  'plank-window-x': { model: PLANK_WINDOW.x },
  'plank-window-y': { model: PLANK_WINDOW.y },
  'basalt-window-x': { model: BASALT_WINDOW.x },
  'basalt-window-y': { model: BASALT_WINDOW.y },
};
