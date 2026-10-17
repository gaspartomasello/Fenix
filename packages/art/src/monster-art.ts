import { isMountKind, type CreatureKind, type Direction } from '@fenix/shared';
import { OUTLINE } from './character-art';
import { ART_DETAIL, spriteCanvas, type CanvasFactory } from './humanoid-rig';
import { mountLayout } from './mount-art';
import { biteOffset, gait } from './creature-motion';
import { faunaLayout, isFaunaArtKind } from './fauna-art';
import { drawSkullHead } from './humanoid-head';
import {
  CHARACTER_ART_HEIGHT,
  CHARACTER_ART_WIDTH,
  CHARACTER_FEET_Y,
  CHARACTER_HEAD_Y,
  cameraFor,
  humanoidRig,
  type CharacterFrame,
  type Rig,
} from './humanoid-rig';
import type { PixelImage, Rgb } from './pixel-art';
import type { VolumeCanvas } from './volume';
import {
  Camera,
  clipping,
  add,
  axesAlong,
  lerp,
  metal,
  noise,
  normalize,
  ramp,
  scale,
  solid,
  sub,
  tone,
  type Material,
  type Ramp,
  type Vec3,
} from './volume';

/** Criaturas de la isla y la mazmorra (además de rata, lobo y esqueleto). */
export type MonsterKind = Extract<
  CreatureKind,
  | 'giant-spider'
  | 'orc'
  | 'troll'
  | 'skeleton-mage'
  | 'lich'
  | 'dragon'
  | 'lizardman'
  | 'zombie'
  | 'ghoul'
  | 'wraith'
>;

export function isMonsterKind(kind: CreatureKind): kind is MonsterKind {
  return (
    kind === 'giant-spider' ||
    kind === 'orc' ||
    kind === 'troll' ||
    kind === 'skeleton-mage' ||
    kind === 'lich' ||
    kind === 'dragon' ||
    kind === 'lizardman' ||
    kind === 'zombie' ||
    kind === 'ghoul' ||
    kind === 'wraith'
  );
}

/** Tamaño del lienzo de una criatura y dónde apoya los pies (el dragón no entra en el común). */
export interface CreatureLayout {
  readonly width: number;
  readonly height: number;
  readonly feetY: number;
  /** Fila aproximada de la parte de arriba: sobre ella van el nombre y la vida. */
  readonly headY: number;
}

const COMMON: CreatureLayout = {
  width: CHARACTER_ART_WIDTH,
  height: CHARACTER_ART_HEIGHT,
  feetY: CHARACTER_FEET_Y,
  headY: CHARACTER_HEAD_Y,
};
const DRAGON_LAYOUT: CreatureLayout = { width: 128, height: 112, feetY: 104, headY: 18 };

export function creatureLayout(kind: CreatureKind): CreatureLayout {
  if (isMountKind(kind)) {
    // Las monturas sueltas usan el lienzo de los jinetes.
    const layout = mountLayout(kind);
    return { ...layout, headY: layout.topY };
  }
  if (isFaunaArtKind(kind)) return faunaLayout(kind);
  return kind === 'dragon' ? DRAGON_LAYOUT : COMMON;
}

const ZOOM: Readonly<Record<MonsterKind, number>> = {
  'giant-spider': 1.25,
  orc: 1.12,
  troll: 1.3,
  'skeleton-mage': 1.1,
  lich: 1.18,
  dragon: 1.35,
  lizardman: 1.1,
  zombie: 1.06,
  ghoul: 1.08,
  wraith: 1.15,
};

export function drawMonsterFrame(
  kind: MonsterKind,
  direction: Direction,
  frame: CharacterFrame,
  canvasFor: CanvasFactory = spriteCanvas,
): PixelImage {
  const layout = creatureLayout(kind);
  const camera = kind === 'dragon' ? dragonCamera(direction) : cameraFor(direction, ZOOM[kind]);
  const canvas = canvasFor(layout.width, layout.height, camera);
  switch (kind) {
    case 'giant-spider':
      drawSpider(canvas, frame);
      break;
    case 'orc':
      drawOrc(canvas, humanoidRig(frame, true));
      break;
    case 'troll':
      drawTroll(canvas, humanoidRig(frame, false));
      break;
    case 'skeleton-mage':
      drawSkeletonMage(canvas, humanoidRig(frame, true));
      break;
    case 'lich':
      drawLich(canvas, humanoidRig(frame, true));
      break;
    case 'dragon':
      drawDragon(canvas, frame);
      break;
    case 'lizardman':
      drawLizardman(canvas, humanoidRig(frame, true));
      break;
    case 'zombie':
      drawZombie(canvas, humanoidRig(frame, false));
      break;
    case 'ghoul':
      drawGhoul(canvas, humanoidRig(frame, false));
      break;
    case 'wraith':
      drawWraith(canvas, humanoidRig(frame, false), frame);
      break;
  }
  return canvas.toImage(OUTLINE);
}

