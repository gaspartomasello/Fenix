import { ITEMS, type ItemKind } from '@fenix/shared';
import { hexToRgb, type PixelImage, type Rgb } from './pixel-art';
import {
  Camera,
  VolumeCanvas,
  add,
  axesAlong,
  metal,
  noise,
  normalize,
  ramp,
  solid,
  tone,
  type Material,
  type Ramp,
  type Vec3,
} from './volume';

/**
 * Objetos: modelos chicos hechos con el mismo motor de volumen que los
 * personajes, vistos desde arriba como en UO y con el doble de detalle que
 * el resto del arte (se muestran sin escalar).
 */
export const ITEM_ART_SIZE = 44;

/** En el suelo, a escala del mundo; como ícono (mochila, banco, tienda), más grandes. */
export type ItemStyle = 'ground' | 'icon';
const ZOOM: Readonly<Record<ItemStyle, number>> = { ground: 1.9, icon: 2.5 };

/** Ajuste del tamaño del ícono para que los objetos largos entren y los chicos se vean. */
const ICON_FIT: Partial<Record<ItemKind, number>> = {
  'short-sword': 0.72,
  axe: 0.72,
  pickaxe: 0.72,
  'smith-hammer': 0.8,
  'black-pearl': 1.4,
  ginseng: 1.25,
  'mandrake-root': 1.15,
  'spiders-silk': 1.2,
  garlic: 1.15,
};

const OUTLINE: Rgb = [24, 17, 14];
const STEEL = ramp([150, 158, 172]);
const DARK_STEEL = ramp([96, 102, 114]);
const GOLD = ramp([212, 170, 64]);
const WOOD = ramp([124, 84, 48]);
const GRIP = ramp([74, 48, 30]);
const PAPER = ramp([222, 212, 186]);

/** Ejes de una pieza acostada en el suelo, girada `angle` sobre la vertical. */
function lying(angle: number): readonly [Vec3, Vec3, Vec3] {
  return axesAlong([Math.sin(angle), 0, Math.cos(angle)]);
}

/** Hoja de arma acostada: plana, con filo claro y lomo central. */
function blade(c: VolumeCanvas, from: Vec3, to: Vec3, width: number): void {
  const dir = normalize([to[0] - from[0], 0, to[2] - from[2]]);
  const side: Vec3 = [dir[2] * width, 0, -dir[0] * width];
  const tip = add(to, [dir[0] * 1.6, 0, dir[2] * 1.6]);
  c.polygon(
    [
      add(from, side),
      add(to, side),
      tip,
      add(to, [-side[0], 0, -side[2]]),
      add(from, [-side[0], 0, -side[2]]),
    ],
    (s) => (s.light > 0.85 ? [246, 248, 250] : tone(STEEL, s.light + 0.15)),
  );
  c.limb(add(from, [0, 0.3, 0]), add(to, [0, 0.3, 0]), 0.35, 0.25, metal(STEEL));
}

/** Empuñadura con guarda y pomo, de `at` hacia atrás según `dir`. */
function hilt(c: VolumeCanvas, at: Vec3, dir: Vec3, length: number, guard: number): void {
  const side: Vec3 = [dir[2] * guard, 0, -dir[0] * guard];
  c.limb(add(at, side), add(at, [-side[0], 0, -side[2]]), 0.6, 0.6, metal(GOLD));
  const end = add(at, [-dir[0] * length, 0, -dir[2] * length]);
  c.limb(at, end, 0.7, 0.7, (s) => tone(GRIP, s.light, Math.floor(s.x + s.y) % 2 ? -1 : 0));
  c.sphere(end, 0.95, metal(GOLD));
}

type Model = (c: VolumeCanvas, color: Ramp) => void;

