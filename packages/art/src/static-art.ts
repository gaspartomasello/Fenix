import type { StaticKind } from '@fenix/shared';
import { PixelImage, type Rgb } from './pixel-art';
import { TREE_SHADOWS, drawTree, type TreeSpecies } from './tree-art';
import {
  VolumeCanvas,
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
  const body = canvas.toImage(OUTLINE);
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

/** Estalagmita: un cono de roca que sube del suelo. */
const stalagmite: Model = (c, variant) => {
  const material = caveRock(variant * 5 + 2);
  cylinder(c, [0, 0, 0], 30 + variant * 6, (t) => 7 * (1 - t) ** 1.2 + 0.6, material);
  if (variant !== 0) cylinder(c, [7, 0, 4], 14, (t) => 4 * (1 - t) + 0.4, material);
};

// ── Lugares del mundo ───────────────────────────────────────────────

/** Montaña: una mole de roca con riscos angulosos; juntas forman cordilleras. */
const mountain: Model = (c, variant) => {
  const face = rocky(ramp([124, 116, 104]), variant * 11 + 4);
  const dark = rocky(ramp([98, 92, 84]), variant * 11 + 5);
  // La base llena el tile y se derrama sobre los vecinos, así no quedan huecos.
  c.ellipsoid([0, 6, 0], UP, [H * 1.5, 12, H * 1.5], dark);
  // Riscos: lajas de roca inclinadas, de distinto alto, que se apoyan unas en otras.
  for (let i = 0; i < 7; i++) {
    const x = (noise(i, variant, 61) - 0.5) * 26;
    const z = (noise(i, variant, 62) - 0.5) * 26;
    const height = 18 + noise(i, variant, 63) * 30 + (i === 0 ? 22 : 0);
    const turn = noise(i, variant, 64) * Math.PI;
    const tilt = (noise(i, variant, 65) - 0.5) * 0.5;
    const axes = axesAlong([Math.cos(turn), 0, Math.sin(turn)], [tilt, 1, tilt * 0.5]);
    c.box(
      [x, height / 2, z],
      axes,
      [7 + noise(i, variant, 66) * 4, height / 2, 5],
      i % 2 ? face : dark,
    );
    c.ellipsoid([x, height, z], axes, [5, 4, 4], face);
  }
};

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

const LOG_WALL = wallSet(logWall, logPost);
const PLANK_WALL = wallSet(plankWall, plankPost);
const BASALT_WALL = wallSet(basaltWall, basaltPost);
const RAMPART_WALL = wallSet(rampart, rampartPost);

/** Los árboles los dibuja `tree-art`, cada especie con su ramificación. */
function tree(species: TreeSpecies): StaticSpec {
  return { model: (c, variant) => drawTree(c, species, variant), shadow: TREE_SHADOWS[species] };
}

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
  bones: { model: bones },
  stalagmite: { model: stalagmite, shadow: [9, 4] },
  ceibo: tree('ceibo'),
  gomero: tree('gomero'),
  willow: tree('willow'),
  poplar: tree('poplar'),
  'dead-tree': tree('dead-tree'),
  mountain: { model: mountain, shadow: [30, 13] },
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
};