/** Cámara del dragón: la misma vista que las demás, centrada en su lienzo más grande. */
function dragonCamera(direction: Direction): Camera {
  return new Camera(
    facingOf(direction),
    (DRAGON_LAYOUT.width * ART_DETAIL) / 2,
    DRAGON_LAYOUT.feetY * ART_DETAIL,
    undefined,
    ZOOM.dragon * ART_DETAIL,
  );
}

/** Ángulo de cada dirección en pantalla (el mismo que usa `cameraFor`). */
function facingOf(direction: Direction): number {
  const angles = [
    (3 * Math.PI) / 4,
    Math.PI / 2,
    Math.PI / 4,
    0,
    -Math.PI / 4,
    -Math.PI / 2,
    (-3 * Math.PI) / 4,
    Math.PI,
  ];
  return angles[direction] ?? 0;
}

// ── Araña gigante ───────────────────────────────────────────────────

function drawSpider(c: VolumeCanvas, frame: CharacterFrame): void {
  const step = gait(frame, 1.6);
  const chitin = ramp([58, 42, 40]);
  const shell: Material = (s) =>
    tone(chitin, s.light, noise(Math.floor(s.p[0]), Math.floor(s.p[2])) > 0.8 ? 1 : 0);
  const bob = step.lift * 0.6;
  // Ocho patas en dos filas, articuladas: suben, se doblan y bajan al suelo.
  for (let i = 0; i < 4; i++) {
    for (const side of [1, -1] as const) {
      const swing = (i % 2 === 0) === (side === 1) ? step.pairA : step.pairB;
      const root: Vec3 = [side * 2.2, 5 + bob, 2.6 - i * 1.6];
      const knee: Vec3 = [side * 7, 9 + bob, 3.5 - i * 2.4 + swing * 0.4];
      const foot: Vec3 = [side * 10, 0.5, 4 - i * 3 + swing];
      c.limb(root, knee, 0.9, 0.7, shell);
      c.limb(knee, foot, 0.7, 0.35, shell);
    }
  }
  // Abdomen grande con la marca roja, y cefalotórax adelante.
  c.ellipsoid([0, 6 + bob, -4.5], axesAlong([0, 0.25, 1]), [5.2, 4.6, 6.2], (s) => {
    const local = sub(s.p, [0, 6 + bob, -4.5]);
    if (s.n[1] > 0.5 && Math.abs(local[0]) < 1.2 && Math.abs(local[2] + 1) < 2.6)
      return tone(ramp([190, 40, 36]), s.light);
    return shell(s);
  });
  const head: Vec3 = add([0, 5 + bob, 3], biteOffset(frame, 1.6));
  c.ellipsoid(head, axesAlong([0, 0, 1]), [3, 2.4, 3.2], shell);
  // Colmillos y ojos rojos.
  for (const side of [1, -1] as const) {
    c.limb(
      add(head, [side * 0.9, -0.8, 2.6]),
      add(head, [side * 0.6, -2.6, 3.4]),
      0.5,
      0.2,
      solid(ramp([210, 200, 180])),
    );
    c.decal(add(head, [side * 1, 0.8, 2.9]), normalize([side * 0.3, 0.3, 1]), [230, 40, 40]);
    c.decal(add(head, [side * 0.5, 1.4, 2.7]), normalize([side * 0.2, 0.6, 1]), [230, 40, 40]);
  }
}

// ── Orco y troll ────────────────────────────────────────────────────

/** Cuerpo musculoso con la piel del color dado; `bulk` lo hace más grande. */
function brute(c: VolumeCanvas, rig: Rig, skin: Ramp, bulk: number, hunched: boolean): Material {
  const flesh: Material = (s) => tone(skin, s.light, noise(s.x, s.y) > 0.85 ? -1 : 0);
  for (const side of [1, -1] as const) {
    const leg = rig.legs[side];
    c.limb(leg.hip, leg.knee, 3.6 * bulk, 3 * bulk, flesh);
    c.limb(leg.knee, leg.ankle, 3 * bulk, 2.4 * bulk, flesh);
    c.ellipsoid(
      lerp(leg.ankle, leg.toe, 0.5),
      axesAlong(sub(leg.toe, leg.ankle)),
      [2.6 * bulk, 1.8, 3.6 * bulk],
      flesh,
    );
  }
  const chest = rig.chest;
  c.ellipsoid(rig.pelvis.at([0, 0.5, 0]), rig.pelvis.axes, [5.6 * bulk, 4 * bulk, 4 * bulk], flesh);
  c.ellipsoid(
    chest.at([0, 0.5, hunched ? 1.5 : 0]),
    chest.axes,
    [7 * bulk, 7 * bulk, 4.8 * bulk],
    flesh,
  );
  // Joroba de los hombros.
  c.ellipsoid(
    chest.at([0, 4.5, hunched ? -1 : 0]),
    chest.axes,
    [7.6 * bulk, 3.4 * bulk, 4.6 * bulk],
    flesh,
  );
  for (const side of [1, -1] as const) {
    const arm = rig.arms[side];
    // Brazos largos (el troll casi arrastra los nudillos).
    const hand = hunched ? add(arm.hand, [0, -3, 0]) : arm.hand;
    const elbow = hunched ? add(arm.elbow, [0, -1.5, 0]) : arm.elbow;
    c.limb(arm.shoulder, elbow, 3.2 * bulk, 2.7 * bulk, flesh);
    c.limb(elbow, hand, 2.7 * bulk, 2.4 * bulk, flesh);
    c.sphere(hand, 2.5 * bulk, flesh);
  }
  return flesh;
}