const MODELS: Readonly<Record<ItemKind, Model>> = {
  gold(c) {
    const coins: Vec3[] = [
      [-2.6, 0.5, 1.2],
      [1.4, 0.5, 2],
      [0, 0.5, -1.6],
      [2.8, 0.5, -0.8],
      [-1, 1.4, 0.4],
      [1.2, 1.4, 0],
      [0.2, 2.3, 0.6],
    ];
    coins.forEach((at, i) => {
      const tilt = axesAlong([Math.sin(i * 2.1), 0.25 * Math.cos(i * 1.7), Math.cos(i * 2.1)]);
      c.ellipsoid(at, tilt, [2, 0.45, 2], (s) =>
        s.n[1] > 0.7
          ? tone(GOLD, s.light + 0.1, Math.hypot(s.p[0] - at[0], s.p[2] - at[2]) < 1.1 ? 0 : 1)
          : tone(GOLD, s.light, -1),
      );
    });
  },
  apple(c) {
    const red = ramp([196, 40, 44]);
    c.sphere([0, 3.1, 0], 3.1, (s) =>
      tone(red, s.light, noise(Math.floor(s.p[0] * 2), Math.floor(s.p[1] * 2)) > 0.86 ? 1 : 0),
    );
    c.limb([0, 5.6, 0], [0.4, 7.4, -0.2], 0.35, 0.3, solid(GRIP));
    c.ellipsoid(
      [1.4, 6.7, -0.2],
      axesAlong([1, 0.4, 0]),
      [0.5, 0.35, 1.5],
      solid(ramp([70, 140, 60])),
    );
  },
  'healing-potion'(c) {
    const liquid = ramp([196, 36, 60]);
    c.sphere([0, 3, 0], 3, (s) => (s.light > 0.9 ? [255, 230, 236] : tone(liquid, s.light)));
    c.limb([0, 5.2, 0], [0, 8, 0], 1.1, 0.9, (s) => tone(ramp([200, 216, 226]), s.light));
    c.limb([0, 8, 0], [0, 9.2, 0], 1.1, 1.1, solid(ramp([140, 100, 60])));
  },
  dagger(c) {
    blade(c, [-1, 0.6, 1.2], [4.6, 0.6, -1.6], 1);
    hilt(c, [-1, 0.6, 1.2], normalize([5.6, 0, -2.8]), 3, 1.8);
  },
  'short-sword'(c) {
    blade(c, [-3.5, 0.6, 2.6], [6.4, 0.6, -2.6], 1.1);
    hilt(c, [-3.5, 0.6, 2.6], normalize([9.9, 0, -5.2]), 3.6, 2.4);
  },
  axe(c) {
    // Mango largo y, en la punta, una hoja ancha de un solo lado con el filo claro.
    const end: Vec3 = [5.4, 0.9, -2.6];
    const d = normalize([11.4, 0, -5.6]);
    const n: Vec3 = [-d[2], 0, d[0]];
    const at = (along: number, out: number): Vec3 => [
      end[0] + d[0] * along + n[0] * out,
      1,
      end[2] + d[2] * along + n[2] * out,
    ];
    c.limb([-6, 0.7, 3], add(end, [d[0], 0, d[2]]), 0.75, 0.75, solid(WOOD));
    c.polygon([at(-1.8, 0.5), at(1.6, 0.5), at(4.2, 6), at(0, 7.4), at(-4.4, 6)], (s) =>
      Math.hypot(s.p[0] - end[0], s.p[2] - end[2]) > 6
        ? [238, 240, 244]
        : tone(STEEL, s.light + 0.1),
    );
  },
  'wooden-shield'(c, color) {
    c.ellipsoid([0, 1, 0], lying(0), [6.2, 1, 6.2], (s) => {
      const d = Math.hypot(s.p[0], s.p[2]);
      if (d > 5.3) return tone(DARK_STEEL, s.light);
      if (d < 1.5) return metal(GOLD)(s);
      return tone(color, s.light, Math.floor((s.p[0] + 10) * 0.6) % 2 ? -1 : 0);
    });
  },
  'leather-cap'(c, color) {
    c.ellipsoid([0, 0.2, 0], lying(0), [4, 3.2, 4], (s) =>
      s.p[1] > 0 ? tone(color, s.light) : null,
    );
    c.ellipsoid([0, 0.4, 0.4], lying(0), [4.9, 0.5, 5.2], solid(color, -1));
  },
  'iron-helmet'(c) {
    helmet(c);
  },
  'leather-armor'(c, color) {
    tunic(c, (s) =>
      Math.abs(((s.p[2] + 20) % 2.6) - 1.3) < 0.35
        ? tone(color, s.light, -1)
        : tone(color, s.light),
    );
  },
  chainmail(c) {
    tunic(c, (s) => tone(STEEL, s.light, (s.x + s.y * 2) % 3 === 0 ? -1 : (s.x + s.y) % 2 ? 1 : 0));
  },
  cloak(c, color) {
    // Tela doblada: capas aplastadas con pliegues.
    for (const [i, at] of (
      [
        [0, [0, 0.6, 0.6]],
        [1, [0.4, 1.5, -0.2]],
        [2, [-0.2, 2.3, 0.2]],
      ] as const
    ).values()) {
      c.ellipsoid(at, lying(0.3 * i), [6.4 - i, 0.9, 4.6 - i * 0.6], (s) =>
        tone(color, s.light, Math.sin(s.p[0] * 1.6) > 0.6 ? -1 : 0),
      );
    }
    c.sphere([0, 3.1, 0.2], 0.9, metal(GOLD));
  },
  trousers(c, color) {
    c.ellipsoid([0, 0.8, -3.2], lying(0), [3.6, 0.9, 1.6], solid(color));
    for (const side of [1, -1]) {
      c.limb([side * 1.8, 0.8, -2.4], [side * 2.6, 0.8, 5], 1.8, 1.4, (s) =>
        tone(color, s.light, Math.abs(s.p[0]) < 0.8 ? -1 : 0),
      );
    }
  },
  boots(c, color) {
    for (const side of [1, -1]) {
      const x = side * 2.4;
      c.limb([x, 1, -0.6], [x, 5.2, -0.8], 1.5, 1.6, solid(color));
      c.ellipsoid([x, 1, 1.2], lying(0), [1.6, 1, 2.8], solid(color));
      c.ellipsoid([x, 5.2, -0.8], lying(0), [1.7, 0.4, 1.7], solid(color, 1));
    }
  },
  spellbook(c) {
    const cover = ramp([110, 40, 52]);
    c.box([0, 1.4, 0], lying(0.35), [4.6, 1.3, 5.6], (s) =>
      s.n[1] > 0.7
        ? tone(cover, s.light)
        : Math.abs(s.n[1]) < 0.5 && s.p[1] > 0.5 && s.p[1] < 2.3
          ? tone(PAPER, s.light)
          : tone(cover, s.light, -1),
    );
    c.sphere([0, 2.8, 0], 1.2, metal(GOLD));
  },
  'black-pearl'(c) {
    for (const at of [
      [-1.5, 1.2, 0.5],
      [1.4, 1.2, 1],
      [0, 1.2, -1.4],
    ] as Vec3[]) {
      c.sphere(at, 1.3, (s) =>
        s.light > 0.85 ? [220, 220, 240] : tone(ramp([40, 36, 52]), s.light),
      );
    }
  },
  garlic(c) {
    for (const at of [
      [-1.6, 1.8, 0],
      [1.8, 1.8, 0.8],
    ] as Vec3[]) {
      c.sphere(at, 2, (s) =>
        tone(
          ramp([226, 218, 200]),
          s.light,
          Math.sin(Math.atan2(s.p[0] - at[0], s.p[2] - at[2]) * 4) > 0.8 ? -1 : 0,
        ),
      );
      c.limb(add(at, [0, 1.6, 0]), add(at, [0.3, 3, 0]), 0.4, 0.2, solid(ramp([170, 160, 120])));
    }
  },
  ginseng(c) {
    const root = solid(ramp([206, 170, 112]));
    c.limb([-3, 0.8, 1.4], [0.6, 0.8, -0.2], 1.1, 0.8, root);
    c.limb([0.6, 0.8, -0.2], [3.6, 0.6, 1.2], 0.8, 0.4, root);
    c.limb([0.6, 0.8, -0.2], [2.4, 0.6, -2.6], 0.7, 0.3, root);
  },
  'mandrake-root'(c) {
    const root = solid(ramp([126, 88, 56]));
    c.limb([0, 1.4, -2], [0, 1.2, 1.4], 1.5, 1.2, root);
    c.limb([0, 1.2, 1.4], [-1.6, 0.7, 4], 0.8, 0.4, root);
    c.limb([0, 1.2, 1.4], [1.8, 0.7, 3.8], 0.8, 0.4, root);
    c.ellipsoid([0, 2, -3], lying(0), [1.6, 1, 1.6], solid(ramp([80, 130, 60])));
  },
  'spiders-silk'(c) {
    for (let i = 0; i < 9; i++) {
      const at: Vec3 = [
        (noise(i, 1) - 0.5) * 4.5,
        1.2 + noise(i, 2) * 1.6,
        (noise(i, 3) - 0.5) * 4,
      ];
      c.sphere(at, 1.3, (s) =>
        tone(ramp([228, 228, 232]), s.light, noise(s.x, s.y) > 0.7 ? -1 : 0),
      );
    }
  },
  'sulfurous-ash'(c) {
    c.ellipsoid([0, 0.6, 0], lying(0), [4.6, 1.6, 4], (s) =>
      noise(s.x, s.y) > 0.8
        ? tone(ramp([214, 190, 70]), s.light)
        : tone(ramp([128, 124, 118]), s.light),
    );
  },
  pickaxe(c) {
    c.limb([-5.6, 0.7, 3.4], [4.6, 0.7, -2.2], 0.7, 0.7, solid(WOOD));
    c.limb([1.6, 0.9, -5.4], [4.8, 0.9, -2.4], 0.5, 0.9, metal(STEEL));
    c.limb([4.8, 0.9, -2.4], [7.6, 0.9, 1.2], 0.9, 0.4, metal(STEEL));
  },
  'smith-hammer'(c) {
    c.limb([-5, 0.7, 3], [3.4, 0.7, -1.8], 0.65, 0.65, solid(WOOD));
    c.box([4, 1.4, -2.2], lying(-1.03), [2.8, 1.4, 1.4], metal(DARK_STEEL));
  },
  logs(c) {
    const bark = ramp([104, 72, 44]);
    const wood = ramp([196, 156, 104]);
    for (const [from, to] of [
      [
        [-5, 1.8, 1.2],
        [5, 1.8, 2.2],
      ],
      [
        [-5, 1.8, -2.6],
        [5, 1.8, -1.6],
      ],
      [
        [-4.6, 4.6, -0.2],
        [4.6, 4.6, 0.8],
      ],
    ] as [Vec3, Vec3][]) {
      c.limb(from, to, 1.9, 1.9, (s) => {
        const along = (s.p[0] - from[0]) / (to[0] - from[0]);
        if (along < 0.03 || along > 0.97)
          return tone(
            wood,
            s.light,
            Math.floor(Math.hypot(s.p[1] - from[1], s.p[2] - from[2]) * 1.4) % 2 ? -1 : 0,
          );
        return tone(
          bark,
          s.light,
          noise(Math.floor(s.p[0] * 1.3), Math.floor(s.p[2] * 2)) > 0.7 ? -1 : 0,
        );
      });
    }
  },
  'iron-ore'(c) {
    const rock = ramp([92, 86, 82]);
    for (const [at, r] of [
      [[-1.6, 1.6, 0.6], 2.2],
      [[1.8, 1.4, 1.2], 1.8],
      [[0.4, 1.6, -1.8], 2],
    ] as [Vec3, number][]) {
      c.ellipsoid(at, lying(r), [r, r * 0.8, r * 1.1], (s) =>
        noise(Math.floor(s.p[0] * 2), Math.floor(s.p[1] * 2), Math.floor(s.p[2] * 2)) > 0.8
          ? tone(ramp([170, 92, 52]), s.light)
          : tone(rock, s.light),
      );
    }
  },
  'iron-ingot'(c) {
    c.box([0, 1, 0.8], lying(0.3), [3.8, 1, 1.6], metal(STEEL));
    c.box([0.4, 3, 0.4], lying(-0.2), [3.6, 1, 1.5], metal(STEEL));
  },
};

