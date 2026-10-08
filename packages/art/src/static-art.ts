import type { StaticKind } from '@fenix/shared';
import { PixelImage, seededRandom, shade, type Point, type Rgb } from './pixel-art';

/**
 * Lienzo lógico de un objeto fijo (se escala x2 al dibujar). El rombo del
 * tile donde está apoyado ocupa la parte de abajo: centro en GROUND.
 */
export const STATIC_ART_WIDTH = 44;
export const STATIC_ART_HEIGHT = 66;
export const STATIC_GROUND = { x: 22, y: 55 } as const;
export const STATIC_VARIANTS = 3;

const OUTLINE: Rgb = [27, 19, 14];

/** Esquinas del rombo del tile en el lienzo del objeto. */
const TILE = {
  top: { x: 22, y: 44 },
  right: { x: 33, y: 55 },
  bottom: { x: 22, y: 66 },
  left: { x: 11, y: 55 },
} as const;

type Painter = (image: PixelImage, random: () => number) => void;

/** Dibuja un objeto fijo. Las variantes cambian detalles (copa, posición de flores…). */
export function drawStatic(kind: StaticKind, variant: number): PixelImage {
  const random = seededRandom(hashKind(kind) * 97 + variant * 13 + 1);
  const image = new PixelImage(STATIC_ART_WIDTH, STATIC_ART_HEIGHT);
  const spec = SPECS[kind];

  if (spec.shadow) {
    const [rx, ry] = spec.shadow;
    image.fillEllipse(STATIC_GROUND.x + 2, STATIC_GROUND.y + 1, rx, ry, [0, 0, 0], 70);
  }
  const body = new PixelImage(STATIC_ART_WIDTH, STATIC_ART_HEIGHT);
  spec.paint(body, random);
  if (spec.outline) body.outline(OUTLINE);
  image.draw(body, 0, 0);
  return image;
}

interface StaticSpec {
  readonly paint: Painter;
  readonly outline: boolean;
  /** Radios de la sombra en el suelo. */
  readonly shadow?: readonly [number, number];
}

// ── Vegetación ──────────────────────────────────────────────────────

const LEAF: Rgb = [58, 110, 46];
const BARK: Rgb = [92, 62, 38];

function crownShade(base: Rgb, cx: number, cy: number, r: number): (x: number, y: number) => Rgb {
  return (x, y) => {
    // Luz desde arriba a la izquierda, con grano de hojas.
    const light = 1.25 - ((x - cx) / r) * 0.18 - ((y - cy) / r) * 0.28;
    const grain = (Math.imul(x * 7 + 3, y * 13 + 5) & 7) / 40;
    return shade(base, light - grain);
  };
}

const paintOak: Painter = (img, random) => {
  img.fillRect(20, 38, 4, 18, BARK);
  img.fillRect(20, 38, 1, 18, shade(BARK, 1.25));
  img.fillRect(23, 38, 1, 18, shade(BARK, 0.7));
  const cx = 22 + Math.round((random() - 0.5) * 3);
  const cy = 26;
  const leaf = shade(LEAF, 0.9 + random() * 0.2);
  const blobs: [number, number, number, number][] = [
    [cx, cy, 15, 12],
    [cx - 8, cy + 5, 8, 7],
    [cx + 8, cy + 4, 8, 7],
    [cx - 3, cy - 7, 9, 7],
  ];
  for (const [x, y, rx, ry] of blobs) {
    img.fillEllipse(x, y, rx + random(), ry + random(), crownShade(leaf, cx, cy, 15));
  }
};

const paintPine: Painter = (img, random) => {
  img.fillRect(21, 46, 3, 10, BARK);
  const leaf = shade([40, 86, 50], 0.9 + random() * 0.15);
  const layers: [number, number, number][] = [
    [48, 13, 14],
    [38, 11, 13],
    [28, 8, 12],
  ];
  for (const [base, half, height] of layers) {
    img.fillPolygon(
      [
        { x: 22, y: base - height },
        { x: 22 + half, y: base },
        { x: 22 - half, y: base },
      ],
      crownShade(leaf, 22, base - height / 2, half),
    );
  }
};