/** Cabeza de bruto: frente baja, mandíbula grande, colmillos y ojos chicos. */
function bruteHead(c: VolumeCanvas, rig: Rig, flesh: Material, size: number, eyes: Rgb): void {
  const head = rig.head;
  c.limb(rig.neck, head.at([0, -2.5, 0.6]), 2.6 * size, 2.4 * size, flesh);
  c.ellipsoid(head.at([0, 0, 0.3]), head.axes, [4 * size, 4.4 * size, 4.2 * size], flesh);
  c.ellipsoid(head.at([0, -2.6, 1.8]), head.axes, [3.4 * size, 2 * size, 2.8 * size], flesh);
  c.ellipsoid(head.at([0, 1.6, 3]), head.axes, [3.4 * size, 0.9 * size, 1.2 * size], flesh);
  for (const side of [1, -1] as const) {
    c.limb(
      head.at([side * 1.6 * size, -2.6 * size, 3.6 * size]),
      head.at([side * 1.9 * size, -0.6 * size, 4.4 * size]),
      0.5 * size,
      0.25 * size,
      solid(ramp([232, 224, 200])),
    );
    c.decal(
      head.at([side * 1.5 * size, 0.6 * size, 4 * size]),
      head.dir([side * 0.3, 0, 1]),
      eyes,
      1,
      1,
    );
    // Orejas puntiagudas.
    c.limb(
      head.at([side * 3.8 * size, 0.5, 0]),
      head.at([side * 6 * size, 2.2, -1]),
      0.9 * size,
      0.2,
      flesh,
    );
  }
}

function drawOrc(c: VolumeCanvas, rig: Rig): void {
  const skin = ramp([92, 128, 62]);
  const flesh = brute(c, rig, skin, 1, false);
  const leather = ramp([96, 64, 40]);
  // Chaleco de cuero con correas, taparrabos y muñequeras.
  const chest = rig.chest;
  c.ellipsoid(chest.at([0, 0.2, 0.2]), chest.axes, [7.3, 6.4, 5.1], (s) => {
    const local = chest.local(s.p);
    if (Math.abs(local[0] + local[1] * 0.6) < 0.8) return tone(ramp([60, 44, 30]), s.light);
    return tone(leather, s.light, noise(s.x, s.y) > 0.82 ? -1 : 0);
  });
  c.ellipsoid(rig.pelvis.at([0, -2.5, 0]), rig.pelvis.axes, [5.9, 3.4, 4.3], solid(leather, -1));
  for (const side of [1, -1] as const)
    c.limb(
      rig.arms[side].elbow,
      lerp(rig.arms[side].elbow, rig.arms[side].hand, 0.6),
      2.9,
      2.6,
      solid(leather),
    );
  bruteHead(c, rig, flesh, 1, [240, 200, 60]);
  // Garrote de madera con clavos.
  const { hand, weaponDir } = rig.arms[1];
  const tip = add(hand, scale(weaponDir, 12));
  c.limb(add(hand, scale(weaponDir, -2)), tip, 0.9, 1.9, solid(ramp([110, 76, 44])));
  for (const k of [0.7, 0.85, 1]) c.sphere(lerp(hand, tip, k), 0.5, metal(ramp([120, 120, 128])));
}

function drawTroll(c: VolumeCanvas, rig: Rig): void {
  const skin = ramp([110, 124, 104]);
  const flesh = brute(c, rig, skin, 1.2, true);
  c.ellipsoid(
    rig.pelvis.at([0, -2.5, 0]),
    rig.pelvis.axes,
    [6.8, 3.6, 5],
    solid(ramp([80, 66, 52]), -1),
  );
  bruteHead(c, rig, flesh, 1.1, [255, 120, 40]);
}

