import { isMountKind, type CreatureKind, type Direction } from '@fenix/shared';
import { OUTLINE } from './character-art';
import { MOUNTED_ART_HEIGHT, MOUNTED_ART_WIDTH, MOUNTED_FEET_Y } from './mount-art';
import { biteOffset, gait } from './creature-motion';
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
import {
  Camera,
  VolumeCanvas,
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
  'giant-spider' | 'orc' | 'troll' | 'skeleton-mage' | 'lich' | 'dragon'
>;

export function isMonsterKind(kind: CreatureKind): kind is MonsterKind {
  return (
    kind === 'giant-spider' ||
    kind === 'orc' ||
    kind === 'troll' ||
    kind === 'skeleton-mage' ||
    kind === 'lich' ||
    kind === 'dragon'
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

/** Las monturas sueltas usan el lienzo de los jinetes. */
const MOUNT_LAYOUT: CreatureLayout = {
  width: MOUNTED_ART_WIDTH,
  height: MOUNTED_ART_HEIGHT,
  feetY: MOUNTED_FEET_Y,
  headY: MOUNTED_FEET_Y - 66,
};

export function creatureLayout(kind: CreatureKind): CreatureLayout {
  if (isMountKind(kind)) return MOUNT_LAYOUT;
  return kind === 'dragon' ? DRAGON_LAYOUT : COMMON;
}

const ZOOM: Readonly<Record<MonsterKind, number>> = {
  'giant-spider': 1.25,
  orc: 1.12,
  troll: 1.3,
  'skeleton-mage': 1.1,
  lich: 1.18,
  dragon: 1.35,
};

export function drawMonsterFrame(
  kind: MonsterKind,
  direction: Direction,
  frame: CharacterFrame,
): PixelImage {
  const layout = creatureLayout(kind);
  const camera = kind === 'dragon' ? dragonCamera(direction) : cameraFor(direction, ZOOM[kind]);
  const canvas = new VolumeCanvas(layout.width, layout.height, camera);
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
  }
  return canvas.toImage(OUTLINE);
}

/** Cámara del dragón: la misma vista que las demás, centrada en su lienzo más grande. */
function dragonCamera(direction: Direction): Camera {
  return new Camera(
    facingOf(direction),
    DRAGON_LAYOUT.width / 2,
    DRAGON_LAYOUT.feetY,
    undefined,
    ZOOM.dragon,
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
  c.ellipsoid(head.at([0, 1.2, -1]), head.axes, [5.4, 6, 5.6], (s) => {
    const local = head.local(s.p);
    return local[2] > 2.4 && local[1] < 3 ? null : tone(cloth, s.light, -1);
  });
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
  const flap =
    typeof frame === 'string' && frame.endsWith('-1')
      ? 6
      : typeof frame === 'number' && frame % 2 === 1
        ? 3
        : 0;
  for (const side of [1, -1] as const) {
    const root: Vec3 = [side * 5, 30 + bob, 2];
    const elbow: Vec3 = [side * 22, 46 + bob + flap, -6];
    const tip: Vec3 = [side * 40, 40 + bob + flap * 1.5, -18];
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
  // Cuello corto y grueso, en curva.
  const neck: Vec3[] = [
    [0, 27 + bob, 14],
    [0, 34 + bob, 21],
    add([0, 38 + bob, 26], scale(bite, 0.5)),
  ];
  neck.slice(1).forEach((to, i) => {
    const from = neck[i] ?? to;
    c.limb(from, to, 7.5 - i * 1.4, 6 - i * 1, scales);
  });
  const head: Vec3 = add([0, 40 + bob, 30], bite);
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
      [255, 210, 60],
      2,
      1,
    );
  }
  // Fuego en la boca al atacar.
  if (bite[2] > 1)
    c.sphere(add(head, [0, -2.5, 11]), 2.5, (s) => tone(ramp([255, 170, 60]), 0.7 + s.light * 0.3));
}