const paintBush: Painter = (img, random) => {
  const leaf = shade(LEAF, 1.05);
  img.fillEllipse(19, 52, 6, 5, crownShade(leaf, 19, 50, 6));
  img.fillEllipse(25, 51, 6, 5, crownShade(leaf, 24, 49, 6));
  img.fillEllipse(22, 48, 6, 5, crownShade(leaf, 22, 46, 6));
  if (random() > 0.4) {
    for (let i = 0; i < 4; i++) {
      img.set(17 + Math.floor(random() * 11), 46 + Math.floor(random() * 8), [178, 42, 52]);
    }
  }
};

const paintRock: Painter = (img, random) => {
  const stone: Rgb = [128, 124, 118];
  const w = 7 + Math.floor(random() * 3);
  const points: Point[] = [
    { x: 22 - w, y: 57 },
    { x: 22 - w + 1, y: 51 },
    { x: 20, y: 46 - Math.floor(random() * 2) },
    { x: 25, y: 47 },
    { x: 22 + w, y: 52 },
    { x: 22 + w - 1, y: 57 },
  ];
  img.fillPolygon(points, (x, y) => shade(stone, 1.25 - (y - 46) * 0.04 - (x - 22) * 0.015));
  img.fillRect(19, 49, 3, 1, shade(stone, 1.35));
};

const paintFlowers: Painter = (img, random) => {
  const colors: Rgb[] = [
    [228, 214, 92],
    [214, 120, 160],
    [236, 236, 230],
    [140, 120, 220],
  ];
  for (let i = 0; i < 12; i++) {
    const x = 14 + Math.floor(random() * 15);
    const y = 48 + Math.floor(random() * 11);
    const color = colors[Math.floor(random() * colors.length)] ?? [255, 255, 255];
    img.fillRect(x, y + 1, 1, 2, [52, 98, 40]);
    img.fillRect(x - 1, y, 3, 1, color);
    img.set(x, y - 1, color);
    img.set(x, y, shade(color, 0.8));
  }
};

// ── Construcciones ──────────────────────────────────────────────────

const WALL_HEIGHT = 24;
const STONE_WALL: Rgb = [156, 146, 130];

/**
 * Pared sobre un borde del rombo, con hiladas de piedra. `from`-`to` es el
 * borde en el suelo; la cara visible sube WALL_HEIGHT pixeles.
 */
function paintWall(img: PixelImage, from: Point, to: Point, tone: number): void {
  const slope = (to.y - from.y) / (to.x - from.x);
  const base = shade(STONE_WALL, tone);
  img.fillPolygon(
    [from, to, { x: to.x, y: to.y - WALL_HEIGHT }, { x: from.x, y: from.y - WALL_HEIGHT }],
    (x, y) => {
      const ground = from.y + (x + 0.5 - from.x) * slope;
      const height = Math.floor(ground - y);
      const along = Math.floor(x - Math.min(from.x, to.x));
      const course = Math.floor(height / 5);
      const mortar = height % 5 === 0 || (along + (course % 2) * 3) % 6 === 0;
      return mortar ? shade(base, 0.72) : shade(base, 1 + ((course * 5 + along) % 3) * 0.03);
    },
  );
  // Remate superior más claro.
  img.fillPolygon(
    [
      { x: from.x, y: from.y - WALL_HEIGHT },
      { x: to.x, y: to.y - WALL_HEIGHT },
      { x: to.x, y: to.y - WALL_HEIGHT - 2 },
      { x: from.x, y: from.y - WALL_HEIGHT - 2 },
    ],
    shade(base, 1.2),
  );
}

const paintWallX: Painter = (img) => paintWall(img, TILE.top, TILE.right, 1.05);
const paintWallY: Painter = (img) => paintWall(img, TILE.left, TILE.top, 0.82);
const paintWallCorner: Painter = (img) => {
  paintWall(img, TILE.left, TILE.top, 0.82);
  paintWall(img, TILE.top, TILE.right, 1.05);
};
const paintWallPost: Painter = (img) => {
  const base = shade(STONE_WALL, 0.95);
  img.fillRect(19, TILE.top.y - WALL_HEIGHT - 3, 6, WALL_HEIGHT + 5, base);
  img.fillRect(19, TILE.top.y - WALL_HEIGHT - 3, 2, WALL_HEIGHT + 5, shade(base, 1.18));
  img.fillRect(23, TILE.top.y - WALL_HEIGHT - 3, 2, WALL_HEIGHT + 5, shade(base, 0.75));
};

const WOOD: Rgb = [128, 88, 50];