// ── Hombre lagarto ──────────────────────────────────────────────────

/**
 * Hombre lagarto (de los pantanos, como en UO): escamas verdes con el
 * vientre claro, cabeza de reptil con hocico largo y cresta, cola gruesa
 * que arrastra, taparrabos de cuero y una lanza con punta de hueso.
 */
function drawLizardman(c: VolumeCanvas, rig: Rig): void {
  const green = ramp([84, 120, 64]);
  const scales: Material = (s) => {
    const scute = noise(
      Math.floor(s.p[0] * 1.3),
      Math.floor(s.p[1] * 1.3),
      Math.floor(s.p[2] * 1.3),
    );
    return tone(green, s.light, scute > 0.78 ? -1 : scute < 0.12 ? 1 : 0);
  };
  const flesh = brute(c, rig, green, 0.85, true);
  // Vientre claro.
  c.ellipsoid(
    rig.chest.at([0, -0.6, 2.8]),
    rig.chest.axes,
    [4.2, 5.2, 2.2],
    solid(ramp([200, 196, 140])),
  );
  // Cola gruesa que baja desde la cadera hasta el piso.
  const base = rig.pelvis.at([0, -1, -3.2]);
  const mid = rig.pelvis.at([0, -7, -9]);
  const end = add(mid, [0, -mid[1] + 1, 0]);
  c.limb(base, mid, 3.2, 2.2, scales);
  c.limb(mid, add(end, scale(sub(mid, base), 0.6)), 2.2, 0.6, scales);
  c.ellipsoid(
    rig.pelvis.at([0, -2.5, 0]),
    rig.pelvis.axes,
    [5, 3, 3.8],
    solid(ramp([96, 66, 40]), -1),
  );
  // Cabeza de reptil.
  const head = rig.head;
  c.limb(rig.neck, head.at([0, -2, 0.4]), 2.2, 2, flesh);
  c.ellipsoid(head.at([0, 0.4, 0]), head.axes, [3, 3, 3.4], scales);
  c.ellipsoid(head.at([0, -0.8, 4]), head.axes, [2.1, 1.6, 3.6], scales);
  c.ellipsoid(head.at([0, -2, 3.4]), head.axes, [1.8, 0.8, 3.2], scales);
  // Cresta.
  for (let i = 0; i < 4; i++)
    c.limb(
      head.at([0, 2.4 - i * 0.4, 1 - i * 1.6]),
      head.at([0, 4 - i * 0.5, -0.4 - i * 1.6]),
      0.6,
      0.15,
      solid(ramp([170, 60, 40])),
    );
  for (const side of [1, -1] as const)
    c.decal(head.at([side * 1.6, 1, 2.2]), head.dir([side * 0.5, 0.2, 1]), [230, 200, 40], 1, 1);
  // Lanza con punta de hueso.
  const { hand, weaponDir } = rig.arms[1];
  const tip = add(hand, scale(weaponDir, 20));
  c.limb(add(hand, scale(weaponDir, -6)), tip, 0.55, 0.55, solid(ramp([120, 86, 52])));
  c.limb(tip, add(tip, scale(weaponDir, 3.4)), 0.9, 0.1, solid(ramp([226, 216, 190])));
}

// ── Mago esquelético y liche ────────────────────────────────────────

const BONE = ramp([222, 214, 192]);

/** Túnica hasta el suelo con capucha; deja ver manos de hueso. */
function robe(c: VolumeCanvas, rig: Rig, cloth: Ramp, trim: Ramp | null): void {
  const fabric: Material = (s) => {
    if (trim && s.p[1] < 4) return tone(trim, s.light);
    return tone(cloth, s.light, Math.sin(s.p[0] * 0.9) > 0.6 ? -1 : 0);
  };
  const top = rig.pelvis.origin[1] + 2;
  for (let y = top; y >= 2; y -= 1) {
    const t = (top - y) / Math.max(1, top - 2);
    c.ellipsoid(
      [rig.pelvis.origin[0], y, rig.pelvis.origin[2] - 0.3 * t],
      rig.pelvis.axes,
      [5.4 + t * 3, 1.4, 4.2 + t * 2.4],
      fabric,
    );
  }
  const chest = rig.chest;
  c.ellipsoid(chest.at([0, 0.5, 0]), chest.axes, [5.8, 7, 3.8], fabric);
  for (const side of [1, -1] as const) {
    const arm = rig.arms[side];
    c.limb(arm.shoulder, arm.elbow, 2.6, 2.4, fabric);
    c.limb(arm.elbow, arm.hand, 2.4, 2.8, fabric);
    c.sphere(add(arm.hand, scale(arm.weaponDir, 1)), 1.3, solid(BONE));
  }
}

