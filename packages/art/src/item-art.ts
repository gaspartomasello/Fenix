import { ITEMS, type BaseItemKind, type ItemKind } from '@fenix/shared/items/item-catalog';
import { SPELLS } from '@fenix/shared/magic/spell-catalog';
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
/** Los íconos se dibujan a este múltiplo de `ITEM_ART_SIZE` (se muestran achicados, suaves). */
export const ICON_DETAIL = 2;

/** En el suelo, a escala del mundo; como ícono (mochila, banco, tienda), más grandes. */
export type ItemStyle = 'ground' | 'icon';
const ZOOM: Readonly<Record<ItemStyle, number>> = { ground: 1.9, icon: 2.5 };

/** Ajuste del tamaño del ícono para que los objetos largos entren y los chicos se vean. */
const ICON_FIT: Partial<Record<ItemKind, number>> = {
  longsword: 0.66,
  halberd: 0.76,
  spear: 0.8,
  quarterstaff: 0.62,
  'war-axe': 0.72,
  ruby: 1.3,
  sapphire: 1.3,
  emerald: 1.3,
  amethyst: 1.3,
  diamond: 1.3,
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
  cannonball: 1.15,
  shovel: 0.72,
  'double-axe': 0.72,
  'battle-axe': 0.7,
  'two-handed-axe': 0.66,
  'large-battle-axe': 0.66,
  bardiche: 0.78,
  'war-fork': 0.88,
  'short-spear': 1,
  'hammer-pick': 0.76,
  'viking-sword': 0.74,
  crossbow: 0.78,
  'heavy-crossbow': 0.66,
  katana: 0.9,
  flail: 0.86,
  'legion-shield': 0.86,
  'templar-shield': 0.9,
  'samurai-do': 0.9,
  'samurai-haidate': 0.92,
  'templar-hauberk': 0.9,
};

const OUTLINE: Rgb = [24, 17, 14];
const STEEL = ramp([150, 158, 172]);
const DARK_STEEL = ramp([96, 102, 114]);
const GOLD = ramp([212, 170, 64]);
const WOOD = ramp([124, 84, 48]);
const GRIP = ramp([74, 48, 30]);
const PAPER = ramp([222, 212, 186]);

/** Maqueta de barco sobre un soporte: el casco, un mástil por cada `masts` y su vela. */
function shipModel(c: VolumeCanvas, stripe: Ramp, masts: number): void {
  c.box([0, 1, 0], lying(0.5), [6, 1, 2.4], solid(WOOD));
  const hull = (s: { p: Vec3; light: number }) =>
    Math.abs(s.p[1] - 5) < 0.6 ? tone(stripe, s.light) : tone(ramp([128, 84, 48]), s.light);
  c.ellipsoid([0, 4.6, 0], lying(0.5), [8, 3, 2.8], hull);
  c.box([0, 6.6, 0], lying(0.5), [6.4, 0.4, 2.2], solid(ramp([176, 136, 88])));
  for (let m = 0; m < masts; m++) {
    const along = masts === 1 ? 0 : m === 0 ? 2.6 : -2.4;
    const x = Math.cos(0.5) * along;
    const z = -Math.sin(0.5) * along;
    c.limb([x, 6.6, z], [x, 17, z], 0.5, 0.4, solid(WOOD));
    c.box([x + 0.4, 12.6, z], lying(-1.07), [3.4, 3.6, 0.2], solid(ramp([236, 228, 206])));
  }
}

/** Ejes de una pieza acostada en el suelo, girada `angle` sobre la vertical. */
function lying(angle: number): readonly [Vec3, Vec3, Vec3] {
  return axesAlong([Math.sin(angle), 0, Math.cos(angle)]);
}

/**
 * Color con luz continua (sin los escalones de las rampas): el metal y la
 * madera de las armas se ven más suaves, con un brillo blanco donde pega la luz.
 */
function lit(base: Rgb, light: number, shine = 0.6): Rgb {
  const l = Math.max(0, Math.min(1.15, light));
  const k = 0.32 + 0.72 * l;
  const glint = Math.max(0, l - 0.92) * 3 * shine;
  const f = (c: number): number =>
    Math.max(0, Math.min(255, Math.round(c * k + glint * (255 - c * k))));
  return [f(base[0]), f(base[1]), f(base[2])];
}
const STEEL_RGB: Rgb = [164, 172, 186];
const EDGE_RGB: Rgb = [214, 220, 230];
const GOLD_RGB: Rgb = [214, 168, 70];
const WOOD_RGB: Rgb = [128, 84, 48];
const LEATHER_RGB: Rgb = [92, 58, 36];

/**
 * Hoja de arma acostada: el filo biselado más claro, un canal oscuro por el
 * medio (hasta tres cuartos del largo), un brillo que corre a lo largo y el
 * lomo central en relieve.
 */
function blade(c: VolumeCanvas, from: Vec3, to: Vec3, width: number): void {
  const dir = normalize([to[0] - from[0], 0, to[2] - from[2]]);
  const side: Vec3 = [dir[2] * width, 0, -dir[0] * width];
  const tip = add(to, [dir[0] * 1.6, 0, dir[2] * 1.6]);
  const length = Math.hypot(to[0] - from[0], to[2] - from[2]) + 1.6;
  c.polygon(
    [
      add(from, side),
      add(to, side),
      tip,
      add(to, [-side[0], 0, -side[2]]),
      add(from, [-side[0], 0, -side[2]]),
    ],
    (s) => {
      const rel: Vec3 = [s.p[0] - from[0], 0, s.p[2] - from[2]];
      const u = (rel[0] * dir[0] + rel[2] * dir[2]) / length;
      const t = Math.abs(rel[0] * dir[2] - rel[2] * dir[0]) / width;
      const sheen = s.light * 0.7 + 0.22 * Math.sin(u * Math.PI);
      if (t > 0.72 || u > 0.88) return lit(EDGE_RGB, sheen + 0.2);
      if (t < 0.18 && u < 0.72) return lit([84, 90, 102], sheen, 0.2);
      return lit(STEEL_RGB, sheen + (t - 0.5) * 0.2);
    },
  );
  c.limb(add(from, [0, 0.3, 0]), add(to, [0, 0.3, 0]), 0.3, 0.2, (s) => lit(EDGE_RGB, s.light));
}

/**
 * Empuñadura: guarda con las puntas redondeadas, un dado en el centro, el
 * mango envuelto en cuero en espiral y el pomo con su anillo.
 */
function hilt(c: VolumeCanvas, at: Vec3, dir: Vec3, length: number, guard: number): void {
  const side: Vec3 = [dir[2] * guard, 0, -dir[0] * guard];
  const gold: Material = (s) => lit(GOLD_RGB, s.light, 0.8);
  c.limb(add(at, side), add(at, [-side[0], 0, -side[2]]), 0.5, 0.5, gold);
  for (const k of [1, -1]) c.sphere(add(at, scale3(side, k)), 0.75, gold);
  c.ellipsoid(at, lying(Math.atan2(dir[0], dir[2])), [0.9, 0.7, 0.6], gold);
  const end = add(at, [-dir[0] * length, 0, -dir[2] * length]);
  c.limb(at, end, 0.62, 0.62, (s) => {
    const a = (s.p[0] - at[0]) * dir[0] + (s.p[2] - at[2]) * dir[2];
    const wrap = (((a * 2.4 + s.p[1] * 3) % 1) + 1) % 1;
    return lit(LEATHER_RGB, s.light - (wrap < 0.25 ? 0.28 : 0), 0.1);
  });
  c.sphere(end, 0.95, gold);
  c.sphere(add(end, [-dir[0] * 0.9, 0, -dir[2] * 0.9]), 0.45, gold);
}

/** Madera con veta: rayas finas a lo largo del mango, nudos aislados. */
function woodGrain(from: Vec3, to: Vec3): Material {
  const d = normalize([to[0] - from[0], to[1] - from[1], to[2] - from[2]]);
  return (s) => {
    const along = (s.p[0] - from[0]) * d[0] + (s.p[2] - from[2]) * d[2];
    const across = (s.p[0] - from[0]) * d[2] - (s.p[2] - from[2]) * d[0];
    const grain = Math.sin(across * 9 + Math.sin(along * 0.7) * 1.5) * 0.06;
    const knot = noise(Math.floor(along * 0.8), Math.floor(across * 2)) > 0.94 ? -0.2 : 0;
    return lit(WOOD_RGB, s.light + grain + knot, 0.15);
  };
}

/**
 * Mango acostado de `from` a `to` y una función para ubicar puntos de la
 * cabeza: `along` sobre el eje del mango desde `to`, `out` hacia el costado.
 */
function haft(
  c: VolumeCanvas,
  from: Vec3,
  to: Vec3,
  radius: number,
  material: Material = woodGrain(from, to),
): (along: number, out: number, y?: number) => Vec3 {
  c.limb(from, to, radius, radius, material);
  const d = normalize([to[0] - from[0], 0, to[2] - from[2]]);
  // Virola de metal donde va la cabeza y regatón en la punta de abajo.
  const steel: Material = (s) => lit(STEEL_RGB, s.light);
  const step: Vec3 = [d[0] * 0.7, 0, d[2] * 0.7];
  c.limb(add(to, [-step[0], 0, -step[2]]), add(to, step), radius + 0.18, radius + 0.18, steel);
  c.limb(from, add(from, step), radius + 0.12, radius * 0.6, steel);
  const n: Vec3 = [-d[2], 0, d[0]];
  return (along, out, y = to[1] + 0.3) => [
    to[0] + d[0] * along + n[0] * out,
    y,
    to[2] + d[2] * along + n[2] * out,
  ];
}

/**
 * Hacia dónde apunta, acostada, un arma de asta para que en el ícono quede
 * derecha (vertical), como las de UO: compensa el giro de la cámara.
 */
const STANDING: Vec3 = [Math.sin(0.45), 0, Math.cos(0.45)];
/** Un punto a lo largo del asta derecha: `k` positivo hacia abajo (el regatón). */
function alongPole(k: number): Vec3 {
  return [STANDING[0] * k, 0.6, STANDING[2] * k];
}

/** Acero de hoja de hacha con el filo (lo más lejos del mango) claro. */
function axeSteel(edge: Vec3, reach: number): Material {
  return (s) => {
    const d = Math.hypot(s.p[0] - edge[0], s.p[2] - edge[2]);
    // El filo afilado brilla en una franja; hacia el ojo la hoja se oscurece
    // de a poco (es una cara plana: el degradé le da el bisel).
    if (d > reach) return lit(EDGE_RGB, s.light * 0.95);
    if (d > reach - 0.5) return lit([96, 102, 114], s.light * 0.8);
    return lit(STEEL_RGB, s.light * 0.55 + (d / reach) * 0.3, 0.2);
  };
}

/** Ballesta acostada: la caja de madera, el arco de acero y la cuerda. */
function crossbow(c: VolumeCanvas, size: number): void {
  const at = haft(c, [-5 * size, 0.8, 2.6 * size], [5 * size, 0.8, -2.6 * size], 0.9, (s) =>
    tone(WOOD, s.light, Math.floor(s.p[0] * 2) % 3 === 0 ? -1 : 0),
  );
  const arm = (t: number): Vec3 => at(-1 - Math.abs(t) * 1.6 * size, t * 6 * size, 1.2);
  for (let i = 0; i < 6; i++) {
    const a = -1 + i / 3;
    const b = -1 + (i + 1) / 3;
    c.limb(arm(a), arm(b), 0.55, 0.55, metal(i === 2 || i === 3 ? DARK_STEEL : STEEL));
  }
  c.limb(arm(-1), at(-5 * size, 0, 1.3), 0.18, 0.18, solid(ramp([226, 220, 200])));
  c.limb(arm(1), at(-5 * size, 0, 1.3), 0.18, 0.18, solid(ramp([226, 220, 200])));
  // Gatillo y estribo.
  c.limb(at(-7 * size, 0, 0.8), at(-7.6 * size, 0.8, 0.2), 0.3, 0.3, metal(DARK_STEEL));
  c.ellipsoid(at(0.6, 0, 1), lying(0), [1.2, 0.3, 1.2], metal(DARK_STEEL));
}