function paintFence(img: PixelImage, from: Point, to: Point): void {
  const post = (p: Point): void => {
    img.fillRect(p.x - 1, p.y - 13, 2, 14, shade(WOOD, 0.85));
    img.set(p.x - 1, p.y - 13, shade(WOOD, 1.2));
  };
  const rail = (lift: number): void => {
    img.fillPolygon(
      [
        { x: from.x, y: from.y - lift },
        { x: to.x, y: to.y - lift },
        { x: to.x, y: to.y - lift - 2 },
        { x: from.x, y: from.y - lift - 2 },
      ],
      WOOD,
    );
  };
  post(from);
  rail(5);
  rail(10);
  post(to);
}

const paintFenceX: Painter = (img) => paintFence(img, TILE.top, TILE.right);
const paintFenceY: Painter = (img) => paintFence(img, TILE.left, TILE.top);

// ── Objetos ─────────────────────────────────────────────────────────

const paintBarrel: Painter = (img) => {
  const wood: Rgb = [120, 80, 44];
  img.fillRect(16, 42, 12, 14, wood);
  img.fillEllipse(22, 56, 6, 2, wood);
  for (let x = 16; x < 28; x++) {
    const curve = 1 - Math.abs(x + 0.5 - 22) / 6;
    const tone = 0.85 + curve * 0.35 - (x > 22 ? 0.1 : 0);
    for (let y = 42; y < 57; y++) if (img.alphaAt(x, y) > 0) img.set(x, y, shade(wood, tone));
  }
  for (const y of [45, 52]) img.fillRect(16, y, 12, 1, [70, 66, 62]);
  img.fillEllipse(22, 42, 6, 2, shade(wood, 0.7));
};

const paintCrate: Painter = (img) => {
  const wood: Rgb = [164, 120, 72];
  const s = 8;
  const top: Point[] = [
    { x: 22, y: 55 - s - 5 },
    { x: 22 + s, y: 55 - s - 1 },
    { x: 22, y: 55 - s + 3 },
    { x: 22 - s, y: 55 - s - 1 },
  ];
  img.fillPolygon(top, shade(wood, 1.2));
  img.fillPolygon(
    [top[3] as Point, top[2] as Point, { x: 22, y: 59 }, { x: 22 - s, y: 55 }],
    shade(wood, 0.95),
  );
  img.fillPolygon(
    [top[2] as Point, top[1] as Point, { x: 22 + s, y: 55 }, { x: 22, y: 59 }],
    shade(wood, 0.75),
  );
  img.fillPolygon(
    [
      { x: 22, y: 50 },
      { x: 22, y: 59 },
      { x: 23, y: 59 },
      { x: 23, y: 50 },
    ],
    shade(wood, 0.55),
  );
};

const paintWell: Painter = (img) => {
  const stone: Rgb = [140, 134, 124];
  img.fillEllipse(22, 54, 10, 5, stone);
  img.fillRect(12, 48, 21, 7, stone);
  img.fillEllipse(22, 48, 10, 5, shade(stone, 1.2));
  img.fillEllipse(22, 48, 7, 3, [30, 52, 84]);
  for (let x = 12; x < 33; x += 4) img.fillRect(x, 49, 1, 6, shade(stone, 0.75));
  // Techito con dos postes.
  img.fillRect(13, 30, 2, 19, shade(WOOD, 0.8));
  img.fillRect(29, 30, 2, 19, shade(WOOD, 0.8));
  img.fillPolygon(
    [
      { x: 22, y: 20 },
      { x: 35, y: 31 },
      { x: 9, y: 31 },
    ],
    (x) => shade([150, 64, 48], x < 22 ? 1.1 : 0.85),
  );
};

const paintLamp: Painter = (img) => {
  const iron: Rgb = [52, 50, 54];
  img.fillRect(21, 24, 2, 32, iron);
  img.fillRect(19, 54, 6, 2, iron);
  img.fillRect(18, 15, 8, 9, iron);
  img.fillRect(19, 16, 6, 7, [250, 214, 120]);
  img.fillRect(20, 17, 2, 4, [255, 246, 200]);
  img.fillRect(17, 14, 10, 2, iron);
};

const paintSign: Painter = (img) => {
  img.fillRect(17, 38, 2, 18, shade(WOOD, 0.8));
  img.fillRect(12, 36, 18, 9, shade(WOOD, 1.1));
  img.fillRect(12, 44, 18, 1, shade(WOOD, 0.7));
  for (const [y, w] of [
    [38, 12],
    [41, 9],
  ] as const) {
    img.fillRect(15, y, w, 1, shade(WOOD, 0.55));
  }
};