/** Capucha alrededor de la calavera. */
function hood(c: VolumeCanvas, rig: Rig, cloth: Ramp): void {
  const head = rig.head;
  c.ellipsoid(
    head.at([0, 1.2, -1]),
    head.axes,
    [5.4, 6, 5.6],
    clipping((s) => {
      const local = head.local(s.p);
      return local[2] > 2.4 && local[1] < 3 ? null : tone(cloth, s.light, -1);
    }),
  );
}

/** Bastón con una gema que brilla en la punta. */
function staff(c: VolumeCanvas, rig: Rig, gem: Ramp): void {
  const { hand } = rig.arms[1];
  c.limb(add(hand, [0, -14, 0]), add(hand, [0, 10, 0]), 0.7, 0.7, solid(ramp([90, 64, 44])));
  c.sphere(add(hand, [0, 11.5, 0]), 2, (s) => tone(gem, 0.6 + s.light * 0.4));
}

function drawSkeletonMage(c: VolumeCanvas, rig: Rig): void {
  const cloth = ramp([70, 60, 90]);
  robe(c, rig, cloth, null);
  c.limb(rig.neck, rig.head.at([0, -3, 0]), 1.1, 1, solid(BONE));
  drawSkullHead(c, rig.head, BONE);
  hood(c, rig, cloth);
  staff(c, rig, ramp([240, 120, 50]));
}

function drawLich(c: VolumeCanvas, rig: Rig): void {
  const cloth = ramp([54, 30, 74]);
  const gold = ramp([212, 170, 64]);
  robe(c, rig, cloth, gold);
  c.limb(rig.neck, rig.head.at([0, -3, 0]), 1.2, 1.1, solid(BONE));
  drawSkullHead(c, rig.head, BONE);
  // Ojos que brillan y corona de oro.
  for (const side of [1, -1] as const)
    c.decal(
      rig.head.at([side * 1.6, -0.2, 4.2]),
      rig.head.dir([side * 0.3, 0, 1]),
      [120, 220, 255],
      2,
      1,
    );
  const head = rig.head;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    c.limb(
      head.at([Math.cos(a) * 4.2, 4.2, Math.sin(a) * 4.2]),
      head.at([Math.cos(a) * 4.4, 7.2, Math.sin(a) * 4.4]),
      0.7,
      0.3,
      metal(gold),
    );
  }
  c.ellipsoid(head.at([0, 4.4, 0]), head.axes, [4.6, 0.8, 4.6], metal(gold));
  // Hombreras con púas.
  for (const side of [1, -1] as const)
    c.ellipsoid(
      add(rig.arms[side].shoulder, [side * 0.6, 1, 0]),
      rig.chest.axes,
      [3, 2, 3],
      solid(ramp([40, 30, 50]), 1),
    );
  staff(c, rig, ramp([120, 220, 255]));
}

// ── No-muertos del cementerio ───────────────────────────────────────

/**
 * Zombi: carne gris verdosa con manchas, ropa hecha jirones, los brazos
 * estirados hacia adelante, la cabeza ladeada, los ojos hundidos y blancos.
 */