type Model = (c: VolumeCanvas, color: Ramp) => void;

/** Unas gemas talladas, brillantes, del color pedido. */
function gems(rgb: Rgb): Model {
  const color = ramp(rgb);
  return (c) => {
    for (const [x, z, r] of [
      [-1.6, 0.8, 1.6],
      [1.4, 1.2, 1.3],
      [0.2, -1.4, 1.5],
    ] as const)
      c.ellipsoid([x, r * 0.8, z], lying(x), [r, r * 0.8, r], (s) =>
        s.light > 0.82 ? [255, 255, 255] : tone(color, s.light + 0.1, s.n[1] > 0.5 ? 1 : 0),
      );
  };
}

/** Una bolsa: el cuerpo redondeado, el cuello fruncido y el cordón. */
function sack(c: VolumeCanvas, leather: Ramp, radius: number, height: number): void {
  const hide: Material = (s) =>
    tone(
      leather,
      s.light,
      noise(Math.floor(s.p[0] * 1.5), Math.floor(s.p[1] * 1.5)) > 0.85 ? -1 : 0,
    );
  c.ellipsoid(
    [0, height * 0.45, 0],
    axesAlong([1, 0, 0]),
    [radius, height * 0.5, radius * 0.85],
    hide,
  );
  c.limb([0, height * 0.85, 0], [0, height * 1.15, 0], radius * 0.35, radius * 0.5, hide);
  c.ellipsoid(
    [0, height * 0.88, 0],
    axesAlong([1, 0, 0]),
    [radius * 0.42, 0.35, radius * 0.42],
    solid(ramp([70, 46, 30])),
  );
}

/**
 * La escritura de una casa: un pergamino enrollado a medias con el plano
 * dibujado (las paredes y la puerta), atado con una cinta y con el sello de
 * lacre del color del estilo de la casa.
 */