const paintShrine: Painter = (img) => {
  const stone: Rgb = [150, 146, 160];
  // Pedestal escalonado.
  img.fillRect(13, 50, 18, 6, shade(stone, 0.85));
  img.fillRect(13, 50, 18, 1, shade(stone, 1.15));
  img.fillRect(16, 38, 12, 12, stone);
  img.fillRect(16, 38, 2, 12, shade(stone, 1.2));
  img.fillRect(26, 38, 2, 12, shade(stone, 0.75));
  img.fillRect(15, 36, 14, 2, shade(stone, 1.1));
  // Cristal que brilla.
  img.fillPolygon(
    [
      { x: 22, y: 18 },
      { x: 27, y: 27 },
      { x: 22, y: 36 },
      { x: 17, y: 27 },
    ],
    (x) => (x < 22 ? [150, 210, 255] : [90, 150, 230]),
  );
  img.fillRect(20, 23, 1, 6, [235, 250, 255]);
  // Runas en el pedestal.
  for (const y of [41, 45]) img.fillRect(19, y, 6, 1, [110, 170, 240]);
};

const paintForge: Painter = (img) => {
  const brick: Rgb = [140, 70, 50];
  img.fillRect(11, 36, 22, 20, brick);
  img.fillRect(11, 36, 2, 20, shade(brick, 1.2));
  img.fillRect(31, 36, 2, 20, shade(brick, 0.7));
  for (let y = 39; y < 56; y += 4) img.fillRect(11, y, 22, 1, shade(brick, 0.6));
  // Boca con fuego.
  img.fillRect(16, 44, 12, 8, [40, 20, 16]);
  img.fillRect(17, 47, 10, 5, [255, 140, 40]);
  img.fillRect(19, 48, 6, 3, [255, 220, 120]);
  // Chimenea.
  img.fillRect(18, 22, 8, 14, shade(brick, 0.9));
  img.fillRect(17, 21, 10, 2, shade(brick, 1.1));
};

const paintAnvil: Painter = (img) => {
  const iron: Rgb = [90, 94, 104];
  img.fillRect(17, 48, 10, 8, [100, 70, 44]);
  img.fillRect(19, 44, 6, 4, iron);
  img.fillRect(13, 39, 18, 5, iron);
  img.fillRect(13, 39, 18, 1, shade(iron, 1.4));
  img.fillPolygon(
    [
      { x: 31, y: 39 },
      { x: 36, y: 41 },
      { x: 31, y: 44 },
    ],
    shade(iron, 0.85),
  );
};

const SPECS: Readonly<Record<StaticKind, StaticSpec>> = {
  oak: { paint: paintOak, outline: true, shadow: [14, 5] },
  pine: { paint: paintPine, outline: true, shadow: [11, 4] },
  bush: { paint: paintBush, outline: true, shadow: [8, 3] },
  rock: { paint: paintRock, outline: true, shadow: [9, 3] },
  flowers: { paint: paintFlowers, outline: false },
  'wall-x': { paint: paintWallX, outline: true },
  'wall-y': { paint: paintWallY, outline: true },
  'wall-corner': { paint: paintWallCorner, outline: true },
  'wall-post': { paint: paintWallPost, outline: true },
  'fence-x': { paint: paintFenceX, outline: true },
  'fence-y': { paint: paintFenceY, outline: true },
  barrel: { paint: paintBarrel, outline: true, shadow: [7, 3] },
  crate: { paint: paintCrate, outline: true, shadow: [9, 3] },
  well: { paint: paintWell, outline: true, shadow: [12, 4] },
  lamp: { paint: paintLamp, outline: true, shadow: [4, 2] },
  sign: { paint: paintSign, outline: true, shadow: [6, 2] },
  shrine: { paint: paintShrine, outline: true, shadow: [11, 4] },
  forge: { paint: paintForge, outline: true, shadow: [13, 4] },
  anvil: { paint: paintAnvil, outline: true, shadow: [10, 3] },
};

function hashKind(kind: string): number {
  let h = 0;
  for (let i = 0; i < kind.length; i++) h = Math.imul(h ^ kind.charCodeAt(i), 16777619);
  return h >>> 0;
}