function drawZombie(c: VolumeCanvas, rig: Rig): void {
  const rot = ramp([124, 140, 104]);
  const skin: Material = (s) => {
    const n = noise(Math.floor(s.p[0] * 0.8), Math.floor(s.p[1] * 0.8), Math.floor(s.p[2] * 0.8));
    return n > 0.8 ? tone(ramp([92, 70, 62]), s.light) : tone(rot, s.light, n < 0.15 ? -1 : 0);
  };
  const rags: Material = (s) =>
    tone(
      ramp([96, 84, 66]),
      s.light,
      noise(Math.floor(s.p[0]), Math.floor(s.p[1])) > 0.75 ? -1 : 0,
    );
  const pants = solid(ramp([62, 58, 64]));
  for (const side of [1, -1] as const) {
    const leg = rig.legs[side];
    c.limb(leg.hip, leg.knee, 2.5, 2.1, pants);
    c.limb(leg.knee, leg.ankle, 1.8, 1.5, side === 1 ? skin : pants);
    c.ellipsoid(
      lerp(leg.ankle, leg.toe, 0.5),
      axesAlong(sub(leg.toe, leg.ankle)),
      [1.6, 1.1, 2.8],
      skin,
    );
  }
  const chest = rig.chest;
  c.ellipsoid(rig.pelvis.at([0, 0.5, 0]), rig.pelvis.axes, [4.6, 3.2, 3.2], pants);
  c.ellipsoid(chest.at([0, 0.5, 0.6]), chest.axes, [5.4, 6.4, 3.6], skin);
  // Camisa rota: cubre la mitad del pecho y cuelga en tiras.
  c.ellipsoid(
    chest.at([0, 0, 0.4]),
    chest.axes,
    [5.7, 6.2, 3.9],
    clipping((sample) => {
      const local = chest.local(sample.p);
      if (local[0] > 1.5 && local[1] > -2) return null;
      if (local[1] < -4 && Math.sin(local[0] * 2.4) > 0.2) return null;
      return rags(sample);
    }),
  );
  // Brazos estirados hacia adelante, con las manos colgando.
  for (const side of [1, -1] as const) {
    const shoulder = rig.arms[side].shoulder;
    const elbow = chest.at([side * 5.2, 1.6, 6.4]);
    const hand = chest.at([side * 4.6, 0.6 + side * 0.8, 12.4]);
    c.limb(shoulder, elbow, 1.9, 1.6, side === -1 ? rags : skin);
    c.limb(elbow, hand, 1.6, 1.3, skin);
    c.ellipsoid(add(hand, chest.dir([0, -0.8, 0.8])), chest.axes, [1.3, 1.6, 1.4], skin);
  }
  // Cabeza ladeada, pelo ralo y ojos blancos hundidos.
  const head = rig.head;
  c.limb(rig.neck, head.at([0.5, -2.5, 0.4]), 1.5, 1.4, skin);
  const tilt = head.at([0.8, 0, 0.2]);
  c.ellipsoid(tilt, axesAlong(head.dir([0, 0, 1]), head.dir([0.25, 1, 0])), [3.5, 4.2, 3.8], skin);
  c.ellipsoid(add(tilt, head.dir([0, -2.4, 1.6])), head.axes, [2.4, 1.4, 2], skin);
  for (const side of [1, -1] as const) {
    c.decal(
      add(tilt, head.dir([side * 1.4, 0.6, 3.5])),
      head.dir([side * 0.3, 0, 1]),
      [36, 30, 28],
      2,
      1,
    );
    c.decal(
      add(tilt, head.dir([side * 1.4, 0.6, 3.7])),
      head.dir([side * 0.3, 0, 1]),
      [236, 236, 210],
      1,
      1,
    );
  }
  c.decal(add(tilt, head.dir([0, -2.2, 3.4])), head.dir([0, -0.3, 1]), [40, 20, 20], 2, 1);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1;
    const root = add(tilt, head.dir([Math.cos(a) * 2.4, 3.6, Math.sin(a) * 2.4 - 0.6]));
    c.limb(
      root,
      add(root, head.dir([Math.cos(a) * 1.2, -1.6, -1])),
      0.5,
      0.2,
      solid(ramp([50, 44, 40])),
    );
  }
}

/**
 * Necrófago: encorvado y flaco, piel gris violácea pegada a las costillas,
 * garras largas, cabeza calva alargada con orejas puntudas, boca ancha con
 * dientes y ojos amarillos que brillan.
 */
function drawGhoul(c: VolumeCanvas, rig: Rig): void {
  const grey = ramp([130, 118, 132]);
  const flesh = brute(c, rig, grey, 0.72, true);
  const chest = rig.chest;
  // Costillas marcadas.
  for (let i = 0; i < 4; i++)
    c.ellipsoid(
      chest.at([0, 2 - i * 1.8, 3.2]),
      chest.axes,
      [4.2 - i * 0.3, 0.45, 0.8],
      solid(grey, 1),
    );
  // Taparrabos de trapo.
  c.ellipsoid(
    rig.pelvis.at([0, -2.4, 0]),
    rig.pelvis.axes,
    [4.4, 2.6, 3.4],
    solid(ramp([70, 62, 54])),
  );
  // Garras.
  const claw = solid(ramp([226, 216, 190]));
  for (const side of [1, -1] as const) {
    const hand = add(rig.arms[side].hand, [0, -3, 0]);
    for (const k of [-1, 0, 1])
      c.limb(
        add(hand, chest.dir([k * 0.9, -0.6, 1])),
        add(hand, chest.dir([k * 1.1, -2.4, 3.6])),
        0.45,
        0.1,
        claw,
      );
  }
  // Cabeza calva y alargada, hacia adelante.
  const head = rig.head;
  const skull = head.at([0, -0.6, 1.6]);
  c.limb(rig.neck, skull, 1.8, 1.6, flesh);
  c.ellipsoid(skull, axesAlong(head.dir([0, 0.35, 1])), [3.4, 3.6, 4.6], flesh);
  c.ellipsoid(add(skull, head.dir([0, -2.6, 2.6])), head.axes, [2.8, 1.6, 2.4], flesh);
  // Boca ancha con dientes.
  c.decal(add(skull, head.dir([0, -2.6, 4.9])), head.dir([0, -0.2, 1]), [40, 16, 18], 3, 1);
  for (const k of [-1.2, -0.4, 0.4, 1.2])
    c.limb(
      add(skull, head.dir([k, -2.2, 4.6])),
      add(skull, head.dir([k, -3, 4.8])),
      0.35,
      0.1,
      claw,
    );
  for (const side of [1, -1] as const) {
    c.decal(
      add(skull, head.dir([side * 1.5, 0.6, 4.5])),
      head.dir([side * 0.3, 0, 1]),
      [255, 210, 60],
      1,
      1,
    );
    c.limb(
      add(skull, head.dir([side * 3, 1, -0.5])),
      add(skull, head.dir([side * 5.6, 3.4, -2])),
      1,
      0.15,
      flesh,
    );
  }
}