function houseDeed(c: VolumeCanvas, seal: Ramp, lot = false): void {
  const aged = ramp([226, 208, 166]);
  const ink = ramp([62, 54, 84]);
  c.box([0.8, 0.5, 0], lying(0.3), [4, 0.3, 3.3], (s) => {
    const [x, , z] = s.p;
    const dx = Math.abs(x - 0.8);
    const wall =
      (Math.abs(dx - 2.2) < 0.2 && Math.abs(z) < 1.9) ||
      (Math.abs(Math.abs(z) - 1.9) < 0.2 && dx < 2.4);
    // Un lote: el terreno marcado con línea de puntos, sin puerta.
    if (lot) {
      const dash = Math.floor((x + z + 8) * 1.6) % 2 === 0;
      if (wall && dash) return tone(ink, s.light);
      return tone(aged, s.light, noise(s.x, s.y) > 0.86 ? -1 : 0);
    }
    const door = dx < 0.5 && z > 1.5;
    if (wall && !door) return tone(ink, s.light);
    return tone(aged, s.light, noise(s.x, s.y) > 0.86 ? -1 : 0);
  });
  // La parte todavía enrollada, la cinta y el sello.
  c.limb([-4, 1.1, -3.3], [-3.2, 1.1, 3.5], 1.15, 1.15, (s) => tone(aged, s.light, -1));
  c.box([-3.6, 1.2, 0.3], lying(0.3), [1.35, 1.3, 0.35], (s) => tone(seal, s.light, -1));
  c.ellipsoid([-1.9, 1.1, 0.6], lying(0), [1.1, 0.45, 1.1], (s) => tone(seal, s.light));
}

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
  // Bolsas de cuero atadas con un cordón, y una caja de tablas con tapa.
  // El cuero toma el color con que se tiñó (si no, el suyo).
  bag(c, color) {
    sack(c, color, 4.4, 5.2);
  },
  pouch(c, color) {
    sack(c, color, 3, 3.6);
  },
  'wooden-box'(c) {
    const wood = ramp([150, 108, 64]);
    const plank: Material = (s) =>
      tone(wood, s.light, Math.abs(((s.p[1] + 20) % 2.2) - 1.1) < 0.18 ? -1 : 0);
    c.box([0, 2.6, 0], axesAlong([1, 0, 0]), [5, 2.6, 3.6], plank);
    c.box([0, 5.5, 0], axesAlong([1, 0, 0]), [5.3, 0.4, 3.9], solid(ramp([120, 84, 48])));
    for (const x of [-2.4, 2.4])
      c.box([x, 2.8, 0], axesAlong([1, 0, 0]), [5.25, 2.75, 0.4], solid(ramp([70, 70, 76])));
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
  bread(c) {
    // Hogaza dorada con cortes en la corteza.
    const crust = ramp([196, 140, 70]);
    c.ellipsoid([0, 2.2, 0], lying(0.5), [3.4, 2.4, 5.2], (s) =>
      tone(crust, s.light, Math.abs(((s.p[2] * 0.9 + s.p[0] * 0.4 + 20) % 3) - 1.5) < 0.3 ? -1 : 0),
    );
  },
  cheese(c) {
    // Una rueda con una porción cortada: cáscara amarilla y agujeros.
    const paste = ramp([236, 200, 90]);
    c.limb([0, 0, 0], [0, 1.6, 0], 4.6, 4.6, (s) =>
      noise(Math.floor(s.p[0] * 1.6), Math.floor(s.p[2] * 1.6), 3) > 0.84
        ? tone(paste, s.light, -1)
        : tone(paste, s.light),
    );
  },
  ham(c) {
    const meat = ramp([196, 92, 80]);
    c.ellipsoid([0, 2.4, 0.6], lying(0.6), [3.4, 2.6, 4.8], (s) =>
      tone(meat, s.light, s.n[1] > 0.6 ? 1 : 0),
    );
    c.limb([-2, 2.4, -3.2], [-3.4, 2.6, -5.6], 0.8, 0.6, solid(ramp([236, 228, 210])));
  },
  carrot(c) {
    for (const [x, z, a] of [
      [-1.4, 0.6, 0.4],
      [1.2, -0.6, -0.3],
    ] as const) {
      const from: Vec3 = [x - Math.sin(a) * 4, 1.2, z - Math.cos(a) * 4];
      const to: Vec3 = [x + Math.sin(a) * 3, 0.8, z + Math.cos(a) * 3];
      c.limb(from, to, 1.2, 0.2, (s) => tone(ramp([230, 120, 40]), s.light));
      c.limb(
        from,
        add(from, [-Math.sin(a) * 2, 0.6, -Math.cos(a) * 2]),
        0.6,
        0.2,
        solid(ramp([80, 150, 60])),
      );
    }
  },
  'meat-pie'(c) {
    const crust = ramp([206, 150, 80]);
    c.limb([0, 0, 0], [0, 1.2, 0], 5, 4.4, (s) =>
      s.n[1] > 0.7 && Math.abs(((s.p[0] + s.p[2] + 20) % 2.4) - 1.2) < 0.25
        ? tone(crust, s.light, -1)
        : tone(crust, s.light),
    );
  },
  wine(c) {
    // Botella oscura con corcho.
    const glass = ramp([90, 30, 50]);
    c.limb([0, 0, 0], [0, 5.4, 0], 2.4, 2.4, (s) =>
      s.light > 0.85 ? [220, 180, 200] : tone(glass, s.light),
    );
    c.limb([0, 5.4, 0], [0, 8.4, 0], 2.2, 0.8, (s) => tone(glass, s.light));
    c.limb([0, 8.4, 0], [0, 9.4, 0], 0.8, 0.8, solid(ramp([170, 130, 90])));
  },
  ale(c) {
    // Jarra de madera con aros de hierro y espuma.
    const wood = ramp([150, 104, 60]);
    c.limb([0, 0, 0], [0, 5.6, 0], 2.8, 2.6, (s) =>
      Math.abs(s.p[1] - 1) < 0.4 || Math.abs(s.p[1] - 4.6) < 0.4
        ? tone(DARK_STEEL, s.light)
        : tone(wood, s.light, Math.floor(Math.atan2(s.p[2], s.p[0]) * 3) % 2 ? -1 : 0),
    );
    c.ellipsoid([0, 5.8, 0], lying(0), [2.6, 0.8, 2.6], solid(ramp([240, 236, 220])));
    c.limb([2.6, 1.4, 0], [3.8, 3, 0], 0.6, 0.6, solid(wood, -1));
    c.limb([3.8, 3, 0], [2.6, 4.6, 0], 0.6, 0.6, solid(wood, -1));
  },
  longsword(c) {
    blade(c, [-3.6, 0.6, 2.8], [7.4, 0.6, -3], 1.2);
    hilt(c, [-3.6, 0.6, 2.8], normalize([11, 0, -5.8]), 4.4, 2.8);
  },
  scimitar(c) {
    // Hoja curva que se ensancha hacia la punta.
    const from: Vec3 = [-2.8, 0.6, 2.2];
    c.limb(from, [1.6, 0.6, 0.2], 0.9, 1.1, metal(STEEL));
    c.limb([1.6, 0.6, 0.2], [5.4, 0.6, -0.4], 1.1, 1.3, metal(STEEL));
    c.limb([5.4, 0.6, -0.4], [7.2, 0.6, -2.2], 1.3, 0.2, metal(STEEL));
    hilt(c, from, normalize([4.4, 0, -2]), 3.2, 2);
  },
  'war-axe'(c) {
    // Mango y hoja doble, como una media luna a cada lado.
    const end: Vec3 = [4.6, 0.9, -2.2];
    const d = normalize([10.6, 0, -5.2]);
    const n: Vec3 = [-d[2], 0, d[0]];
    const at = (along: number, out: number): Vec3 => [
      end[0] + d[0] * along + n[0] * out,
      1,
      end[2] + d[2] * along + n[2] * out,
    ];
    c.limb([-6, 0.7, 3], add(end, [d[0] * 1.5, 0, d[2] * 1.5]), 0.75, 0.75, solid(WOOD));
    for (const side of [1, -1])
      c.polygon(
        [
          at(-1, 0.4 * side),
          at(1, 0.4 * side),
          at(3.4, 4.6 * side),
          at(0, 5.6 * side),
          at(-3.4, 4.6 * side),
        ],
        axeSteel(end, 4.6),
      );
  },
  halberd(c) {
    // De pie, como en UO: asta larga, hoja de hacha, gancho atrás y punta de lanza.
    const at = haft(c, alongPole(11), alongPole(-11), 0.55);
    c.polygon([at(-2.6, 0.3), at(1.6, 0.3), at(1.2, 5), at(-3, 4.2)], axeSteel(at(-0.6, 0), 4.2));
    c.polygon([at(-1.2, -0.3), at(0.8, -0.3), at(-0.2, -2.6)], metal(STEEL));
    c.polygon([at(1.6, 0), at(2.8, 1), at(6.6, 0), at(2.8, -1)], metal(STEEL));
    c.limb(at(-12, 0, 0.9), at(-11, 0, 0.9), 0.75, 0.75, solid(GRIP));
  },
  club(c) {
    // Palo nudoso que engorda hacia la punta.
    c.limb([-5, 0.8, 2.8], [4.8, 1.4, -2.2], 0.7, 1.7, (s) =>
      tone(WOOD, s.light, noise(Math.floor(s.p[0]), Math.floor(s.p[2])) > 0.8 ? -1 : 0),
    );
  },
  quarterstaff(c) {
    c.limb([-8, 0.6, 4.2], [8, 0.6, -4.2], 0.6, 0.6, solid(WOOD));
    for (const t of [-0.15, 0.15])
      c.limb(
        [t * 16 - 0.6, 0.6, -t * 8.4 + 0.3],
        [t * 16 + 0.6, 0.6, -t * 8.4 - 0.3],
        0.75,
        0.75,
        solid(GRIP),
      );
  },
  buckler(c) {
    // Escudo chico de metal con el centro abombado.
    c.ellipsoid([0, 1, 0], lying(0), [4.4, 1.1, 4.4], (s) =>
      Math.hypot(s.p[0], s.p[2]) > 3.7 ? tone(DARK_STEEL, s.light) : metal(STEEL)(s),
    );
    c.sphere([0, 1.8, 0], 1.3, metal(STEEL));
  },
  'metal-shield'(c) {
    // Escudo en forma de gota (punta abajo), de acero con borde y cruz.
    c.polygon(
      [
        [-5, 1, -5],
        [5, 1, -5],
        [5.4, 1, 0],
        [0, 1, 6.4],
        [-5.4, 1, 0],
      ],
      (s) =>
        Math.abs(s.p[0]) < 0.4 || Math.abs(s.p[2] + 1) < 0.4
          ? tone(GOLD, s.light - 0.2)
          : tone(STEEL, s.light - 0.25, Math.abs(s.p[0]) > 4.4 || s.p[2] < -4.4 ? -1 : 0),
    );
  },
  'chain-coif'(c) {
    c.ellipsoid(
      [0, 0.2, 0],
      lying(0),
      [4.2, 3.6, 4.4],
      clipping((s) =>
        s.p[1] > 0 ? tone(STEEL, s.light, (s.x + s.y * 2) % 3 === 0 ? -1 : 0) : null,
      ),
    );
    c.ellipsoid([0, 0.5, 0], lying(0), [5.2, 0.6, 5.6], (s) =>
      tone(STEEL, s.light, (s.x + s.y) % 2 ? -1 : 0),
    );
  },
  ringmail(c) {
    tunic(c, (s) => tone(DARK_STEEL, s.light + 0.1, Math.round(s.p[2] * 1.2) % 2 ? 1 : 0));
  },
  torch(c) {
    c.limb([-4, 0.6, 2.4], [3, 0.8, -1.4], 0.6, 0.8, solid(WOOD));
    c.ellipsoid([3.6, 1.2, -1.8], lying(1), [1.3, 1.1, 1.8], solid(ramp([60, 40, 28])));
    c.sphere([4.4, 2.4, -2.2], 1.4, (s) => tone(ramp([255, 190, 70]), 0.6 + s.light * 0.4));
  },
  lantern(c) {
    // Farol de hierro con vidrios y una llama adentro.
    c.box([0, 2.8, 0], lying(0.3), [2.2, 2.8, 2.2], (s) =>
      Math.abs(s.n[1]) > 0.7 || Math.abs(Math.abs(s.p[0]) - 2) < 0.4
        ? tone(DARK_STEEL, s.light)
        : tone(ramp([255, 210, 120]), 0.7 + s.light * 0.3),
    );
    c.limb([0, 5.6, 0], [0, 6.8, 0], 1.6, 0.6, metal(DARK_STEEL));
    c.limb([-1, 7, 0], [1, 7, 0], 0.3, 0.3, metal(DARK_STEEL));
  },
  lute(c) {
    // Caja en forma de pera y mástil con el clavijero doblado.
    const wood = ramp([186, 120, 62]);
    c.ellipsoid([1.6, 1.4, 1], lying(0.9), [3.6, 1.4, 4.6], (s) =>
      Math.hypot(s.p[0] - 1, s.p[2] - 0.6) < 1.1 && s.n[1] > 0.7
        ? tone(ramp([40, 26, 18]), s.light)
        : tone(wood, s.light),
    );
    c.limb([-1.4, 1.6, -1.2], [-5.4, 1.6, -4], 0.7, 0.6, solid(GRIP));
    c.limb([-5.4, 1.6, -4], [-6.6, 1, -4.2], 0.8, 0.8, solid(GRIP));
  },
  drum(c) {
    c.limb([0, 0, 0], [0, 4.4, 0], 3.8, 3.8, (s) =>
      s.n[1] > 0.7
        ? tone(ramp([226, 212, 180]), s.light)
        : tone(
            ramp([150, 50, 40]),
            s.light,
            Math.floor(Math.atan2(s.p[2], s.p[0]) * 2.5) % 2 ? -1 : 0,
          ),
    );
    c.limb([-4, 5.6, 2], [1, 4.6, 0], 0.35, 0.35, solid(WOOD));
  },
  flute(c) {
    c.limb([-6, 0.6, 3], [6, 0.6, -3], 0.75, 0.7, (s) =>
      Math.abs(((s.p[0] + 20) % 2) - 1) < 0.25 && s.n[1] > 0.6
        ? tone(ramp([60, 40, 24]), s.light)
        : tone(ramp([196, 156, 96]), s.light),
    );
  },
  ruby: gems([220, 30, 50]),
  sapphire: gems([40, 70, 220]),
  emerald: gems([40, 180, 90]),
  amethyst: gems([150, 70, 200]),
  diamond: gems([230, 240, 250]),
  shirt(c, color) {
    tunic(c, (s) => tone(color, s.light, Math.abs(s.p[0]) < 0.3 ? -1 : 0));
  },
  'fancy-shirt'(c, color) {
    tunic(c, (s) =>
      Math.abs(s.p[0]) < 0.6 && Math.round(s.p[2]) % 2 === 0
        ? tone(GOLD, s.light)
        : tone(color, s.light),
    );
  },
  doublet(c, color) {
    tunic(c, (s) =>
      Math.abs(s.p[0]) < 0.4 ? tone(GOLD, s.light) : tone(color, s.light, (s.x + s.y) % 3 ? 0 : -1),
    );
  },
  dress(c, color) {
    // Vestido largo doblado: corpiño angosto y falda ancha.
    c.ellipsoid([0, 1, -2.6], lying(0), [3, 1.1, 2.6], solid(color));
    c.ellipsoid([0, 1, 2.4], lying(0), [5.6, 1.1, 4.4], (s) =>
      tone(color, s.light, Math.sin(s.p[0] * 1.6) > 0.7 ? -1 : 0),
    );
    c.ellipsoid([0, 1.6, -4.4], lying(0), [1.4, 0.5, 0.8], solid(ramp([40, 30, 26])));
  },
  skirt(c, color) {
    c.ellipsoid([0, 1, 0.8], lying(0), [5.4, 1.1, 4.6], (s) =>
      tone(color, s.light, Math.sin(s.p[0] * 1.6) > 0.7 ? -1 : 0),
    );
    c.ellipsoid([0, 1.4, -3.4], lying(0), [3.4, 0.7, 0.9], solid(color, -1));
  },
  'short-pants'(c, color) {
    c.ellipsoid([0, 0.9, -2.4], lying(0), [3.8, 1, 1.7], solid(color));
    for (const side of [1, -1])
      c.limb([side * 1.9, 0.9, -1.6], [side * 2.4, 0.9, 2], 1.9, 1.7, solid(color));
  },
  'straw-hat'(c, color) {
    const weave: Material = (s) => tone(color, s.light, (s.x + s.y) % 2 ? -1 : 0);
    c.ellipsoid([0, 0.5, 0], lying(0), [6.6, 0.5, 6.6], weave);
    c.limb([0, 0.6, 0], [0, 3.8, 0], 3.4, 3, weave);
  },
  'feathered-hat'(c, color) {
    c.ellipsoid([0, 0.5, 0], lying(0), [6.2, 0.5, 6.2], solid(color));
    c.limb([0, 0.6, 0], [0, 3.6, 0], 3.4, 3, (s) =>
      Math.abs(s.p[1] - 1.4) < 0.4 ? tone(GOLD, s.light) : tone(color, s.light),
    );
    c.limb([2.6, 2.6, 0], [5.6, 7, -2.6], 0.9, 0.2, solid(ramp([230, 226, 214])));
  },
  tricorne(c, color) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      c.limb(
        [Math.cos(a), 1, Math.sin(a)],
        [Math.cos(a) * 5.6, 1.8, Math.sin(a) * 5.6],
        1.6,
        0.4,
        solid(color),
      );
    }
    c.limb([0, 0.6, 0], [0, 3.2, 0], 3.4, 3, solid(color, 1));
  },
  bandana(c, color) {
    // Pañuelo doblado en triángulo.
    c.polygon(
      [
        [-5, 0.5, -2],
        [5, 0.5, -2],
        [0, 0.5, 4.5],
      ],
      (s) =>
        tone(
          color,
          s.light,
          (Math.round(s.p[0] * 0.8) + Math.round(s.p[2] * 0.8)) % 3 === 0 ? 1 : 0,
        ),
    );
  },
  sandals(c, color) {
    for (const side of [1, -1]) {
      const x = side * 2.4;
      c.ellipsoid([x, 0.5, 0.6], lying(0), [1.6, 0.4, 3], solid(color));
      for (const z of [-0.8, 1.6])
        c.limb([x - 1.4, 1, z], [x + 1.4, 1, z], 0.35, 0.35, solid(color, -1));
    }
  },
  shoes(c, color) {
    for (const side of [1, -1]) {
      const x = side * 2.4;
      c.ellipsoid([x, 1, 0.8], lying(0), [1.6, 1.1, 2.8], solid(color));
      c.limb([x, 1.4, -1.4], [x, 2.4, -1.6], 1.4, 1.4, solid(color));
    }
  },
  'thigh-boots'(c, color) {
    for (const side of [1, -1]) {
      const x = side * 2.4;
      c.limb([x, 1, -0.6], [x, 8.4, -1], 1.5, 1.8, solid(color));
      c.ellipsoid([x, 1, 1.2], lying(0), [1.6, 1, 2.8], solid(color));
      c.ellipsoid([x, 8.4, -1], lying(0), [2, 0.5, 2], solid(color, 1));
    }
  },
  'fur-cape'(c, color) {
    c.ellipsoid([0, 1, 0.6], lying(0), [5.4, 1.2, 5.6], (s) =>
      tone(color, s.light, noise(Math.floor(s.p[0] * 2), Math.floor(s.p[2] * 2)) > 0.7 ? 1 : 0),
    );
    c.ellipsoid([0, 1.8, -4.4], lying(0), [4, 1.2, 1.6], solid(ramp([226, 214, 196])));
  },
  'leather-gorget'(c, color) {
    gorget(c, 'leather', color);
  },
  'studded-gorget'(c, color) {
    gorget(c, 'studded', color);
  },
  'plate-gorget'(c, color) {
    gorget(c, 'plate', color);
  },
  'leather-sleeves'(c, color) {
    sleeves(c, 'leather', color);
  },
  'studded-sleeves'(c, color) {
    sleeves(c, 'studded', color);
  },
  'ringmail-sleeves'(c, color) {
    sleeves(c, 'ringmail', color);
  },
  'bone-arms'(c, color) {
    sleeves(c, 'bone', color);
  },
  'plate-arms'(c, color) {
    sleeves(c, 'plate', color);
  },
  'leather-gloves'(c, color) {
    gloves(c, 'leather', color);
  },
  'studded-gloves'(c, color) {
    gloves(c, 'studded', color);
  },
  'ringmail-gloves'(c, color) {
    gloves(c, 'ringmail', color);
  },
  'bone-gloves'(c, color) {
    gloves(c, 'bone', color);
  },
  'plate-gloves'(c, color) {
    gloves(c, 'plate', color);
  },
  'studded-leggings'(c, color) {
    legs(
      c,
      pieceMaterial('studded', color, (p) => p[2] * 0.9),
    );
  },
  'ringmail-leggings'(c, color) {
    legs(
      c,
      pieceMaterial('ringmail', color, (p) => p[2] * 0.9),
    );
  },
  'chain-leggings'(c, color) {
    legs(
      c,
      pieceMaterial('chain', color, (p) => p[2]),
    );
  },
  lockpick(c) {
    // Un juego de ganzúas: alambres finos de distintas puntas, atados con un aro.
    c.ellipsoid(
      [-3.4, 0.6, 2],
      lying(0),
      [1.6, 0.4, 1.6],
      clipping((s) => (Math.hypot(s.p[0] + 3.4, s.p[2] - 2) < 0.9 ? null : metal(DARK_STEEL)(s))),
    );
    for (const [dx, dz, hook] of [
      [0, 0, 0.8],
      [0.7, -0.6, -0.6],
      [-0.6, 0.5, 0.4],
    ] as const) {
      const from: Vec3 = [-2.6 + dx * 0.3, 0.6, 1.4 + dz * 0.3];
      const to: Vec3 = [4 + dx, 0.6, -2.2 + dz];
      c.limb(from, to, 0.28, 0.22, metal(STEEL));
      c.limb(to, add(to, [0.4, 0, hook]), 0.24, 0.18, metal(STEEL));
    }
  },
  'silent-grimoire'(c) {
    // Tapas negras con un sello de plata: el libro que nadie debería leer.
    tome(c, ramp([40, 34, 44]), ramp([190, 196, 210]));
  },
  'hermit-diary'(c) {
    // Cuero gastado, atado con un cordel.
    tome(c, ramp([96, 74, 48]), null);
    c.limb([-4.4, 2.5, 0.8], [4.4, 2.5, -0.8], 0.25, 0.25, solid(ramp([150, 120, 80])));
  },
  'buried-crown'(c) {
    // Un aro de oro con puntas y gemas, sucio de tierra.
    c.ellipsoid([0, 1.4, 0], lying(0), [4, 1.4, 4], (s) =>
      Math.hypot(s.p[0], s.p[2]) < 3 ? tone(ramp([60, 44, 30]), s.light) : metal(GOLD)(s),
    );
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const base: Vec3 = [Math.cos(a) * 3.6, 2.2, Math.sin(a) * 3.6];
      c.limb(base, add(base, [0, 2.2, 0]), 0.8, 0.15, metal(GOLD));
      if (i % 2 === 0) c.sphere(add(base, [0, 0.4, 0]), 0.6, solid(ramp([170, 30, 40]), 1));
    }
  },
  'burnt-key'(c) {
    // Una llave grande de hierro, ennegrecida por el fuego.
    const iron = (s: { light: number; p: Vec3 }) =>
      tone(ramp([60, 56, 54]), s.light, s.p[0] > 2 ? -1 : 0);
    c.ellipsoid(
      [-3.6, 0.8, 1.6],
      lying(0.4),
      [1.8, 0.5, 1.8],
      clipping((s) => (Math.hypot(s.p[0] + 3.6, s.p[2] - 1.6) < 0.9 ? null : iron(s))),
    );
    c.limb([-2, 0.8, 0.8], [4.2, 0.8, -2], 0.45, 0.45, iron);
    c.box([3.6, 0.8, -1], lying(0.4), [0.5, 0.4, 1], iron);
  },
  'mastery-magery'(c) {
    scroll(c, ramp([120, 70, 200]));
  },
  'mastery-tactics'(c) {
    scroll(c, ramp([200, 60, 50]));
  },
  'mastery-healing'(c) {
    scroll(c, ramp([90, 180, 90]));
  },
  'mastery-lockpicking'(c) {
    scroll(c, ramp([60, 60, 70]));
  },
  'bone-helm'(c) {
    // Máscara de calavera entera: cráneo, cara con cuencas y dientes, y cuernos de carnero.
    const bone = ramp([212, 200, 150]);
    const hollow = solid(ramp([26, 20, 18]));
    c.ellipsoid([0, 3.6, -0.6], lying(0), [4.2, 3.8, 4.4], solid(bone));
    c.ellipsoid([0, 2.2, 2.4], lying(0), [3.2, 2.6, 2.8], solid(bone));
    for (const side of [1, -1]) {
      c.ellipsoid([side * 1.5, 3.4, 4.2], lying(0), [1.1, 1, 0.6], hollow);
      for (const [a, b] of [
        [
          [side * 3.4, 5.4, -0.4],
          [side * 5.6, 6.2, -2.4],
        ],
        [
          [side * 5.6, 6.2, -2.4],
          [side * 6.2, 3.8, -2.6],
        ],
        [
          [side * 6.2, 3.8, -2.6],
          [side * 5.4, 2.6, -0.6],
        ],
      ] as [Vec3, Vec3][])
        c.limb(a, b, 1, 0.8, solid(bone, -1));
    }
    c.ellipsoid([0, 2.4, 5], lying(0), [0.5, 0.7, 0.4], hollow);
    c.ellipsoid([0, 1, 4.6], lying(0), [1.8, 0.4, 0.5], solid(ramp([236, 228, 196])));
  },
  'bone-armor'(c) {
    const bone = ramp([226, 218, 196]);
    tunic(c, (s) =>
      Math.abs(s.p[0]) < 0.6 || (s.p[2] + 20) % 2 < 1.1
        ? tone(bone, s.light)
        : tone(ramp([70, 50, 36]), s.light),
    );
  },
  'bone-leggings'(c) {
    const bone = ramp([226, 218, 196]);
    legs(c, (s) =>
      Math.round(s.p[2]) % 3 === 0 ? tone(ramp([70, 50, 36]), s.light) : tone(bone, s.light),
    );
  },
  dyes(c) {
    // Tres frasquitos de colores.
    for (const [x, z, rgb] of [
      [-2.4, 1, [190, 40, 40]],
      [0.6, -1.4, [40, 80, 190]],
      [2.4, 1.6, [220, 190, 50]],
    ] as const) {
      c.limb([x, 0, z], [x, 3.4, z], 1.3, 1.2, (s) =>
        s.light > 0.85 ? [240, 240, 250] : tone(ramp(rgb), s.light),
      );
      c.limb([x, 3.4, z], [x, 4.4, z], 0.6, 0.6, solid(ramp([150, 110, 70])));
    }
  },
  'dye-tub'(c, color) {
    // Tina de madera con aros y el agua de color adentro.
    const wood = ramp([140, 96, 56]);
    c.limb([0, 0, 0], [0, 3.6, 0], 4.6, 5, (s) =>
      Math.abs(s.p[1] - 0.8) < 0.4 || Math.abs(s.p[1] - 2.8) < 0.4
        ? tone(DARK_STEEL, s.light)
        : tone(wood, s.light),
    );
    // El agua, del color que se eligió en el panel de la tina.
    c.ellipsoid([0, 3.5, 0], lying(0), [4.3, 0.3, 4.3], (s) =>
      tone(color, s.light, (s.x + s.y) % 4 ? 0 : 1),
    );
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
    katana(c);
  },
  spear(c) {
    // De pie: asta larga con una punta de hoja y un regatón abajo.
    const at = haft(c, alongPole(11), alongPole(-10), 0.5);
    c.polygon([at(0, 0), at(1.6, 1.3), at(5, 0), at(1.6, -1.3)], metal(STEEL));
    c.limb(at(-0.4, 0), at(0.4, 0), 0.75, 0.75, metal(DARK_STEEL));
    c.limb(at(-19, 0), at(-19.8, 0), 0.6, 0.2, metal(DARK_STEEL));
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
    c.box([5, 1.6, -2.4], lying(-1.07), [3.6, 1.6, 1.6], (s) =>
      lit([112, 118, 130], s.n[1] > 0.7 ? s.light * 0.7 : s.light * 0.95, 0.4),
    );
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
    c.polygon([at(-1.8, 0.5), at(1.6, 0.5), at(4.2, 6), at(0, 7.4), at(-4.4, 6)], axeSteel(end, 6));
  },
  'double-axe'(c) {
    // Dos hojas iguales, una a cada lado, sobre un mango corto.
    const at = haft(c, [-6, 0.7, 3], [5, 0.7, -2.4], 0.7);
    for (const side of [1, -1])
      c.polygon(
        [at(-1.4, 0.4 * side), at(1.2, 0.4 * side), at(2.8, 4.4 * side), at(-3, 4.4 * side)],
        axeSteel(at(0, 0), 3.8),
      );
  },
  'battle-axe'(c) {
    // Hoja ancha curva de un lado y un pico corto del otro.
    const at = haft(c, [-6.6, 0.7, 3.3], [5.6, 0.7, -2.8], 0.7);
    c.polygon(
      [at(-1.6, 0.4), at(1.4, 0.4), at(3.6, 5.2), at(0.4, 6.6), at(-3.8, 5.4)],
      axeSteel(at(0, 0), 5.2),
    );
    c.polygon([at(-0.8, -0.4), at(0.8, -0.4), at(0, -3.2)], metal(DARK_STEEL));
  },
  'two-handed-axe'(c) {
    // Mango largo con una hoja grande y una punta arriba.
    const at = haft(c, [-8, 0.6, 4.2], [6, 0.6, -3.2], 0.65);
    c.polygon(
      [at(-2.2, 0.4), at(1.4, 0.4), at(3.4, 4.6), at(0, 6.4), at(-4.6, 4.8)],
      axeSteel(at(0, 0), 5),
    );
    c.polygon([at(0.6, 0.3), at(1.6, -0.6), at(3.6, 0), at(1.6, 0.6)], metal(STEEL));
  },
  'large-battle-axe'(c) {
    // La más grande: doble hoja en media luna sobre un asta larga.
    const at = haft(c, [-8, 0.6, 4.2], [5.8, 0.6, -3], 0.75);
    for (const side of [1, -1])
      c.polygon(
        [
          at(-1.6, 0.4 * side),
          at(1.6, 0.4 * side),
          at(4, 5.2 * side),
          at(0, 6.4 * side),
          at(-4, 5.2 * side),
        ],
        axeSteel(at(0, 0), 5),
      );
    c.sphere(at(1.4, 0), 0.9, metal(GOLD));
  },
  bardiche(c) {
    // De pie: asta muy larga y una hoja alargada de filo curvo atada en dos puntos.
    const at = haft(c, alongPole(11), alongPole(-11), 0.55);
    c.polygon(
      [at(-6.4, 0.3), at(0.6, 0.3), at(1.6, 2.8), at(-1.8, 4.2), at(-7.2, 2.6)],
      axeSteel(at(-3, 0), 3.2),
    );
    for (const along of [-5.6, 0]) c.sphere(at(along, 0), 0.6, metal(DARK_STEEL));
  },
  'war-fork'(c) {
    // De pie: asta y dos púas paralelas.
    const at = haft(c, alongPole(10), alongPole(-8), 0.55);
    c.limb(at(0, -1.4), at(0, 1.4), 0.5, 0.5, metal(DARK_STEEL));
    for (const out of [-1.2, 1.2]) c.limb(at(0, out), at(4.6, out), 0.4, 0.12, metal(STEEL));
  },
  'short-spear'(c) {
    // De pie, más corta que la lanza.
    const at = haft(c, alongPole(8), alongPole(-7), 0.55);
    c.polygon([at(0, 0), at(1.2, 1), at(3.8, 0), at(1.2, -1)], metal(STEEL));
    c.limb(at(-0.2, 0), at(-1, 0), 0.75, 0.75, solid(GRIP));
  },
  'hammer-pick'(c) {
    // Martillo de un lado y pico curvo del otro.
    const at = haft(c, [-6.4, 0.7, 3.4], [4.2, 0.7, -2], 0.6);
    c.box(at(0.4, 1.4, 1.5), lying(-1.07 + Math.PI / 2), [1.6, 1.2, 1.3], (s) =>
      lit([112, 118, 130], s.n[1] > 0.7 ? s.light * 0.7 : s.light * 0.95, 0.4),
    );
    c.limb(at(0.4, 0, 1.5), at(0.4, 1.6, 1.5), 1, 1, (s) =>
      lit([112, 118, 130], s.n[1] > 0.7 ? s.light * 0.7 : s.light * 0.95, 0.4),
    );
    c.limb(at(0.4, -0.4, 1.5), at(-0.4, -4, 1.1), 0.9, 0.15, metal(STEEL));
  },
  cutlass(c) {
    // Hoja corta y ancha, curva, con guarda de cazoleta.
    const from: Vec3 = [-2.4, 0.6, 1.8];
    c.limb(from, [1.8, 0.6, -0.2], 1.1, 1.3, metal(STEEL));
    c.limb([1.8, 0.6, -0.2], [4.8, 0.6, -1.6], 1.3, 0.3, metal(STEEL));
    c.ellipsoid(from, lying(1.1), [1.8, 0.7, 1.4], metal(GOLD));
    hilt(c, from, normalize([4.2, 0, -2]), 2.8, 1.2);
  },
  'viking-sword'(c) {
    // Hoja ancha de punta redondeada y pomo de tres lóbulos.
    blade(c, [-3, 0.6, 2.2], [6.4, 0.6, -2.6], 1.4);
    hilt(c, [-3, 0.6, 2.2], normalize([9.4, 0, -4.8]), 3.2, 2.2);
    c.sphere([-6.6, 0.9, 4.1], 1.1, metal(DARK_STEEL));
  },
  crossbow(c) {
    crossbow(c, 1);
  },
  'heavy-crossbow'(c) {
    crossbow(c, 1.25);
  },
  bolt(c) {
    // Virotes: más cortos y gruesos que las flechas, con aletas de cuero.
    for (const [z, x] of [
      [-1.2, 0],
      [0, 0.5],
      [1.2, -0.3],
    ] as const) {
      const from: Vec3 = [-3.4 + x, 0.6, z + 0.4];
      const to: Vec3 = [3.4 + x, 0.6, z - 0.4];
      c.limb(from, to, 0.4, 0.4, solid(ramp([150, 108, 66])));
      c.limb(to, add(to, [1.2, 0, -0.1]), 0.7, 0.15, metal(DARK_STEEL));
      c.ellipsoid(add(from, [0.6, 0.3, 0]), lying(1.5), [0.5, 0.5, 1], solid(ramp([120, 80, 50])));
    }
  },
  'kite-shield'(c, color) {
    // Escudo alargado en punta, pintado, con borde de hierro.
    c.polygon(
      [
        [-4.4, 1, -6],
        [4.4, 1, -6],
        [4.8, 1, -2],
        [0, 1, 7.4],
        [-4.8, 1, -2],
      ],
      (s) => {
        const edge = s.p[2] < -5.3 || Math.abs(s.p[0]) > 4.2 - Math.max(0, s.p[2]) * 0.55;
        if (edge) return tone(DARK_STEEL, s.light);
        if (Math.abs(s.p[0]) < 0.6 && s.p[2] < 5) return tone(GOLD, s.light - 0.1);
        return tone(color, s.light - 0.15);
      },
    );
    c.sphere([0, 1.6, -1.6], 0.9, metal(GOLD));
  },
  'heater-shield'(c, color) {
    // Escudo de plancha: borde recto arriba y lados que se curvan a la punta.
    const half = (z: number) => (z < 0 ? 5.2 : 5.2 * Math.cos((z / 6.2) * (Math.PI / 2)));
    const outline: Vec3[] = [];
    for (let i = 0; i <= 10; i++) outline.push([half(-5 + i * 1.12), 1, -5 + i * 1.12]);
    for (let i = 10; i >= 0; i--) outline.push([-half(-5 + i * 1.12), 1, -5 + i * 1.12]);
    c.polygon(outline, (s) => {
      if (s.p[2] < -4.3 || Math.abs(s.p[0]) > half(s.p[2]) - 0.8) return tone(STEEL, s.light);
      // Cuartelado: dos cuarteles del color y dos de acero.
      return s.p[0] > 0 === s.p[2] > -0.5
        ? tone(color, s.light - 0.1)
        : tone(DARK_STEEL, s.light + 0.1);
    });
  },
  'female-plate'(c) {
    tunic(c, (s) =>
      Math.abs(((s.p[2] + 20) % 3.2) - 1.6) < 0.25 ? tone(DARK_STEEL, s.light) : metal(STEEL)(s),
    );
    // El busto: dos cuencos de placa más altos.
    for (const side of [1, -1])
      c.ellipsoid([side * 1.7, 1.7, -1.6], lying(0), [1.7, 1.2, 1.6], metal(STEEL));
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
  book(c) {
    // Tapas de cuero marrón, lomo redondeado y esquinas de bronce.
    const cover = ramp([112, 70, 38]);
    c.box([0, 1.2, 0], lying(-0.3), [4.2, 1.1, 5.4], (s) =>
      s.n[1] > 0.7
        ? tone(cover, s.light, Math.abs(s.p[0]) < 0.4 ? -1 : 0)
        : Math.abs(s.n[1]) < 0.5 && s.p[1] > 0.4 && s.p[1] < 2
          ? tone(PAPER, s.light)
          : tone(cover, s.light, -1),
    );
    for (const [x, z] of [
      [3.2, 4.4],
      [-3.2, 4.4],
      [3.2, -4.4],
      [-3.2, -4.4],
    ] as const) {
      const a = Math.cos(-0.3) * x + Math.sin(-0.3) * z;
      const b = -Math.sin(-0.3) * x + Math.cos(-0.3) * z;
      c.sphere([a, 2.4, b], 0.7, metal(GOLD));
    }
  },
  letter(c) {
    // Papel doblado con un sello de lacre rojo.
    c.box([0, 0.5, 0], lying(0.4), [4.4, 0.35, 3.2], (s) =>
      tone(PAPER, s.light, Math.abs(s.p[0] * 0.9 - s.p[2] * 0.4) < 0.25 ? -1 : 0),
    );
    c.sphere([0.4, 1, 0.2], 1.1, (s) => tone(ramp([170, 30, 30]), s.light));
  },
  'treasure-map'(c) {
    // Pergamino viejo, manchado, con un camino punteado que termina en una cruz roja.
    const aged = ramp([206, 184, 140]);
    c.box([0, 0.5, 0], lying(0.35), [4.8, 0.3, 3.6], (s) => {
      const [x, , z] = s.p;
      const cross = Math.abs(Math.abs(x - 2) - Math.abs(z + 1.2)) < 0.35 && Math.abs(x - 2) < 1;
      if (cross) return tone(ramp([176, 34, 30]), s.light);
      const path = Math.abs(z - Math.sin(x * 0.9) * 1.4) < 0.22 && Math.floor(x * 1.6) % 2 === 0;
      if (path && x < 1.4) return tone(ramp([92, 62, 40]), s.light);
      return tone(aged, s.light, noise(s.x, s.y) > 0.82 ? -1 : 0);
    });
    // Un borde todavía enrollado.
    c.limb([-4.6, 1, -2], [-3, 1, 3.4], 0.9, 0.9, (s) => tone(aged, s.light, -1));
  },
  shovel(c) {
    c.limb([-6, 0.7, 3.6], [3, 0.7, -1.8], 0.6, 0.6, solid(WOOD));
    c.limb([-6.6, 0.7, 2.6], [-5.4, 0.7, 4.6], 0.55, 0.55, solid(GRIP));
    c.box([4.8, 0.8, -2.9], lying(-0.54), [2.6, 0.4, 2.1], solid(DARK_STEEL));
  },
  'treasure-chest'(c) {
    // Cofre grande con tapa redonda, flejes y cerradura de oro; asoman monedas.
    const wood = ramp([112, 70, 38]);
    const plank: Material = (s) =>
      tone(wood, s.light, Math.abs(((s.p[0] + 20) % 2.4) - 1.2) < 0.16 ? -1 : 0);
    const axes = lying(0);
    c.box([0, 2.8, 0], axes, [6.4, 2.8, 4.2], plank);
    c.ellipsoid([0, 5.6, 0], axes, [6.5, 2, 4.3], plank);
    for (const x of [-4.4, 0, 4.4]) c.box([x, 3.6, 0], axes, [0.45, 3.7, 4.45], metal(GOLD));
    c.box([0, 4.6, 4.4], axes, [1, 1.1, 0.4], metal(GOLD));
    for (const [x, z] of [
      [-2.2, -0.8],
      [2.6, 1],
      [0.4, -1.8],
    ] as const)
      c.ellipsoid([x, 7.4, z], lying(0.6), [1.1, 0.35, 1.1], metal(GOLD));
  },
  'sloop-deed'(c) {
    shipModel(c, ramp([40, 90, 140]), 1);
  },
  'galleon-deed'(c) {
    shipModel(c, ramp([150, 40, 36]), 2);
  },
  'deed-wood-shack'(c) {
    houseDeed(c, ramp([150, 98, 52]));
  },
  'deed-log-cabin'(c) {
    houseDeed(c, ramp([110, 70, 36]));
  },
  'deed-stone-cottage'(c) {
    houseDeed(c, ramp([150, 150, 160]));
  },
  'deed-sandstone-patio'(c) {
    houseDeed(c, ramp([214, 176, 110]));
  },
  'deed-plank-house'(c) {
    houseDeed(c, ramp([176, 52, 40]));
  },
  'deed-stone-house'(c) {
    houseDeed(c, ramp([60, 96, 160]));
  },
  'deed-basalt-tower'(c) {
    houseDeed(c, ramp([64, 60, 72]));
  },
  'deed-stone-keep'(c) {
    houseDeed(c, ramp([60, 120, 70]));
  },
  'deed-fortress'(c) {
    houseDeed(c, ramp([212, 170, 64]));
  },
  'deed-lot-small'(c) {
    houseDeed(c, ramp([120, 150, 80]), true);
  },
  'deed-lot-medium'(c) {
    houseDeed(c, ramp([90, 130, 150]), true);
  },
  'deed-lot-large'(c) {
    houseDeed(c, ramp([150, 100, 150]), true);
  },
  'deed-lot-huge'(c) {
    houseDeed(c, ramp([190, 120, 60]), true);
  },
  'stone-block'(c) {
    // Bloques de piedra tallada, uno encima de otro, con las aristas gastadas.
    const stone = ramp([150, 146, 136]);
    const cut: Material = (s) => tone(stone, s.light, noise(s.x, s.y) > 0.8 ? -1 : 0);
    c.box([-1.6, 1.4, 0.6], lying(0.2), [2.6, 1.4, 1.9], cut);
    c.box([1.9, 1.4, -0.4], lying(-0.15), [2.4, 1.4, 1.8], cut);
    c.box([0.2, 4.2, 0.1], lying(0.05), [2.5, 1.4, 1.9], cut);
  },
  'house-chest'(c) {
    // Un arcón grande de roble con tapa abovedada, flejes de hierro oscuro y un candado.
    const wood = ramp([104, 66, 36]);
    const iron = ramp([58, 60, 68]);
    const plank: Material = (s) =>
      tone(wood, s.light, Math.abs(((s.p[0] + 20) % 2.2) - 1.1) < 0.14 ? -1 : 0);
    const axes = lying(0);
    c.box([0, 2.6, 0], axes, [6.2, 2.6, 4], plank);
    c.ellipsoid([0, 5.2, 0], axes, [6.3, 1.7, 4.1], plank);
    for (const x of [-4.6, 0, 4.6]) c.box([x, 3.4, 0], axes, [0.4, 3.3, 4.15], solid(iron));
    c.box([0, 4.4, 4.2], axes, [0.9, 1, 0.35], solid(iron));
    c.ellipsoid([0, 3.4, 4.5], lying(0), [0.55, 0.55, 0.3], metal(GOLD));
  },
  'ship-hold'(c) {
    // Escotilla de la bodega: un marco de madera con tapa de tablas y una argolla.
    c.box([0, 1.4, 0], lying(0), [7, 1.4, 6], solid(ramp([96, 64, 38])));
    c.box([0, 3, 0], lying(0), [5.6, 0.5, 4.6], (s) =>
      tone(ramp([150, 108, 64]), s.light, Math.abs(((s.p[2] + 20) % 2.3) - 1.15) < 0.2 ? -1 : 0),
    );
    c.ellipsoid([0, 3.8, 0], lying(0), [1.4, 0.4, 1.4], metal(DARK_STEEL));
  },
  cannonball(c) {
    for (const at of [
      [-2, 2.2, 1],
      [2.2, 2.2, 0.6],
      [0, 2.2, -2.2],
      [0, 5.4, -0.2],
    ] as Vec3[])
      c.sphere(at, 2.4, metal(ramp([62, 62, 70])));
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
  // Runa: una piedra lisa con un signo tallado que brilla (violeta).
  rune(c) {
    const stone = ramp([150, 140, 160]);
    c.ellipsoid([0, 1, 0], lying(0.35), [3.4, 1, 4.2], (s) => {
      const glyph =
        s.n[1] > 0.7 &&
        (Math.abs(s.p[0] - s.p[2] * 0.35) < 0.45 || Math.abs(s.p[2] + s.p[0] * 0.5 - 0.6) < 0.4) &&
        Math.hypot(s.p[0], s.p[2]) < 2.6;
      return glyph ? [196, 140, 255] : tone(stone, s.light, noise(s.x, s.y) > 0.8 ? -1 : 0);
    });
  },
  // Portal: un óvalo de luz azul parado, con remolinos.
  moongate(c) {
    c.ellipsoid([0, 10, 0], axesAlong([0, 0, 1]), [5.2, 10, 1.1], (s) => {
      const r = Math.hypot(s.p[0] / 5.2, (s.p[1] - 10) / 10);
      const swirl = Math.sin(Math.atan2(s.p[1] - 10, s.p[0]) * 3 + r * 9);
      if (r > 0.86) return [210, 236, 255];
      return tone(ramp([60, 130, 240]), 0.55 + 0.25 * swirl + 0.2 * (1 - r));
    });
  },
  'field-stone'(c) {
    // Bloque de piedra tosca, alto, que ocupa el tile.
    const stone = ramp([138, 132, 124]);
    c.box([0, 7, 0], lying(0.2), [5.6, 7, 4.8], (s) =>
      tone(
        stone,
        s.light,
        noise(Math.floor(s.p[0] / 2), Math.floor(s.p[1] / 2), Math.floor(s.p[2] / 2)) > 0.7
          ? -1
          : 0,
      ),
    );
    c.box([1, 15, -1], lying(0.6), [3.6, 2, 3.2], (s) => tone(stone, s.light, 1));
  },
  'field-fire'(c) {
    for (const [x, z, h] of [
      [-2.4, 0.8, 11],
      [1.8, -1.2, 14],
      [0.2, 2.2, 9],
    ] as const) {
      c.limb([x, 0, z], [x * 0.6, h, z * 0.6], 2.6, 0.3, (s) =>
        tone(
          s.p[1] > h * 0.6 ? ramp([255, 230, 140]) : ramp([255, 130, 40]),
          0.75 + s.light * 0.25,
        ),
      );
    }
    c.ellipsoid([0, 0.6, 0], lying(0), [4.6, 0.6, 4.6], solid(ramp([90, 40, 20])));
  },
  'field-poison'(c) {
    for (const [x, y, z, r] of [
      [-2, 3, 1, 2.6],
      [1.8, 6, -1, 2.2],
      [0, 9.5, 0.6, 1.8],
      [2, 2, 2, 1.6],
    ] as const)
      c.sphere([x, y, z], r, (s) =>
        tone(ramp([110, 210, 80]), 0.55 + s.light * 0.45, s.light > 0.85 ? 1 : 0),
      );
  },
  'field-paralyze'(c) {
    // Agujas de hielo que brillan.
    for (const [x, z, h, a] of [
      [-2, 1, 12, 0.2],
      [2, -1, 14, -0.2],
      [0, 2, 9, 0.4],
      [1, -2.4, 10, -0.5],
    ] as const)
      c.limb([x, 0, z], [x + a * 4, h, z - a * 2], 1.4, 0.2, (s) =>
        tone(ramp([170, 240, 255]), 0.7 + s.light * 0.3, s.light > 0.9 ? 1 : 0),
      );
  },
  'field-energy'(c) {
    // Columna de energía azul con chispas.
    c.limb([0, 0, 0], [0, 18, 0], 3.6, 3, (s) => {
      const swirl = Math.sin(s.p[1] * 1.3 + Math.atan2(s.p[2], s.p[0]) * 3);
      return tone(ramp([120, 170, 255]), 0.6 + 0.25 * swirl + 0.15 * s.light);
    });
    for (const y of [4, 10, 15]) c.sphere([2.6, y, 1], 0.8, solid(ramp([240, 250, 255])));
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
  flail(c) {
    flail(c);
  },
  'legion-shield'(c, color) {
    legionShield(c, color);
  },
  'templar-shield'(c, color) {
    templarShield(c, color);
  },
  'samurai-kabuto'(c, color) {
    kabuto(c, color);
  },
  'samurai-mempo'(c, color) {
    mempo(c, color);
  },
  'samurai-do'(c, color) {
    tunic(
      c,
      lamellar(color, (p) => p[2]),
    );
    // Faldón de cinco paneles colgando de la coraza.
    for (const x of [-3.2, -1.1, 1.1, 3.2])
      c.box(
        [x, 0.9, 6.6],
        lying(0),
        [1, 0.4, 1.7],
        lamellar(color, (p) => p[2]),
      );
  },
  'samurai-sode'(c, color) {
    for (const side of [1, -1])
      c.box(
        [side * 3, 1, 0],
        lying(side * 0.12),
        [2.3, 0.45, 4.6],
        lamellar(color, (p) => p[2]),
      );
  },
  'samurai-haidate'(c, color) {
    haidate(c, color);
  },
  'samurai-suneate'(c, color) {
    suneate(c, color);
  },
  'legion-helm'(c) {
    legionHelm(c);
  },
  'legion-cuirass'(c) {
    tunic(c, (s) => {
      // Bandas de acero superpuestas, con hebillas de bronce al centro.
      if (Math.abs(s.p[0]) < 0.7 && (s.p[2] + 20) % 1.3 < 0.5) return lit(GOLD_RGB, s.light);
      return (s.p[2] + 20) % 1.3 < 0.22
        ? lit([70, 74, 84], s.light)
        : lit(STEEL_RGB, s.light * 0.85 + 0.1);
    });
  },
  'legion-arms'(c, color) {
    sleeves(c, 'plate', color, (p) => p[2] * 2.6);
  },
  'legion-greaves'(c) {
    legionGreaves(c);
  },
  'templar-helm'(c) {
    greatHelm(c);
  },
  'templar-hauberk'(c, color) {
    // Malla en las mangas; al frente, la sobreveste con la cruz roja.
    const mail = pieceMaterial('chain', color, (p) => p[2]);
    tunic(c, (s) =>
      Math.abs(s.p[0]) < 3.6 && s.p[2] > -4 ? surcoat(s, s.p[0], s.p[2] + 0.4) : mail(s),
    );
    c.box([0, 0.9, 6.2], lying(0), [3.4, 0.5, 1.6], (s) => surcoat(s, s.p[0], 99));
  },
  'templar-sleeves'(c, color) {
    sleeves(c, 'chain', color);
  },
  'templar-gauntlets'(c, color) {
    gloves(c, 'chain', color);
  },
  'templar-chausses'(c, color) {
    legs(
      c,
      pieceMaterial('chain', color, (p) => p[2]),
    );
    for (const side of [1, -1]) c.sphere([side * 2.3, 1.8, 1.4], 1.5, metal(STEEL));
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
/** Materiales de las piezas sueltas de armadura, en el ícono. */
type PieceStuff = 'leather' | 'studded' | 'ringmail' | 'chain' | 'plate' | 'bone';
function pieceMaterial(stuff: PieceStuff, color: Ramp, band: (p: Vec3) => number): Material {
  const wrap = (v: number, m: number): number => ((v % m) + m) % m;
  const bone = ramp([212, 200, 150]);
  switch (stuff) {
    case 'leather':
      return (s) => tone(color, s.light, wrap(band(s.p), 2.6) < 0.35 ? -1 : 0);
    case 'studded':
      return (s) =>
        wrap(band(s.p), 2) < 0.7 && wrap(s.p[0] + s.p[2], 1.8) < 0.8
          ? tone(STEEL, s.light + 0.3, 1)
          : tone(color, s.light);
    case 'ringmail':
      return (s) => tone(DARK_STEEL, s.light + 0.15, Math.round(band(s.p) * 1.5) % 2 ? 1 : 0);
    case 'chain':
      return (s) => tone(STEEL, s.light, (s.x + s.y * 2) % 3 === 0 ? -1 : (s.x + s.y) % 2 ? 1 : 0);
    case 'plate':
      return (s) => (wrap(band(s.p), 2.6) < 0.3 ? tone(DARK_STEEL, s.light) : metal(STEEL)(s));
    case 'bone':
      return (s) =>
        wrap(band(s.p), 2.2) < 0.5 ? tone(ramp([40, 34, 30]), s.light) : tone(bone, s.light);
  }
}

/** Gola acostada: anillos de cuello, uno sobre otro, con el hueco del cuello. */
function gorget(c: VolumeCanvas, stuff: PieceStuff, color: Ramp): void {
  const rings: readonly [number, number][] =
    stuff === 'plate'
      ? [
          [0.6, 5.6],
          [1.5, 4.8],
          [2.4, 4],
        ]
      : [
          [0.8, 5.2],
          [2, 4.4],
        ];
  for (const [y, r] of rings)
    c.ellipsoid(
      [0, y, 0],
      lying(0),
      [r, 0.7, r * 0.85],
      clipping((s) =>
        Math.hypot(s.p[0], s.p[2] / 0.85) < 2.6
          ? null
          : stuff === 'plate'
            ? tone(STEEL, s.light + 0.1, 1)
            : pieceMaterial(stuff, color, (p) => Math.atan2(p[2], p[0]) * 3)(s),
      ),
    );
}

/** Par de mangas o brazales, acostados uno al lado del otro. */
function sleeves(
  c: VolumeCanvas,
  stuff: PieceStuff,
  color: Ramp,
  band: (p: Vec3) => number = (p) => p[2] * 1.1,
): void {
  for (const side of [1, -1]) {
    const x = side * 2.6;
    const material = pieceMaterial(stuff, color, band);
    c.limb([x, 1.6, -5.4], [x + side * 0.4, 1.4, 0], 2, 1.7, material);
    c.limb([x + side * 0.4, 1.4, 0], [x + side * 0.2, 1.2, 5], 1.7, 1.4, material);
    if (stuff === 'plate') {
      c.sphere([x + side * 0.4, 2, 0], 1.9, metal(STEEL));
      c.ellipsoid([x - side * 0.5, 3, -5.2], lying(0), [2.6, 1.2, 1.8], metal(STEEL));
    }
    if (stuff === 'bone')
      c.limb(
        [x + side * 0.4, 2.2, 0],
        [x + side * 1.6, 3.6, -1.2],
        0.6,
        0.15,
        solid(ramp([212, 200, 150])),
      );
  }
}

/** Par de guantes: palma, dedos, pulgar y puño (acampanado en los guanteletes). */
function gloves(c: VolumeCanvas, stuff: PieceStuff, color: Ramp): void {
  for (const side of [1, -1]) {
    const x = side * 3;
    const material = pieceMaterial(stuff, color, (p) => p[2] * 1.6);
    const cuff = stuff === 'plate' ? metal(STEEL) : material;
    c.limb(
      [x, 1.4, 4.4],
      [x, 1.2, 1.8],
      stuff === 'plate' || stuff === 'bone' ? 2.2 : 1.7,
      1.6,
      cuff,
    );
    c.ellipsoid([x, 1.1, 0.4], lying(0), [1.8, 0.9, 1.6], material);
    for (const k of [-1.2, -0.4, 0.4, 1.2])
      c.limb([x + k, 1, -0.8], [x + k * 1.1, 0.9, -3.4 + Math.abs(k) * 0.5], 0.5, 0.4, material);
    c.limb([x - side * 1.6, 1.1, 0.8], [x - side * 3, 1, -0.6], 0.6, 0.45, material);
  }
}

/** Un libro cerrado con tapas del color pedido y, si se quiere, un sello en el frente. */
function tome(c: VolumeCanvas, cover: Ramp, seal: Ramp | null): void {
  c.box([0, 1.2, 0], lying(-0.3), [4.2, 1.1, 5.4], (s) =>
    s.n[1] > 0.7
      ? tone(cover, s.light, Math.abs(s.p[0]) < 0.4 ? -1 : 0)
      : Math.abs(s.n[1]) < 0.5 && s.p[1] > 0.4 && s.p[1] < 2
        ? tone(PAPER, s.light, -1)
        : tone(cover, s.light, -1),
  );
  if (seal) c.ellipsoid([0, 2.4, 0], lying(0), [1.6, 0.4, 1.6], metal(seal));
}

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
export function drawItem(
  kind: ItemKind,
  style: ItemStyle = 'ground',
  amount = 1,
  hue?: number,
): PixelImage {
  // Los íconos (mochila, ventanas) se dibujan al doble de resolución: más detalle.
  const detail = style === 'icon' ? ICON_DETAIL : 1;
  const camera = new Camera(
    0.45,
    (ITEM_ART_SIZE * detail) / 2,
    ITEM_ART_SIZE * 0.6 * detail,
    0.8,
    ZOOM[style] * detail * (style === 'icon' ? (ICON_FIT[kind] ?? 1) : 1),
  );
  const canvas = new VolumeCanvas(ITEM_ART_SIZE * detail, ITEM_ART_SIZE * detail, camera);
  canvas.detail = detail;
  const definition = ITEMS[kind];
  const base = hue ?? definition.color;
  const color = ramp(base === undefined ? [128, 128, 128] : hexToRgb(base));
  if (kind === 'gold') coins(canvas, GOLD_PILES[itemVariant(kind, amount)]?.coins ?? 7);
  else if (definition.spell)
    scroll(canvas, ramp(CIRCLE_RIBBON[SPELLS[definition.spell].circle - 1] ?? [200, 60, 50]));
  else MODELS[kind as BaseItemKind](canvas, color);
  return canvas.toImage(OUTLINE);
}

// ── Etapa 59: katana, mangual, escudos grandes y armaduras samurái, legionaria y templaria ──

/**
 * Katana acostada: hoja curva con el filo templado (la línea ondulada del
 * temple, más clara), el lomo oscuro, la punta en ángulo, el collar dorado,
 * la guarda de hierro con borde de oro y el mango envuelto en rombos.
 */
function katana(c: VolumeCanvas): void {
  const d = normalize([1, 0, -0.55]);
  // Hacia arriba en el ícono: la hoja se curva hacia ahí.
  const n: Vec3 = [d[2], 0, -d[0]];
  const h0: Vec3 = [-2.4, 0.6, 1.9];
  const length = 11.6;
  const sag = 1.1;
  const center = (t: number): Vec3 => add(h0, add(scale3(d, length * t), scale3(n, sag * t * t)));
  const width = (t: number): number => 0.95 - 0.28 * t;
  const spine: Vec3[] = [];
  const edge: Vec3[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const w = width(t);
    spine.push(add(center(t), scale3(n, 0.28 * w)));
    // La punta: el filo sube hasta el lomo en curva.
    const k = t < 0.88 ? 0 : (t - 0.88) / 0.12;
    edge.push(add(center(t), scale3(n, -0.72 * w * (1 - k * k) + 0.28 * w * k * k)));
  }
  const tip = add(center(1), add(scale3(n, 0.2), scale3(d, 0.7)));
  c.polygon([...spine, tip, ...edge.reverse()], (s) => {
    const rel: Vec3 = [s.p[0] - h0[0], 0, s.p[2] - h0[2]];
    const t = Math.max(0, Math.min(1, (rel[0] * d[0] + rel[2] * d[2]) / length));
    const c0 = center(t);
    const across = ((s.p[0] - c0[0]) * n[0] + (s.p[2] - c0[2]) * n[2]) / width(t);
    const hamon = -0.38 + 0.09 * Math.sin(t * 46) + 0.04 * Math.sin(t * 17);
    const sheen = s.light * 0.7 + 0.25 * Math.sin(t * Math.PI);
    if (Math.abs(across + 0.02) < 0.07) return lit(EDGE_RGB, sheen + 0.25);
    if (across > 0.14) return lit([78, 84, 98], sheen, 0.2);
    if (across < hamon) return lit([226, 230, 236], sheen + 0.15 + (across < -0.62 ? 0.15 : 0));
    return lit([132, 142, 160], sheen + 0.05);
  });
  // Collar dorado, guarda de hierro con borde de oro y mango envuelto.
  c.limb(h0, add(h0, scale3(d, 0.9)), 0.9, 0.85, (s) => lit(GOLD_RGB, s.light, 0.8));
  c.ellipsoid(h0, axesAlong(d), [1.9, 0.35, 1.9], (s) => {
    const r = Math.hypot(s.p[0] - h0[0], s.p[2] - h0[2], (s.p[1] - h0[1]) * 1.2);
    return r > 1.55 ? lit(GOLD_RGB, s.light, 0.8) : lit([58, 54, 56], s.light, 0.3);
  });
  const end = add(h0, scale3(d, -5.4));
  c.limb(h0, end, 0.74, 0.7, (s) => {
    const a = (s.p[0] - h0[0]) * -d[0] + (s.p[2] - h0[2]) * -d[2];
    const b = (s.p[0] - h0[0]) * n[0] + (s.p[2] - h0[2]) * n[2] + s.p[1] * 0.6;
    const u = (((a * 1.5 + b * 1.6) % 1) + 1) % 1;
    const v = (((a * 1.5 - b * 1.6) % 1) + 1) % 1;
    // Rombos claros (la piel de raya) entre las cintas oscuras cruzadas.
    if (u > 0.3 && u < 0.7 && v > 0.3 && v < 0.7) return lit([226, 222, 206], s.light);
    return lit([34, 34, 52], s.light + 0.1, 0.2);
  });
  c.sphere(add(h0, scale3(d, -2.6)), 0.55, (s) => lit(GOLD_RGB, s.light, 0.8));
  c.ellipsoid(end, axesAlong(d), [0.82, 0.6, 0.82], (s) => lit([58, 54, 56], s.light, 0.5));
}

/** Bola de hierro con púas. */
function spikedBall(c: VolumeCanvas, at: Vec3, r: number): void {
  c.sphere(at, r, (s) => lit([92, 96, 106], s.light, 0.5));
  const dirs: Vec3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [0, 0, -1],
    [0.6, 0.6, 0.6],
    [-0.6, 0.6, 0.6],
    [0.6, 0.6, -0.6],
    [-0.6, 0.6, -0.6],
  ];
  for (const raw of dirs) {
    const v = normalize(raw);
    c.limb(add(at, scale3(v, r * 0.8)), add(at, scale3(v, r * 1.75)), r * 0.32, 0.08, (s) =>
      lit(EDGE_RGB, s.light * 0.9),
    );
  }
}

/** Cadena de eslabones de `from` a `to`, con una caída en el medio. */
function chain(c: VolumeCanvas, from: Vec3, to: Vec3, links: number): void {
  for (let i = 0; i < links; i++) {
    const t = (i + 0.5) / links;
    const at = add(lerp3(from, to, t), [0, -Math.sin(t * Math.PI) * 0.4, 0]);
    const dir = normalize([to[0] - from[0], 0, to[2] - from[2]]);
    const axes = axesAlong(i % 2 ? [dir[0], 0.7, dir[2]] : dir);
    c.ellipsoid(
      at,
      axes,
      [0.42, 0.62, 0.18],
      clipping((s) => {
        const q: Vec3 = [s.p[0] - at[0], s.p[1] - at[1], s.p[2] - at[2]];
        const along = q[0] * axes[1][0] + q[1] * axes[1][1] + q[2] * axes[1][2];
        const side = q[0] * axes[0][0] + q[1] * axes[0][1] + q[2] * axes[0][2];
        return Math.hypot(side / 0.42, along / 0.62) < 0.5 ? null : lit(STEEL_RGB, s.light);
      }),
    );
  }
}

/**
 * Mangual: mango de madera con el agarre acanalado y zunchos de hierro, un
 * aro arriba y tres cadenas que terminan en bolas con púas.
 */
function flail(c: VolumeCanvas): void {
  const from: Vec3 = [-6, 0.8, 3.8];
  const to: Vec3 = [0.6, 0.8, 0.2];
  const d = normalize([to[0] - from[0], 0, to[2] - from[2]]);
  const grain = woodGrain(from, to);
  c.limb(from, to, 0.68, 0.74, (s) => {
    const a = (s.p[0] - from[0]) * d[0] + (s.p[2] - from[2]) * d[2];
    // Agarre acanalado en la mitad de abajo.
    if (a > 0.8 && a < 4.2 && (((a * 2.2) % 1) + 1) % 1 < 0.32)
      return lit([70, 44, 26], s.light, 0.1);
    return grain(s);
  });
  for (const t of [0, 0.62, 1]) {
    const at = lerp3(from, to, t);
    c.limb(add(at, scale3(d, -0.35)), add(at, scale3(d, 0.35)), 0.86, 0.86, (s) =>
      lit([88, 92, 102], s.light, 0.6),
    );
  }
  const ring = add(to, scale3(d, 0.9));
  c.ellipsoid(
    ring,
    axesAlong([0, 1, 0]),
    [0.8, 0.25, 0.8],
    clipping((s) =>
      Math.hypot(s.p[0] - ring[0], s.p[2] - ring[2]) < 0.4 ? null : metal(STEEL)(s),
    ),
  );
  for (const ball of [
    [6.2, 1.6, -5.4],
    [7.6, 1.6, -0.4],
    [2, 1.6, -6.8],
  ] as Vec3[]) {
    chain(c, ring, ball, 8);
    spikedBall(c, ball, 1.35);
  }
}

/** Escudo legionario: rectangular y curvo, con borde de bronce, umbo y alas doradas. */
function legionShield(c: VolumeCanvas, color: Ramp): void {
  const w = 4.8;
  const h = 7.4;
  const outline: Vec3[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    // Rectángulo de esquinas apenas redondeadas.
    const x = Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** 0.18 * w;
    const z = Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** 0.18 * h;
    outline.push([x, 1, z]);
  }
  c.polygon(outline, (s) => {
    const x = s.p[0];
    const z = s.p[2];
    // Curvo: los costados se oscurecen como si se fueran para atrás.
    const light = s.light - (Math.abs(x) / w) ** 2 * 0.35;
    if (Math.abs(x) > w - 0.6 || Math.abs(z) > h - 0.6) return lit(GOLD_RGB, light + 0.1, 0.8);
    const r = Math.hypot(x * 0.85, z);
    // Alas: dos arcos a cada lado del umbo, y rayos hacia las esquinas.
    const wing = Math.abs(r - 3.1) < 0.28 && Math.abs(z) > 0.8;
    const bolt = Math.abs(Math.abs(z) - Math.abs(x) * 1.25 - 1.6) < 0.25 && Math.abs(x) > 1.4;
    if (Math.abs(z) < 0.32 || wing || bolt) return lit(GOLD_RGB, light, 0.7);
    return tone(color, light, noise(Math.floor(x * 3), Math.floor(z * 3)) > 0.9 ? -1 : 0);
  });
  c.ellipsoid([0, 1.2, 0], lying(0), [1.8, 1, 1.8], (s) =>
    Math.hypot(s.p[0], s.p[2]) > 1.45 ? lit(GOLD_RGB, s.light, 0.8) : lit(STEEL_RGB, s.light),
  );
}

/** Escudo templario: de plancha, blanco, con la cruz roja de brazos que se abren. */
function templarShield(c: VolumeCanvas, color: Ramp): void {
  const top = -5.6;
  const bottom = 7.2;
  const half = (z: number): number =>
    z < 0 ? 5.6 : 5.6 * Math.cos((z / bottom) * (Math.PI / 2)) ** 0.8;
  // Desde la punta de abajo: el abanico de triángulos queda dentro del contorno.
  const outline: Vec3[] = [[0, 1, bottom]];
  for (let i = 11; i >= 0; i--) {
    const z = top + (i * (bottom - top)) / 12;
    outline.push([half(z), 1, z]);
  }
  for (let i = 0; i <= 11; i++) {
    const z = top + (i * (bottom - top)) / 12;
    outline.push([-half(z), 1, z]);
  }
  const red = ramp([168, 30, 30]);
  c.polygon(outline, (s) => {
    const x = s.p[0];
    const z = s.p[2];
    if (z < top + 0.6 || Math.abs(x) > half(z) - 0.6) return lit([120, 126, 138], s.light);
    if (crossPattee(x, z + 0.6, 4.6)) return tone(red, s.light);
    return tone(color, s.light + 0.05);
  });
}

/** ¿Está el punto dentro de una cruz de brazos que se ensanchan hacia afuera? */
function crossPattee(x: number, z: number, reach: number): boolean {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (ax > reach || az > reach) return false;
  return ax < 0.55 + az * 0.22 || az < 0.55 + ax * 0.22;
}

/** Sobreveste blanca con la cruz roja (x, z: dónde en la sobreveste). */
function surcoat(s: { light: number }, x: number, z: number): Rgb {
  if (crossPattee(x, z, 2.9)) return lit([176, 34, 32], s.light);
  return lit([232, 226, 210], s.light, 0.1);
}

/**
 * Placas laqueadas en hileras atadas con cordones: cada hilera clara arriba,
 * oscura abajo, con los cordones azul oscuro y los remaches dorados.
 */
function lamellar(color: Ramp, row: (p: Vec3) => number): Material {
  return (s) => {
    const r = (((row(s.p) % 1.3) + 1.3) % 1.3) / 1.3;
    const lace = (((s.p[0] * 0.75) % 1) + 1) % 1 < 0.16;
    if (r < 0.14) return lit([212, 170, 76], s.light, 0.7);
    if (lace) return lit([40, 46, 84], s.light);
    return tone(color, s.light + 0.15 - r * 0.3, r < 0.3 ? 1 : 0);
  };
}

/** Yelmo samurái: cuenco con nervios, cubrenuca de láminas y cuernos dorados al frente. */
function kabuto(c: VolumeCanvas, color: Ramp): void {
  c.ellipsoid(
    [0, 1.6, 0],
    lying(0),
    [4, 4, 4.2],
    clipping((s) => {
      if (s.p[1] < 1.6) return null;
      const a = Math.atan2(s.p[0], s.p[2]);
      return Math.abs(Math.sin(a * 8)) < 0.12
        ? lit([212, 170, 76], s.light, 0.6)
        : lit([70, 34, 30], s.light * 0.9 + 0.15, 0.8);
    }),
  );
  // Cubrenuca: tres láminas que se abren hacia atrás y a los costados.
  for (const [i, y] of [1.4, 0.6, -0.2].entries())
    c.ellipsoid(
      [0, y, -0.8 - i * 0.3],
      lying(0),
      [4.4 + i * 0.7, 0.55, 4.2 + i * 0.6],
      clipping((s) => (s.p[2] > 2.2 ? null : lamellar(color, (p) => p[1] * 2 + 0.4)(s))),
    );
  for (const side of [1, -1]) {
    // Solapas vueltas a los lados de la cara y los cuernos en media luna.
    c.ellipsoid([side * 3.8, 1.8, 2.4], lying(side * 0.6), [1.2, 1, 0.5], solid(color, 1));
    c.limb([side * 0.6, 2.6, 4], [side * 2.2, 5.4, 4.6], 0.5, 0.35, (s) =>
      lit(GOLD_RGB, s.light, 0.9),
    );
    c.limb([side * 2.2, 5.4, 4.6], [side * 2.6, 8, 4.2], 0.35, 0.12, (s) =>
      lit(GOLD_RGB, s.light, 0.9),
    );
  }
  c.ellipsoid([0, 2.4, 4.1], lying(0), [1, 0.9, 0.4], (s) => lit(GOLD_RGB, s.light, 0.9));
}

/** Máscara samurái: media cara laqueada con nariz y bigote, y el babero de láminas. */
function mempo(c: VolumeCanvas, color: Ramp): void {
  // De pie, mirando al frente: de la nariz al mentón, y el babero de láminas debajo.
  c.ellipsoid(
    [0, 5.4, 0],
    lying(0),
    [3.2, 3.6, 2.8],
    clipping((s) => (s.p[2] < 0 || s.p[1] > 6.6 ? null : tone(color, s.light + 0.12))),
  );
  c.ellipsoid([0, 6.2, 2.6], lying(0), [0.75, 1.3, 0.8], solid(color, 1));
  c.ellipsoid([0, 4.2, 2.6], lying(0), [1.5, 0.3, 0.3], solid(ramp([20, 16, 16])));
  for (const side of [1, -1])
    c.limb([side * 0.3, 4.9, 2.9], [side * 2.2, 4.4, 2.2], 0.34, 0.12, solid(ramp([24, 20, 20])));
  for (const [i, y] of [2.4, 1.3, 0.3].entries())
    c.ellipsoid(
      [0, y, -0.4],
      lying(0),
      [3.4 + i * 0.5, 0.62, 2.8 + i * 0.4],
      clipping((s) => (s.p[2] < -0.6 ? null : lamellar(color, (p) => p[1] + 0.2)(s))),
    );
}

/** Faldar samurái: dos paneles de placas chicas cosidas sobre tela, colgando del cinto. */
function haidate(c: VolumeCanvas, color: Ramp): void {
  c.limb([-4.6, 1.2, -5.4], [4.6, 1.2, -5.4], 0.7, 0.7, solid(ramp([40, 46, 84])));
  for (const side of [1, -1])
    c.box([side * 2.5, 1, 0.6], lying(-side * 0.08), [2.3, 0.4, 5.6], (s) => {
      const gx = (((s.p[0] * 1.6) % 1) + 1) % 1;
      const gz = (((s.p[2] * 1.6) % 1) + 1) % 1;
      if (gx < 0.18 || gz < 0.18) return lit([40, 46, 84], s.light);
      return tone(color, s.light + 0.1 - gz * 0.2, gz < 0.4 ? 1 : 0);
    });
}

/** Canilleras samuráis: tablillas laqueadas unidas por malla, con el empeine. */
function suneate(c: VolumeCanvas, color: Ramp): void {
  for (const side of [1, -1]) {
    const x = side * 2.5;
    c.limb([x, 1.4, -5], [x, 1.4, 3.6], 1.6, 1.3, (s) => {
      const stripe = ((((s.p[0] - x) * 1.9) % 1) + 1) % 1;
      if (stripe < 0.22) return tone(ramp([120, 126, 138]), s.light, (s.x + s.y) % 2 ? 1 : 0);
      return tone(color, s.light + 0.1);
    });
    c.limb([x - 1.6, 1.8, -4.6], [x + 1.6, 1.8, -4.6], 0.35, 0.35, solid(ramp([40, 46, 84])));
    c.ellipsoid([x, 1, 5], lying(0), [1.5, 0.8, 1.8], solid(ramp([40, 34, 30])));
  }
}

/** Yelmo legionario: casco con cubrenuca, carrilleras, visera y penacho rojo. */
function legionHelm(c: VolumeCanvas): void {
  c.ellipsoid(
    [0, 0.6, 0],
    lying(0),
    [4.2, 4.4, 4.5],
    clipping((s) => (s.p[1] < 0.6 ? null : lit(STEEL_RGB, s.light * 0.9 + 0.08))),
  );
  c.ellipsoid(
    [0, 0.9, -1.6],
    lying(0),
    [4.6, 0.4, 3.6],
    clipping((s) => (s.p[2] > 0 ? null : lit(STEEL_RGB, s.light))),
  );
  c.ellipsoid([0, 2.4, 3.6], lying(0), [3.8, 0.3, 1.2], (s) => lit(GOLD_RGB, s.light, 0.8));
  for (const side of [1, -1])
    c.ellipsoid([side * 3.4, 0.6, 2.4], lying(side * 0.35), [0.5, 1.5, 1.5], (s) =>
      lit(STEEL_RGB, s.light * 0.9 + 0.1),
    );
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const z = -3.6 + t * 6.6;
    const y = 4.2 + Math.sin(t * Math.PI) * 1.4;
    c.limb([0, y - 0.6, z], [0, y + 1.6, z + 0.2], 0.9, 0.55, (s) =>
      tone(ramp([170, 34, 30]), s.light, (i + Math.round(s.p[1] * 2)) % 3 === 0 ? -1 : 0),
    );
  }
}

/** Grebas legionarias: el faldón de tiras de cuero con remaches y las dos grebas. */
function legionGreaves(c: VolumeCanvas): void {
  const strap = ramp([126, 40, 34]);
  c.limb([-4.4, 1.2, -6], [4.4, 1.2, -6], 0.8, 0.8, solid(LEATHER_DARK_ICON));
  for (let i = 0; i < 7; i++) {
    const x = -3.9 + i * 1.3;
    c.box([x, 1, -3.4], lying(0), [0.55, 0.3, 2.4], (s) =>
      s.p[2] > -1.6 ? lit(GOLD_RGB, s.light, 0.7) : tone(strap, s.light, i % 2 ? -1 : 0),
    );
  }
  for (const side of [1, -1]) {
    const x = side * 2.4;
    c.limb([x, 1.4, 0.6], [x, 1.2, 7], 1.7, 1.25, (s) =>
      lit(STEEL_RGB, s.light * 0.85 + 0.12 - Math.abs(s.p[0] - x) * 0.08),
    );
    c.sphere([x, 2.2, 1.2], 1.4, (s) => lit(STEEL_RGB, s.light));
  }
}

/** Yelmo templario: cilindro de techo plano con la mirilla y la cruz de refuerzo. */
function greatHelm(c: VolumeCanvas): void {
  c.limb([0, 0, 0], [0, 6, 0], 4, 3.8, (s) => {
    const front = s.p[2] > 1.6;
    if (front && Math.abs(s.p[1] - 3.8) < 0.35 && Math.abs(s.p[0]) > 0.5)
      return [18, 16, 18] as Rgb;
    if (front && (Math.abs(s.p[0]) < 0.5 || Math.abs(s.p[1] - 4.5) < 0.3))
      return lit(GOLD_RGB, s.light, 0.7);
    if (front && s.p[1] < 2.8 && s.p[0] > 0.8 && (s.x + s.y) % 3 === 0) return [24, 22, 24] as Rgb;
    return lit(STEEL_RGB, s.light * 0.85 + 0.1);
  });
  c.ellipsoid([0, 6, 0], lying(0), [3.8, 0.3, 3.8], (s) => lit(STEEL_RGB, s.light));
}

const LEATHER_DARK_ICON = ramp([84, 54, 34]);

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
