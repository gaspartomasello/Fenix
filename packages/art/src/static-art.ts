import type { StaticKind } from '@fenix/shared';
import { PixelImage, type Rgb } from './pixel-art';
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
export const STATIC_ART_WIDTH = 88;
export const STATIC_ART_HEIGHT = 132;
export const STATIC_GROUND = { x: 44, y: 110 } as const;
export const STATIC_VARIANTS = 3;

const OUTLINE: Rgb = [27, 19, 14];

/**
 * Medio lado del tile en el modelo: un paso en x se ve de largo 1 en la
 * diagonal de la pantalla, así el borde del tile (22 px en x y en y) mide 22·√2.
 */
const H = 22 * Math.SQRT2 * 0.5;

type Model = (c: VolumeCanvas, variant: number) => void;

interface StaticSpec {
  readonly model: Model;
  /** Radios de la sombra en el suelo (en pixeles de pantalla). */
  readonly shadow?: readonly [number, number];
}

/** Dibuja un objeto fijo. Las variantes cambian detalles (copa, flores, piedras…). */
export function drawStatic(kind: StaticKind, variant: number): PixelImage {
  const spec = SPECS[kind];
  const canvas = new VolumeCanvas(
    STATIC_ART_WIDTH,
    STATIC_ART_HEIGHT,
    new WorldProjection(STATIC_GROUND.x, STATIC_GROUND.y),
  );
  spec.model(canvas, variant % STATIC_VARIANTS);
  const body = canvas.toImage(OUTLINE);
  const image = new PixelImage(STATIC_ART_WIDTH, STATIC_ART_HEIGHT);
  if (spec.shadow) softShadow(image, spec.shadow[0], spec.shadow[1]);
  image.draw(body, 0, 0);
  return image;
}

/** Sombra difusa en el suelo, corrida a la derecha (la luz viene de la izquierda). */
function softShadow(image: PixelImage, rx: number, ry: number): void {
  const cx = STATIC_GROUND.x + rx * 0.25;
  const cy = STATIC_GROUND.y + ry * 0.2;
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
const LEAF = ramp([62, 116, 48]);
const PINE = ramp([40, 88, 52]);
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

const oak: Model = (c, variant) => {
  cylinder(c, [0, 0, 0], 40, (t) => 4.8 - t * 1.6, bark);
  // Raíces que asoman.
  for (const a of [0.3, 2.2, 4.1])
    c.limb([0, 1.5, 0], [Math.cos(a) * 8, 0, Math.sin(a) * 8], 2.6, 1, bark);
  // Ramas hacia la copa.
  c.limb([0, 30, 0], [-10, 48, 3], 2.4, 1.2, bark);
  c.limb([0, 32, 0], [10, 50, -3], 2.4, 1.2, bark);
  const leaves = foliage(LEAF, variant * 13);
  const shift = (variant - 1) * 3;
  const blobs: [number, number, number, number][] = [
    [0, 62, 0, 20],
    [-16, 54, 4, 14],
    [16, 55, -4, 14],
    [-6, 74, -5, 14],
    [8, 72, 6, 14],
    [0, 52, 13, 12],
    [-4, 53, -13, 12],
    [12, 64, 10, 11],
  ];
  for (const [x, y, z, r] of blobs) c.sphere([x + shift, y, z], r, leaves);
};

const pine: Model = (c, variant) => {
  cylinder(c, [0, 0, 0], 16, (t) => 2.6 - t * 0.6, bark);
  const needles = foliage(PINE, variant * 7);
  // Pisos de ramas: discos que se achican hacia la punta.
  const levels = 8 + variant;
  for (let i = 0; i < levels; i++) {
    const t = i / (levels - 1);
    const y = 14 + t * 62;
    const r = 17 * (1 - t) + 2;
    // Cada piso, apenas girado y con el borde caído.
    c.ellipsoid(
      [0, y, 0],
      axesAlong([Math.sin(i * 1.3), -0.25, Math.cos(i * 1.3)]),
      [r, 5.5 - t * 2, r],
      needles,
    );
  }
  c.limb([0, 74, 0], [0, 84, 0], 1.6, 0.3, needles);
};

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

const SPECS: Readonly<Record<StaticKind, StaticSpec>> = {
  oak: { model: oak, shadow: [34, 14] },
  pine: { model: pine, shadow: [20, 9] },
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
};