/**
 * Espectro: una túnica negra azulada hecha jirones que flota sin pies, con
 * una capucha vacía donde solo brillan dos ojos celestes, y manos huesudas
 * de dedos largos. Sube y baja despacio.
 */
function drawWraith(c: VolumeCanvas, rig: Rig, frame: CharacterFrame): void {
  const step = gait(frame, 1);
  const float = 3 + step.lift * 0.6;
  const up = (p: Vec3): Vec3 => add(p, [0, float, 0]);
  const cloth = ramp([52, 58, 82]);
  const fabric: Material = (s) =>
    tone(cloth, s.light, Math.sin(s.p[0] * 1.1 + s.p[2]) > 0.65 ? -1 : 0);
  // Túnica: se ensancha hacia abajo y termina en jirones que no tocan el suelo.
  const top = rig.pelvis.origin[1] + 2;
  for (let y = top; y >= 4; y -= 1) {
    const t = (top - y) / Math.max(1, top - 4);
    c.ellipsoid(
      up([rig.pelvis.origin[0], y, rig.pelvis.origin[2] - 1.2 * t]),
      rig.pelvis.axes,
      [5 + t * 3.4, 1.4, 4 + t * 2.8],
      fabric,
    );
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const root = up([
      rig.pelvis.origin[0] + Math.cos(a) * 7,
      5,
      rig.pelvis.origin[2] + Math.sin(a) * 5.6 - 1.2,
    ]);
    c.limb(
      root,
      add(root, [Math.cos(a) * 1.2, -3 - (i % 3), Math.sin(a) * 1.2 - 1]),
      1.6,
      0.2,
      fabric,
    );
  }
  const chest = rig.chest;
  c.ellipsoid(up(chest.at([0, 0.5, 0])), chest.axes, [5.6, 7, 3.8], fabric);
  // Brazos con mangas anchas y manos de hueso con dedos largos.
  const bone = solid(ramp([206, 204, 196]));
  for (const side of [1, -1] as const) {
    const arm = rig.arms[side];
    c.limb(up(arm.shoulder), up(arm.elbow), 2.4, 2.8, fabric);
    c.limb(up(arm.elbow), up(arm.hand), 2.8, 3.6, fabric);
    const hand = up(add(arm.hand, scale(arm.weaponDir, 1.6)));
    for (const k of [-1, 0, 1])
      c.limb(
        hand,
        add(hand, add(scale(arm.weaponDir, 3), chest.dir([k * 0.8, -1, 0]))),
        0.4,
        0.15,
        bone,
      );
  }
  // Capucha vacía: oscuridad adentro y dos ojos que brillan.
  const head = rig.head;
  c.ellipsoid(up(head.at([0, 0.6, -0.8])), head.axes, [5, 5.8, 5.4], solid(cloth, -1));
  c.ellipsoid(up(head.at([0, 0, 1.6])), head.axes, [3.4, 4, 3.4], solid(ramp([10, 10, 16])));
  c.limb(up(head.at([0, 4, -3])), up(head.at([0, 1, -7])), 2.4, 0.3, solid(cloth, -1));
  for (const side of [1, -1] as const)
    c.decal(up(head.at([side * 1.3, 0.4, 4.9])), head.dir([0, 0, 1]), [150, 230, 255], 1, 1);
}

// ── Dragón ──────────────────────────────────────────────────────────

