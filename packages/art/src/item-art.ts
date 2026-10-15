import { ITEMS, SPELLS, type BaseItemKind, type ItemKind } from '@fenix/shared';
import { hexToRgb, type PixelImage, type Rgb } from './pixel-art';
import {
  clipping,
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
  'blood-moss': 1.3,
  nightshade: 1.5,
  'scribe-pen': 1.2,
  'empty-bottle': 1.05,
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

const MODELS: Readonly<Record<BaseItemKind, Model>> = {
  gold(c) {
    coins(c, 7);
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
  // Pociones con los colores de UO: amarilla cura, naranja purifica, roja da vigor,
  // blanca da fuerza y azul agilidad.
  'healing-potion': potion([222, 196, 52]),
  'cure-potion': potion([224, 128, 40]),
  'refresh-potion': potion([196, 36, 48]),
  'strength-potion': potion([232, 232, 236]),
  'agility-potion': potion([52, 92, 204]),
  'empty-bottle'(c) {
    const glass = ramp([176, 196, 204]);
    c.sphere([0, 3, 0], 3, (s) => (s.light > 0.85 ? [240, 248, 252] : tone(glass, s.light, -1)));
    c.limb([0, 5.2, 0], [0, 8, 0], 1.1, 0.9, (s) => tone(glass, s.light));
  },
  'raw-fish'(c) {
    fish(c, ramp([150, 170, 182]));
  },
  'fish-steak'(c) {
    c.ellipsoid([0, 1, 0], lying(0.4), [4.6, 1.1, 3], (s) =>
      s.n[1] > 0.6
        ? tone(ramp([226, 140, 104]), s.light, Math.sin(s.p[0] * 2.4) > 0.7 ? 1 : 0)
        : tone(ramp([170, 150, 130]), s.light),
    );
  },
  'raw-ribs'(c) {
    ribs(c, ramp([176, 52, 52]));
  },
  'cooked-ribs'(c) {
    ribs(c, ramp([132, 70, 36]));
  },
  bandage(c) {
    const linen = ramp([232, 226, 210]);
    for (const [at, a] of [
      [[-1.6, 1.4, 0.6], 0.2],
      [[1.8, 1.4, -0.4], -0.5],
      [[0.2, 3.6, 0.2], 1.2],
    ] as [Vec3, number][]) {
      c.ellipsoid(at, lying(a), [2.6, 1.5, 1.5], (s) =>
        tone(linen, s.light, Math.sin(s.p[0] * 3 + a) > 0.75 ? -1 : 0),
      );
    }
  },
  dagger(c) {
    blade(c, [-1, 0.6, 1.2], [4.6, 0.6, -1.6], 1);
    hilt(c, [-1, 0.6, 1.2], normalize([5.6, 0, -2.8]), 3, 1.8);
  },
  'short-sword'(c) {
    blade(c, [-3.5, 0.6, 2.6], [6.4, 0.6, -2.6], 1.1);
    hilt(c, [-3.5, 0.6, 2.6], normalize([9.9, 0, -5.2]), 3.6, 2.4);
  },
  kryss(c) {
    blade(c, [-2.4, 0.6, 1.8], [5.6, 0.6, -2.2], 0.55);
    hilt(c, [-2.4, 0.6, 1.8], normalize([8, 0, -4]), 3.2, 1.6);
  },
  broadsword(c) {
    blade(c, [-3.2, 0.6, 2.4], [6.8, 0.6, -2.8], 1.5);
    hilt(c, [-3.2, 0.6, 2.4], normalize([10, 0, -5.2]), 3.8, 3);
  },
  katana(c) {
    // Hoja apenas curva, guarda redonda y empuñadura larga envuelta.
    const from: Vec3 = [-2.6, 0.6, 2];
    c.limb(from, [2, 0.6, -0.6], 0.8, 0.7, metal(STEEL));
    c.limb([2, 0.6, -0.6], [6.6, 0.6, -2.4], 0.7, 0.2, metal(STEEL));
    c.ellipsoid(from, lying(1.05), [1.6, 0.4, 1.6], metal(GOLD));
    c.limb(from, [-6.6, 0.6, 4.2], 0.75, 0.75, (s) =>
      tone(ramp([40, 36, 44]), s.light, Math.floor(s.p[0] * 1.5) % 2 ? 1 : 0),
    );
  },
  spear(c) {
    c.limb([-8, 0.6, 4.4], [5.4, 0.6, -2.6], 0.55, 0.55, solid(WOOD));
    const d = normalize([13.4, 0, -7]);
    const n: Vec3 = [-d[2], 0, d[0]];
    const at = (along: number, out: number): Vec3 => [
      5.4 + d[0] * along + n[0] * out,
      0.8,
      -2.6 + d[2] * along + n[2] * out,
    ];
    c.polygon([at(0, 0), at(1.4, 1.2), at(4.2, 0), at(1.4, -1.2)], metal(STEEL));
  },
  mace(c) {
    c.limb([-5.4, 0.7, 3], [2.6, 0.7, -1.2], 0.6, 0.6, solid(GRIP));
    const head: Vec3 = [3.8, 1.8, -1.8];
    c.sphere(head, 2, metal(DARK_STEEL));
    for (const d of [
      [1, 0, 0],
      [-0.5, 0, 0.9],
      [-0.5, 0, -0.9],
      [0, 1, 0],
    ] as Vec3[]) {
      c.limb(add(head, scale3(d, 1.6)), add(head, scale3(d, 2.9)), 0.55, 0.15, metal(STEEL));
    }
  },
  'war-hammer'(c) {
    c.limb([-7, 0.7, 4], [4.6, 0.7, -2.2], 0.6, 0.6, solid(WOOD));
    c.box([5, 1.6, -2.4], lying(-1.07), [3.6, 1.6, 1.6], metal(DARK_STEEL));
  },
  bow(c) {
    // Arco acostado: la madera curva y la cuerda recta.
    const point = (t: number): Vec3 => [t * 7, 0.7, -2.6 * (1 - t * t) + 1.2];
    for (let i = 0; i < 8; i++) {
      const a = -1 + i / 4;
      const b = -1 + (i + 1) / 4;
      c.limb(point(a), point(b), 0.6, 0.6, i === 3 || i === 4 ? solid(GRIP) : solid(WOOD));
    }
    c.limb(point(-1), point(1), 0.2, 0.2, solid(ramp([226, 220, 200])));
  },
  arrow(c) {
    for (const [z, x] of [
      [-1.2, 0],
      [0, 0.6],
      [1.2, -0.4],
    ] as const) {
      const from: Vec3 = [-5 + x, 0.6, z + 0.6];
      const to: Vec3 = [5 + x, 0.6, z - 0.6];
      c.limb(from, to, 0.3, 0.3, solid(ramp([168, 124, 76])));
      c.limb(to, add(to, [1.2, 0, -0.1]), 0.5, 0.1, metal(STEEL));
      c.ellipsoid(
        add(from, [0.8, 0.3, 0]),
        lying(1.5),
        [0.5, 0.5, 1.4],
        solid(ramp([220, 220, 226])),
      );
    }
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
    c.ellipsoid(
      [0, 0.2, 0],
      lying(0),
      [4, 3.2, 4],
      clipping((s) => (s.p[1] > 0 ? tone(color, s.light) : null)),
    );
    c.ellipsoid([0, 0.4, 0.4], lying(0), [4.9, 0.5, 5.2], solid(color, -1));
  },
  'iron-helmet'(c) {
    helmet(c);
  },
  'plate-helm'(c) {
    c.ellipsoid(
      [0, 0.4, 0],
      lying(0),
      [4.4, 4.6, 4.8],
      clipping((s) => (s.p[1] < 0 ? null : metal(STEEL)(s))),
    );
    c.ellipsoid([0, 2.4, 4.4], lying(0), [2.8, 0.45, 0.5], solid(ramp([24, 22, 26])));
    c.limb([0, 4.8, -3.6], [0, 4.9, 3.2], 0.5, 0.4, metal(STEEL));
  },
  'wizard-hat'(c, color) {
    c.ellipsoid([0, 0.5, 0], lying(0), [5.6, 0.6, 5.6], solid(color, -1));
    c.limb([0, 0.8, 0], [1.2, 8.6, -1.8], 3.6, 0.3, (s) =>
      Math.abs(s.p[1] - 2) < 0.5 ? tone(GOLD, s.light) : tone(color, s.light),
    );
  },
  'studded-leather'(c, color) {
    tunic(c, (s) =>
      (Math.round(s.p[0] * 0.8) + Math.round(s.p[2] * 0.8)) % 3 === 0 && (s.x + s.y) % 2 === 0
        ? tone(STEEL, s.light + 0.2, 1)
        : tone(color, s.light),
    );
  },
  'plate-chest'(c) {
    tunic(c, (s) =>
      Math.abs(((s.p[2] + 20) % 3.2) - 1.6) < 0.25 ? tone(DARK_STEEL, s.light) : metal(STEEL)(s),
    );
  },
  robe(c, color) {
    // Túnica doblada en dos: larga, con mangas anchas y capucha.
    c.ellipsoid([0, 1, 1.4], lying(0), [4.4, 1.2, 6.4], (s) =>
      tone(color, s.light, Math.sin(s.p[0] * 1.8) > 0.7 ? -1 : 0),
    );
    for (const side of [1, -1]) {
      c.limb([side * 3.6, 1.2, -3.6], [side * 6.6, 1, 1.6], 1.6, 2.2, solid(color));
    }
    c.ellipsoid([0, 1.8, -4.8], lying(0), [2.6, 1, 1.8], solid(color, -1));
  },
  'leather-leggings'(c, color) {
    legs(c, (s) => tone(color, s.light, Math.round(s.p[2]) % 3 === 0 ? -1 : 0));
  },
  'plate-legs'(c) {
    legs(c, (s) => (Math.abs(s.p[2] - 1) < 0.9 ? tone(STEEL, s.light + 0.2, 1) : metal(STEEL)(s)));
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
  'fishing-pole'(c) {
    c.limb([-7, 0.6, 4], [7, 0.6, -4], 0.6, 0.25, solid(WOOD));
    c.ellipsoid([-4.6, 1.2, 2.4], lying(1.05), [1.1, 1.1, 0.6], metal(DARK_STEEL));
    c.limb([7, 0.6, -4], [4.6, 0.4, 2.6], 0.12, 0.12, solid(ramp([220, 220, 220])));
    c.sphere([4.6, 0.6, 2.6], 0.5, solid(ramp([200, 40, 40])));
  },
  'sewing-kit'(c) {
    c.box([0, 1.4, 0], lying(0.4), [4.2, 1.4, 3], (s) =>
      s.n[1] > 0.7 ? tone(ramp([150, 104, 60]), s.light) : tone(WOOD, s.light, -1),
    );
    for (const [x, col] of [
      [-1.8, [180, 40, 40]],
      [0, [60, 90, 170]],
      [1.8, [210, 190, 80]],
    ] as [number, Rgb][]) {
      c.limb([x, 2.8, -0.6], [x, 2.8, 0.8], 0.9, 0.9, solid(ramp(col)));
    }
  },
  saw(c) {
    const at: Vec3 = [-1, 0.6, 0.6];
    c.polygon(
      [
        [-1.6, 0.6, 2.8],
        [6.2, 0.6, -1.4],
        [5.4, 0.6, -3],
        [-2.6, 0.6, 1],
      ],
      (s) =>
        Math.floor(s.p[0] * 2) % 2 && s.p[2] > -1.6 + -s.p[0] * 0.5
          ? tone(STEEL, s.light, -1)
          : tone(STEEL, s.light + 0.1),
    );
    c.box(add(at, [-3.2, 0.4, 1.6]), lying(1.05), [1.4, 0.8, 2.2], solid(WOOD));
  },
  'fletching-kit'(c) {
    c.box([0, 1, 0], lying(0.3), [3.8, 1, 2.6], solid(ramp([120, 84, 52])));
    for (let i = 0; i < 4; i++) {
      c.ellipsoid(
        [-2 + i * 1.3, 2.4, -0.4 + (i % 2) * 0.6],
        lying(0.4),
        [0.5, 0.4, 2],
        solid(ramp([236, 236, 240])),
      );
    }
  },
  'mortar-pestle'(c) {
    const stone = ramp([168, 160, 150]);
    c.sphere(
      [0, 2.6, 0],
      3.2,
      clipping((s) =>
        s.p[1] > 4
          ? null
          : s.n[1] > 0.6 && s.p[1] > 3
            ? tone(stone, s.light - 0.3, -1)
            : tone(stone, s.light),
      ),
    );
    c.limb([0.4, 3.4, 0.2], [3.2, 8, -1], 0.7, 0.9, solid(stone, 1));
  },
  'scribe-pen'(c) {
    c.limb([-4, 0.6, 2.4], [3.6, 0.6, -2], 0.35, 0.2, solid(ramp([60, 50, 44])));
    c.ellipsoid([1.4, 1, -0.8], lying(1.05), [1.1, 0.4, 4.2], (s) =>
      tone(ramp([236, 232, 222]), s.light, Math.sin(s.p[0] * 4) > 0.6 ? -1 : 0),
    );
  },
  skillet(c) {
    c.ellipsoid([1.4, 1, -0.6], lying(0), [3.6, 1, 3.6], (s) =>
      s.n[1] > 0.6 && Math.hypot(s.p[0] - 1.4, s.p[2] + 0.6) < 3
        ? tone(DARK_STEEL, s.light - 0.3, -1)
        : metal(DARK_STEEL)(s),
    );
    c.limb([-1.6, 1, 1.4], [-6.4, 1, 4.2], 0.7, 0.6, solid(ramp([50, 44, 40])));
  },
  'blank-scroll'(c) {
    scroll(c, null);
  },
  'blood-moss'(c) {
    for (let i = 0; i < 8; i++) {
      const at: Vec3 = [(noise(i, 4) - 0.5) * 4.4, 1 + noise(i, 5) * 1.2, (noise(i, 6) - 0.5) * 4];
      c.sphere(at, 1.2, (s) => tone(ramp([150, 30, 34]), s.light, noise(s.x, s.y) > 0.7 ? -1 : 0));
    }
  },
  nightshade(c) {
    c.ellipsoid([0, 0.8, 0.8], lying(0.6), [1.6, 0.4, 3.2], solid(ramp([60, 110, 50])));
    for (const at of [
      [-1.4, 1.6, -0.6],
      [0.6, 1.8, -1.4],
      [1.4, 1.6, 0.2],
    ] as Vec3[]) {
      c.sphere(at, 1.1, (s) =>
        s.light > 0.85 ? [210, 190, 230] : tone(ramp([90, 40, 120]), s.light),
      );
    }
  },
  boards(c) {
    const plank = ramp([200, 160, 108]);
    for (let i = 0; i < 3; i++) {
      c.box([0, 0.9 + i * 1.6, (i - 1) * 0.6], lying(1.1 + i * 0.08), [1.8, 0.7, 6.4], (s) =>
        tone(plank, s.light, Math.floor(s.p[0] * 3 + s.p[2]) % 4 === 0 ? -1 : 0),
      );
    }
  },
  cloth(c) {
    const fabric = ramp([196, 184, 160]);
    c.limb([-4, 2, 1], [4, 2, -1], 2.2, 2.2, (s) =>
      tone(fabric, s.light, Math.sin(Math.atan2(s.p[1] - 2, s.p[2]) * 6) > 0.7 ? -1 : 0),
    );
  },
  hides(c) {
    const hide = ramp([138, 96, 60]);
    c.polygon(
      [
        [-5, 0.6, -1],
        [-2.4, 0.6, -4],
        [2.6, 0.6, -3.6],
        [5.2, 0.6, -0.4],
        [3, 0.6, 3.6],
        [-2.8, 0.6, 3.4],
      ],
      (s) =>
        tone(hide, s.light + 0.15, noise(Math.floor(s.p[0]), Math.floor(s.p[2])) > 0.75 ? -1 : 0),
    );
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

function scale3(v: Vec3, k: number): Vec3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

/** Frasco redondo con cuello y corcho, lleno de un líquido del color dado. */
function potion(color: Rgb): Model {
  const liquid = ramp(color);
  return (c) => {
    c.sphere([0, 3, 0], 3, (s) => (s.light > 0.9 ? [255, 248, 236] : tone(liquid, s.light)));
    c.limb([0, 5.2, 0], [0, 8, 0], 1.1, 0.9, (s) => tone(ramp([200, 216, 226]), s.light));
    c.limb([0, 8, 0], [0, 9.2, 0], 1.1, 1.1, solid(ramp([140, 100, 60])));
  };
}

/** Pescado acostado: cuerpo ahusado, cola y ojo. */
function fish(c: VolumeCanvas, scales: Ramp): void {
  c.ellipsoid([0, 1.2, 0], lying(1.2), [1.6, 1.2, 5], (s) =>
    s.p[1] < 0.6
      ? tone(ramp([226, 226, 220]), s.light)
      : tone(scales, s.light, (s.x + s.y) % 3 ? 0 : -1),
  );
  c.polygon(
    [
      [-4.4, 1.2, 1.6],
      [-7, 1.2, 0.2],
      [-6.6, 1.2, 3.8],
    ],
    solid(scales, -1),
  );
  c.sphere([3.6, 1.8, -1.6], 0.45, solid(ramp([20, 20, 24])));
}

/** Costillar: carne con las puntas de los huesos asomando. */
function ribs(c: VolumeCanvas, meat: Ramp): void {
  c.ellipsoid([0, 1.4, 0], lying(0.5), [4.6, 1.6, 3], (s) =>
    tone(meat, s.light, noise(Math.floor(s.p[0] * 1.5), Math.floor(s.p[2] * 1.5)) > 0.75 ? -1 : 0),
  );
  for (const z of [-1.6, 0, 1.6]) {
    c.limb([3.4, 1.4, z - 1.4], [6, 1.2, z - 2.4], 0.5, 0.45, solid(ramp([234, 226, 206])));
  }
}

/** Pantalón de armadura acostado, con las dos piernas. */
function legs(c: VolumeCanvas, material: Material): void {
  c.ellipsoid([0, 0.9, -3.2], lying(0), [3.8, 1, 1.7], material);
  for (const side of [1, -1]) {
    c.limb([side * 1.9, 0.9, -2.4], [side * 2.7, 0.9, 5], 1.9, 1.5, material);
  }
}

/** Pergamino enrollado; con hechizo, atado con una cinta del color de su círculo. */
function scroll(c: VolumeCanvas, ribbon: Ramp | null): void {
  c.limb([-4.6, 1.4, 1.8], [4.6, 1.4, -1.8], 1.4, 1.4, (s) =>
    tone(PAPER, s.light, Math.abs(s.p[0]) > 4.2 ? -1 : 0),
  );
  c.limb([-4.6, 1.3, 1.8], [-4.8, 1.3, 3.4], 0.6, 0.6, solid(PAPER, -1));
  if (ribbon) {
    c.limb(
      [0.2, 1.4, -0.4],
      [0.8, 1.4, 1.2],
      1.6,
      1.6,
      clipping((s) => (Math.abs(s.p[0] - 0.5) < 0.5 ? tone(ribbon, s.light) : null)),
    );
    c.sphere([0.8, 2.8, 0.4], 0.8, solid(ribbon, 1));
  }
}

/** Colores de la cinta de los pergaminos, por círculo. */
const CIRCLE_RIBBON: readonly Rgb[] = [
  [200, 60, 50],
  [220, 140, 40],
  [210, 196, 60],
  [70, 160, 70],
  [60, 120, 200],
  [120, 70, 180],
  [40, 36, 44],
];

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
  c.ellipsoid(
    [0, 0.4, 0],
    lying(0),
    [4.2, 4, 4.4],
    clipping((s) => {
      if (s.p[1] < 0) return null;
      if (Math.abs(s.p[1] - 1.2) < 0.45) return tone(GOLD, s.light);
      return tone(DARK_STEEL, s.light + 0.2, s.light > 0.85 ? 1 : 0);
    }),
  );
  // Abertura de la cara y nasal.
  c.ellipsoid([0, 1.6, 3.9], lying(0), [2.4, 1.2, 0.6], solid(ramp([30, 26, 26])));
  c.limb([0, 3.4, 4.1], [0, 0.6, 4.6], 0.6, 0.5, metal(STEEL));
}

/**
 * Cuántas monedas se dibujan según la cantidad, como en UO: una moneda, un
 * puñado, una pila o una montaña.
 */
const GOLD_PILES: readonly { readonly from: number; readonly coins: number }[] = [
  { from: 1, coins: 1 },
  { from: 2, coins: 3 },
  { from: 6, coins: 7 },
  { from: 51, coins: 16 },
  { from: 1001, coins: 34 },
];

/** Variante de dibujo según la cantidad (hoy solo cambia el oro). */
export function itemVariant(kind: ItemKind, amount: number): number {
  if (kind !== 'gold') return 0;
  let variant = 0;
  GOLD_PILES.forEach((pile, i) => {
    if (amount >= pile.from) variant = i;
  });
  return variant;
}

/** Monedas apiladas en un montículo: más alto y ancho cuantas más haya. */
function coins(c: VolumeCanvas, count: number): void {
  const spread = 0.8 + Math.sqrt(count) * 0.95;
  const height = 0.4 + Math.sqrt(count) * 0.75;
  const rim = ramp([150, 104, 30]);
  for (let i = 0; i < count; i++) {
    // Espiral de abajo hacia arriba: las primeras forman la base, las últimas la punta.
    const t = count === 1 ? 0 : i / (count - 1);
    const radius = spread * (1 - t) ** 0.8 * (0.55 + noise(i, 7) * 0.45);
    const angle = i * 2.4;
    const at: Vec3 = [Math.cos(angle) * radius, 0.4 + t * height, Math.sin(angle) * radius];
    const tilt = axesAlong([Math.sin(i * 2.1), 0.35 * Math.cos(i * 1.7), Math.cos(i * 2.1)]);
    c.ellipsoid(at, tilt, [1.55, 0.36, 1.55], (s) => {
      // Cara clara con un borde más oscuro; el canto, oscuro.
      if (s.n[1] < 0.55) return tone(rim, s.light);
      const d = Math.hypot(s.p[0] - at[0], s.p[2] - at[2]);
      if (d > 1.15) return tone(rim, s.light + 0.2, 1);
      return s.light > 0.82 ? [255, 244, 190] : tone(GOLD, s.light + 0.05, d < 0.6 ? 1 : 0);
    });
  }
}

/** Ícono de un objeto: en el suelo o, más grande, en las ventanas. */
export function drawItem(kind: ItemKind, style: ItemStyle = 'ground', amount = 1): PixelImage {
  const camera = new Camera(
    0.45,
    ITEM_ART_SIZE / 2,
    ITEM_ART_SIZE * 0.6,
    0.8,
    ZOOM[style] * (style === 'icon' ? (ICON_FIT[kind] ?? 1) : 1),
  );
  const canvas = new VolumeCanvas(ITEM_ART_SIZE, ITEM_ART_SIZE, camera);
  const definition = ITEMS[kind];
  const color = ramp(definition.color === undefined ? [128, 128, 128] : hexToRgb(definition.color));
  if (kind === 'gold') coins(canvas, GOLD_PILES[itemVariant(kind, amount)]?.coins ?? 7);
  else if (definition.spell)
    scroll(canvas, ramp(CIRCLE_RIBBON[SPELLS[definition.spell].circle - 1] ?? [200, 60, 50]));
  else MODELS[kind as BaseItemKind](canvas, color);
  return canvas.toImage(OUTLINE);
}