/** Pechera o cota acostada: torso aplastado con hombros y mangas cortas. */
function tunic(c: VolumeCanvas, material: Material): void {
  c.ellipsoid([0, 1, 0.6], lying(0), [3.8, 1.2, 5.2], material);
  c.ellipsoid([0, 1.1, -3.2], lying(0), [5, 1.2, 1.9], material);
  for (const side of [1, -1]) {
    c.limb([side * 4.4, 1.1, -3.2], [side * 6.4, 0.9, 0.6], 1.6, 1.3, material);
  }
  // Cuello: un hueco oscuro.
  c.ellipsoid([0, 1.8, -4.2], lying(0), [1.7, 0.5, 1], solid(ramp([40, 30, 26])));
}

/** Yelmo apoyado: casco con banda y nasal. */
function helmet(c: VolumeCanvas): void {
  c.ellipsoid([0, 0.4, 0], lying(0), [4.2, 4, 4.4], (s) => {
    if (s.p[1] < 0) return null;
    if (Math.abs(s.p[1] - 1.2) < 0.45) return tone(GOLD, s.light);
    return tone(DARK_STEEL, s.light + 0.2, s.light > 0.85 ? 1 : 0);
  });
  // Abertura de la cara y nasal.
  c.ellipsoid([0, 1.6, 3.9], lying(0), [2.4, 1.2, 0.6], solid(ramp([30, 26, 26])));
  c.limb([0, 3.4, 4.1], [0, 0.6, 4.6], 0.6, 0.5, metal(STEEL));
}

/** Ícono de un objeto: en el suelo o, más grande, en las ventanas. */
export function drawItem(kind: ItemKind, style: ItemStyle = 'ground'): PixelImage {
  const camera = new Camera(
    0.45,
    ITEM_ART_SIZE / 2,
    ITEM_ART_SIZE * 0.6,
    0.8,
    ZOOM[style] * (style === 'icon' ? (ICON_FIT[kind] ?? 1) : 1),
  );
  const canvas = new VolumeCanvas(ITEM_ART_SIZE, ITEM_ART_SIZE, camera);
  const color = ITEMS[kind].color;
  MODELS[kind](canvas, ramp(color === undefined ? [128, 128, 128] : hexToRgb(color)));
  return canvas.toImage(OUTLINE);
}