function drawDragon(c: VolumeCanvas, frame: CharacterFrame): void {
  const step = gait(frame, 5);
  const red = ramp([168, 40, 34]);
  const belly = ramp([222, 170, 96]);
  const scales: Material = (s) => {
    if (s.n[1] < -0.3) return tone(belly, s.light, Math.floor(s.p[2] / 2) % 2 === 0 ? 0 : -1);
    return tone(
      red,
      s.light,
      noise(Math.floor(s.p[0] / 1.5), Math.floor(s.p[1] / 1.5), Math.floor(s.p[2] / 1.5)) > 0.8
        ? 1
        : 0,
    );
  };
  const bob = step.lift;
  // Alas: membranas grandes que se abren hacia arriba y atrás.
  // Muerto, caen abiertas hasta el suelo.
  const dead = frame === 'dead';
  const flap = typeof frame === 'string' && frame.endsWith('-1') ? 6 : step.lift > 0.5 ? 3 : 0;
  for (const side of [1, -1] as const) {
    const root: Vec3 = [side * 5, 30 + bob, 2];
    const elbow: Vec3 = dead ? [side * 22, 27, -4] : [side * 22, 46 + bob + flap, -6];
    const tip: Vec3 = dead ? [side * 40, 14, -14] : [side * 40, 40 + bob + flap * 1.5, -18];
    c.limb(root, elbow, 1.8, 1.3, scales);
    c.limb(elbow, tip, 1.3, 0.5, scales);
    const membrane = ramp([120, 44, 50]);
    const wing: Material = (s) =>
      tone(membrane, s.light * 0.85, Math.sin(s.p[0] * 0.4) > 0.9 ? -1 : 0);
    c.polygon([root, elbow, tip, [side * 30, 22 + bob, -20], [side * 12, 20 + bob, -12]], wing);
  }
  // Patas: gruesas, con garras.
  for (const [side, z, swing] of [
    [1, 10, step.pairA],
    [-1, 10, step.pairB],
    [1, -12, step.pairB],
    [-1, -12, step.pairA],
  ] as const) {
    const top: Vec3 = [side * 7, 20 + bob, z];
    const knee: Vec3 = [side * 8, 10, z + swing * 0.5 + 2];
    const foot: Vec3 = [side * 8, 2, z + swing];
    c.limb(top, knee, 4.2, 3.2, scales);
    c.limb(knee, foot, 3.2, 2.6, scales);
    c.ellipsoid(add(foot, [0, -0.5, 2]), axesAlong([0, 0, 1]), [3, 1.6, 4], scales);
    for (const k of [-1.5, 0, 1.5])
      c.limb(
        add(foot, [k, -1, 4.5]),
        add(foot, [k, -2, 6.5]),
        0.6,
        0.2,
        solid(ramp([230, 220, 200])),
      );
  }
  // Cuerpo, cola y cuello largo.
  c.ellipsoid([0, 22 + bob, -1], axesAlong([0, 0.1, 1]), [12, 11, 19], scales);
  const tail: Vec3[] = [
    [0, 22 + bob, -17],
    [2, 18, -28],
    [-1, 12, -38],
    [-5, 8, -46],
  ];
  tail.slice(1).forEach((to, i) => {
    const from = tail[i] ?? to;
    c.limb(from, to, 6 - i * 1.7, 4.5 - i * 1.6, scales);
  });
  // Púas del lomo.
  for (let i = 0; i < 6; i++)
    c.limb(
      [0, 31 + bob - i * 0.6, 12 - i * 5],
      [0, 36 + bob - i * 0.8, 10 - i * 5],
      1.4,
      0.2,
      solid(ramp([70, 30, 30])),
    );
  const bite = biteOffset(frame, 5);
  // Cuello corto y grueso, en curva (muerto, estirado con la cabeza en el suelo).
  const neck: Vec3[] = dead
    ? [
        [0, 27, 14],
        [0, 23, 23],
        [0, 18, 30],
      ]
    : [[0, 27 + bob, 14], [0, 34 + bob, 21], add([0, 38 + bob, 26], scale(bite, 0.5))];
  neck.slice(1).forEach((to, i) => {
    const from = neck[i] ?? to;
    c.limb(from, to, 7.5 - i * 1.4, 6 - i * 1, scales);
  });
  const head: Vec3 = dead ? [0, 18, 36] : add([0, 40 + bob, 30], bite);
  c.ellipsoid(head, axesAlong([0, -0.15, 1]), [5.4, 5, 7], scales);
  c.ellipsoid(add(head, [0, -2.4, 7]), axesAlong([0, -0.2, 1]), [3.8, 2.8, 5], scales);
  for (const side of [1, -1] as const) {
    c.limb(
      add(head, [side * 2.4, 2.5, -2]),
      add(head, [side * 4.5, 7, -8]),
      1.2,
      0.3,
      solid(ramp([60, 40, 34])),
    );
    c.decal(
      add(head, [side * 2.6, 1.2, 2.5]),
      normalize([side * 0.7, 0.2, 0.7]),
      dead ? [60, 20, 18] : [255, 210, 60],
      2,
      1,
    );
  }
  // Fuego en la boca al atacar.
  if (bite[2] > 1)
    c.sphere(add(head, [0, -2.5, 11]), 2.5, (s) => tone(ramp([255, 170, 60]), 0.7 + s.light * 0.3));
}
