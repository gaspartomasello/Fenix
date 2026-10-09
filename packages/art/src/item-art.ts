import { ITEMS, type ItemKind } from '@fenix/shared';
import { hexToRgb, PixelImage, shade, type Rgb } from './pixel-art';

/** Tamaño lógico de los íconos de objetos (se escalan x2: 44 px en pantalla). */
export const ITEM_ART_SIZE = 22;

const OUTLINE: Rgb = [27, 19, 14];
const STEEL: Rgb = [176, 182, 190];
const WOOD: Rgb = [120, 80, 44];
const GOLD: Rgb = [226, 186, 72];

type Painter = (img: PixelImage, color: Rgb) => void;

const PAINTERS: Readonly<Record<ItemKind, Painter>> = {
  gold(img) {
    const coins: [number, number][] = [
      [7, 14],
      [12, 14],
      [9, 11],
      [14, 11],
      [11, 8],
    ];
    for (const [x, y] of coins) {
      img.fillEllipse(x, y, 3.5, 2, GOLD);
      img.fillRect(x - 2, y - 1, 3, 1, shade(GOLD, 1.25));
    }
  },
  apple(img) {
    img.fillEllipse(11, 12, 5, 5, (x, y) =>
      shade([196, 40, 44], 1.25 - (x - 7) * 0.04 - (y - 8) * 0.05),
    );
    img.fillRect(11, 5, 1, 3, [92, 62, 38]);
    img.fillEllipse(13.5, 6, 2, 1, [70, 140, 60]);
    img.set(9, 10, [255, 210, 210]);
  },
  'healing-potion'(img) {
    img.fillEllipse(11, 14, 5, 5, (x) => shade([200, 40, 60], x < 11 ? 1.15 : 0.85));
    img.fillRect(10, 5, 3, 5, [200, 220, 230]);
    img.fillRect(10, 4, 3, 2, [140, 100, 60]);
    img.set(9, 12, [255, 200, 210]);
  },
  dagger(img) {
    diagonalBlade(img, 6, 15, 7, STEEL);
    img.fillRect(5, 15, 3, 2, [150, 120, 60]);
  },
  'short-sword'(img) {
    diagonalBlade(img, 5, 16, 11, STEEL);
    img.fillRect(3, 15, 5, 2, [150, 120, 60]);
    img.fillRect(3, 17, 2, 2, HANDLE_COLOR);
  },
  axe(img) {
    for (let i = 0; i < 12; i++) img.set(6 + i, 17 - i, WOOD);
    img.fillPolygon(
      [
        { x: 12, y: 3 },
        { x: 19, y: 6 },
        { x: 18, y: 11 },
        { x: 14, y: 9 },
      ],
      STEEL,
    );
  },
  'wooden-shield'(img, color) {
    img.fillEllipse(11, 11, 7, 8, (x) => shade(color, x < 11 ? 1.15 : 0.85));
    img.fillRect(10, 3, 2, 16, shade(color, 0.7));
    img.fillEllipse(11, 11, 2, 2, [200, 170, 80]);
  },
  'leather-cap'(img, color) {
    img.fillEllipse(11, 11, 7, 5, (x) => shade(color, x < 11 ? 1.15 : 0.85));
    img.fillRect(3, 13, 16, 2, shade(color, 0.75));
  },
  'iron-helmet'(img, color) {
    img.fillEllipse(11, 11, 7, 7, (x) => shade(color, x < 11 ? 1.2 : 0.85));
    img.fillRect(4, 11, 15, 8, color);
    img.fillRect(10, 11, 2, 8, shade(color, 0.7));
    img.fillRect(4, 18, 15, 1, shade(color, 0.7));
  },
  'leather-armor'(img, color) {
    torso(img, color);
    img.fillRect(9, 7, 4, 1, shade(color, 0.7));
  },
  chainmail(img, color) {
    torso(img, color);
    for (let y = 6; y < 19; y += 2) {
      for (let x = 5 + (y % 4 === 0 ? 1 : 0); x < 17; x += 2) {
        if (img.alphaAt(x, y) > 0) img.set(x, y, shade(color, 0.75));
      }
    }
  },
  cloak(img, color) {
    img.fillPolygon(
      [
        { x: 8, y: 3 },
        { x: 14, y: 3 },
        { x: 19, y: 19 },
        { x: 3, y: 19 },
      ],
      (x) => shade(color, 1.15 - (x - 3) * 0.02),
    );
    img.fillRect(8, 3, 6, 2, [200, 170, 80]);
  },
  trousers(img, color) {
    img.fillRect(6, 4, 10, 4, color);
    img.fillRect(6, 8, 4, 11, shade(color, 1.1));
    img.fillRect(12, 8, 4, 11, shade(color, 0.85));
  },
  boots(img, color) {
    for (const x of [4, 12]) {
      img.fillRect(x, 6, 4, 10, shade(color, x === 4 ? 1.15 : 0.9));
      img.fillRect(x, 14, 7, 3, shade(color, x === 4 ? 1.05 : 0.8));
    }
  },
};

const HANDLE_COLOR: Rgb = [92, 62, 38];

function diagonalBlade(img: PixelImage, x0: number, y0: number, length: number, color: Rgb): void {
  for (let i = 0; i < length; i++) {
    img.set(x0 + 1 + i, y0 - 1 - i, color);
    img.set(x0 + 2 + i, y0 - 1 - i, shade(color, 0.8));
  }
}

function torso(img: PixelImage, color: Rgb): void {
  img.fillPolygon(
    [
      { x: 4, y: 5 },
      { x: 18, y: 5 },
      { x: 16, y: 19 },
      { x: 6, y: 19 },
    ],
    (x) => shade(color, x < 11 ? 1.12 : 0.88),
  );
  img.fillRect(2, 5, 3, 6, shade(color, 1.05));
  img.fillRect(17, 5, 3, 6, shade(color, 0.85));
}

/** Ícono de un objeto, el mismo para el suelo y la mochila. */
export function drawItem(kind: ItemKind): PixelImage {
  const image = new PixelImage(ITEM_ART_SIZE, ITEM_ART_SIZE);
  const color = ITEMS[kind].color;
  PAINTERS[kind](image, color === undefined ? [128, 128, 128] : hexToRgb(color));
  image.outline(OUTLINE);
  return image;
}
