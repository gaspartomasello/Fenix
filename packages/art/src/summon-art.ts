import type { CreatureKind, Direction } from '@fenix/shared';
import { OUTLINE } from './character-art';
import {
  CHARACTER_ART_HEIGHT,
  CHARACTER_ART_WIDTH,
  cameraFor,
  humanoidRig,
  type CharacterFrame,
  type Rig,
} from './humanoid-rig';
import type { PixelImage, Rgb } from './pixel-art';
import {
  VolumeCanvas,
  add,
  axesAlong,
  lerp,
  noise,
  ramp,
  solid,
  sub,
  tone,
  type Material,
  type Ramp,
  type Vec3,
} from './volume';

/** Criaturas que solo aparecen invocadas con hechizos del octavo círculo. */
export type SummonKind = Extract<
  CreatureKind,
  | 'energy-vortex'
  | 'air-elemental'
  | 'earth-elemental'
  | 'fire-elemental'
  | 'water-elemental'
  | 'daemon'
>;

export function isSummonKind(kind: CreatureKind): kind is SummonKind {
  return (
    kind === 'energy-vortex' ||
    kind === 'air-elemental' ||
    kind === 'earth-elemental' ||
    kind === 'fire-elemental' ||
    kind === 'water-elemental' ||
    kind === 'daemon'
  );
}

/** Tamaño de cada una respecto de una persona. */
const ZOOM: Readonly<Record<SummonKind, number>> = {
  'energy-vortex': 1.15,
  'air-elemental': 1.18,
  'earth-elemental': 1.25,
  'fire-elemental': 1.18,
  'water-elemental': 1.18,
  daemon: 1.24,
};

/** Fase de la animación (0–3), para que el fuego, el agua y el viento se muevan. */
function phaseOf(frame: CharacterFrame): number {
  if (typeof frame === 'number') return frame;
  if (frame === 'idle') return 0;
  return Number(frame.slice(-1)) || 0;
}

/** Material que brilla por sí mismo: nunca se oscurece del todo. */
function glowing(colors: Ramp, flicker = 0): Material {
  return (s) => tone(colors, 0.45 + s.light * 0.55, noise(s.x + flicker, s.y) > 0.75 ? 1 : 0);
}

export function drawSummonFrame(
  kind: SummonKind,
  direction: Direction,
  frame: CharacterFrame,
): PixelImage {
  const canvas = new VolumeCanvas(
    CHARACTER_ART_WIDTH,
    CHARACTER_ART_HEIGHT,
    cameraFor(direction, ZOOM[kind]),
  );
  const phase = phaseOf(frame);
  switch (kind) {
    case 'energy-vortex':
      drawVortex(canvas, phase);
      break;
    case 'daemon':
      drawDaemon(canvas, humanoidRig(frame, false));
      break;
    case 'earth-elemental':
      drawEarthElemental(canvas, humanoidRig(frame, false));
      break;
    case 'fire-elemental':
      drawSpirit(canvas, humanoidRig(frame, false), phase, {
        body: ramp([236, 120, 32]),
        core: ramp([255, 214, 90]),
        shape: 'flame',
      });
      break;
    case 'water-elemental':
      drawSpirit(canvas, humanoidRig(frame, false), phase, {
        body: ramp([52, 112, 196]),
        core: ramp([150, 206, 240]),
        shape: 'wave',
      });
      break;
    case 'air-elemental':
      drawSpirit(canvas, humanoidRig(frame, false), phase, {
        body: ramp([128, 146, 170]),
        core: ramp([214, 224, 238]),
        shape: 'whirl',
      });
      break;
  }
  return canvas.toImage(OUTLINE);
}

/** Vórtice: anillos de energía que giran, anchos arriba y finos abajo. */
function drawVortex(canvas: VolumeCanvas, phase: number): void {
  const energy = ramp([132, 92, 230]);
  const spark = ramp([210, 200, 255]);
  for (let i = 0; i < 12; i++) {
    const y = 4 + i * 4.6;
    const radius = 2 + i * 0.75;
    const sway = Math.sin(i * 0.9 + phase * 1.6) * (1 + i * 0.12);
    const center: Vec3 = [sway, y, Math.cos(i * 0.9 + phase * 1.6) * 0.8];
    const tilt = axesAlong([Math.sin(i + phase), 0.3, Math.cos(i + phase)]);
    canvas.ellipsoid(center, tilt, [radius, 1.6, radius * 0.85], (s) =>
      Math.sin(Math.atan2(s.p[2] - center[2], s.p[0] - center[0]) * 3 + phase * 2 + i) > 0.4
        ? tone(spark, 0.8 + s.light * 0.2)
        : glowing(energy)(s),
    );
  }
}

/** Demonio: piel roja, cuernos, alas de murciélago, cola y garras. */
function drawDaemon(canvas: VolumeCanvas, rig: Rig): void {
  const skin = ramp([150, 40, 34]);
  const dark = ramp([70, 22, 22]);
  const flesh: Material = (s) => tone(skin, s.light, noise(s.x, s.y) > 0.8 ? -1 : 0);
  const chest = rig.chest;

  // Alas: dos membranas desde los omóplatos, con nervaduras.
  for (const side of [1, -1] as const) {
    const root = chest.at([side * 2.5, 4, -3]);
    const tip = chest.at([side * 12.5, 13, -9]);
    const elbow = chest.at([side * 8, 10.5, -7]);
    canvas.limb(root, elbow, 1, 0.8, solid(dark));
    canvas.limb(elbow, tip, 0.8, 0.4, solid(dark));
    canvas.polygon(
      [root, elbow, tip, chest.at([side * 10.5, -2, -8]), chest.at([side * 6, -4, -5])],
      (s) => tone(ramp([110, 34, 40]), s.light * 0.8, Math.sin(s.p[1] * 1.2) > 0.85 ? -1 : 0),
    );
  }
  // Cola.
  canvas.limb(rig.pelvis.at([0, -1, -3]), rig.pelvis.at([1.5, -10, -9]), 1.3, 0.8, flesh);
  canvas.limb(rig.pelvis.at([1.5, -10, -9]), rig.pelvis.at([-1, -17, -11]), 0.8, 0.3, flesh);

  for (const side of [1, -1] as const) {
    const leg = rig.legs[side];
    canvas.limb(leg.hip, leg.knee, 3.6, 2.8, flesh);
    canvas.limb(leg.knee, leg.ankle, 2.8, 1.8, flesh);
    // Pezuña.
    canvas.ellipsoid(
      lerp(leg.ankle, leg.toe, 0.5),
      axesAlong(sub(leg.toe, leg.ankle)),
      [2, 1.6, 3],
      solid(dark),
    );
  }
  canvas.ellipsoid(rig.pelvis.origin, rig.pelvis.axes, [5.2, 4, 3.6], flesh);
  canvas.ellipsoid(chest.at([0, 0.5, 0]), chest.axes, [7.2, 7.4, 4.6], flesh);
  canvas.ellipsoid(chest.at([0, 3.4, 0.6]), chest.axes, [7.8, 3.6, 4.4], flesh);
  for (const side of [1, -1] as const) {
    const arm = rig.arms[side];
    canvas.limb(arm.shoulder, arm.elbow, 3.2, 2.5, flesh);
    canvas.limb(arm.elbow, arm.hand, 2.5, 2, flesh);
    canvas.sphere(arm.hand, 2.1, flesh);
    // Garras.
    for (const k of [-1, 0, 1])
      canvas.limb(
        arm.hand,
        add(arm.hand, add(scale3(arm.weaponDir, 2.6), [k * 0.8, 0, 0])),
        0.4,
        0.15,
        solid(ramp([230, 220, 200])),
      );
  }
  // Cabeza: cráneo alargado, mandíbula, cuernos curvos y ojos encendidos.
  const head = rig.head;
  canvas.limb(rig.neck, head.at([0, -2, 0.6]), 2.2, 2, flesh);
  canvas.ellipsoid(head.at([0, 0.5, 0.4]), head.axes, [4, 4.8, 4.4], flesh);
  canvas.ellipsoid(head.at([0, -3, 2]), head.axes, [2.8, 1.8, 2.6], flesh);
  for (const side of [1, -1] as const) {
    const base = head.at([side * 2.6, 3.4, 0]);
    const mid = head.at([side * 5, 6.4, -1.6]);
    canvas.limb(base, mid, 1.2, 0.8, solid(ramp([60, 50, 46])));
    canvas.limb(mid, head.at([side * 4.6, 9.4, -3.6]), 0.8, 0.2, solid(ramp([60, 50, 46])));
    canvas.decal(
      head.at([side * 1.7, 0.6, 4.2]),
      head.dir([side * 0.3, 0, 1]),
      [255, 220, 80],
      1,
      1,
    );
  }
}

/** Elemental de tierra: un gigante hecho de piedras sueltas y tierra. */
function drawEarthElemental(canvas: VolumeCanvas, rig: Rig): void {
  const rock = ramp([120, 104, 88]);
  const soil = ramp([92, 70, 50]);
  const stone =
    (seed: number): Material =>
    (s) =>
      noise(Math.floor(s.p[0] * 0.8) + seed, Math.floor(s.p[1] * 0.8)) > 0.7
        ? tone(soil, s.light)
        : tone(rock, s.light, noise(s.x, s.y + seed) > 0.85 ? 1 : 0);
  for (const side of [1, -1] as const) {
    const leg = rig.legs[side];
    canvas.limb(leg.hip, leg.knee, 4, 3.6, stone(1));
    canvas.limb(leg.knee, leg.ankle, 3.6, 3.4, stone(2));
    canvas.ellipsoid(leg.ankle, axesAlong(sub(leg.toe, leg.ankle)), [3.4, 2.4, 4], stone(3));
  }
  const chest = rig.chest;
  canvas.ellipsoid(rig.pelvis.origin, rig.pelvis.axes, [6, 4.4, 4.4], stone(4));
  canvas.ellipsoid(chest.at([0, 0.5, 0]), chest.axes, [8, 8, 5.4], stone(5));
  // Rocas sueltas sobre los hombros y la espalda.
  for (const [x, y, z, r] of [
    [-5, 6, -1, 3.2],
    [5, 6.5, -1, 3.4],
    [0, 7.5, -2.5, 3],
    [-2, 2, 4, 2.4],
  ] as const)
    canvas.sphere(chest.at([x, y, z]), r, stone(6 + x));
  for (const side of [1, -1] as const) {
    const arm = rig.arms[side];
    canvas.limb(arm.shoulder, arm.elbow, 3.6, 3.2, stone(7));
    canvas.limb(arm.elbow, arm.hand, 3.2, 3.4, stone(8));
    canvas.sphere(arm.hand, 3.4, stone(9));
  }
  // Cabeza chica y hundida, con dos brasas por ojos.
  const head = rig.head;
  canvas.ellipsoid(head.at([0, -1.5, 0.4]), head.axes, [3.4, 3, 3.4], stone(10));
  for (const side of [1, -1] as const)
    canvas.decal(head.at([side * 1.3, -1.2, 3.6]), head.dir([0, 0, 1]), [255, 180, 60], 1, 1);
}

interface SpiritLook {
  readonly body: Ramp;
  readonly core: Ramp;
  /** Fuego (llamas que suben), agua (ola) o aire (remolino). */
  readonly shape: 'flame' | 'wave' | 'whirl';
}

/**
 * Elementales de fuego, agua y aire: torso, brazos y cabeza con forma de
 * persona, y de la cintura para abajo una columna que se mueve.
 */
function drawSpirit(canvas: VolumeCanvas, rig: Rig, phase: number, look: SpiritLook): void {
  const { body, core, shape } = look;
  const material: Material = (s) => {
    const ripple = Math.sin(s.p[1] * 0.9 + phase * 1.5 + s.p[0] * 0.4);
    if (shape === 'whirl')
      return tone(
        Math.sin(Math.atan2(s.p[2], s.p[0]) * 3 + s.p[1] * 0.6 + phase) > 0.3 ? core : body,
        0.5 + s.light * 0.5,
      );
    if (ripple > 0.65) return tone(core, 0.7 + s.light * 0.3);
    return glowing(body, phase)(s);
  };
  // Columna: de la cintura al suelo; el fuego se afina hacia arriba, el agua se ensancha abajo.
  const top = rig.pelvis.origin;
  const rows = 9;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const y = top[1] - t * (top[1] - 2);
    const wobble = Math.sin(t * 5 + phase * 1.7) * (shape === 'whirl' ? 2 : 1);
    const width = shape === 'wave' ? 4.6 + t * 3 : shape === 'flame' ? 5 - t * 1.8 : 5 - t * 3.2;
    canvas.ellipsoid(
      [top[0] + wobble, y, top[2]],
      rig.pelvis.axes,
      [width, 2.2, width * 0.8],
      material,
    );
  }
  const chest = rig.chest;
  canvas.ellipsoid(chest.at([0, 0, 0]), chest.axes, [6.4, 7.2, 4.2], material);
  for (const side of [1, -1] as const) {
    const arm = rig.arms[side];
    canvas.limb(arm.shoulder, arm.elbow, 2.6, 2.1, material);
    canvas.limb(arm.elbow, arm.hand, 2.1, 1.6, material);
    canvas.sphere(arm.hand, 1.9, material);
  }
  const head = rig.head;
  canvas.ellipsoid(head.at([0, 0, 0.3]), head.axes, [3.8, 4.4, 3.8], material);
  if (shape === 'flame') {
    // Llamas que suben de la cabeza y los hombros.
    for (const [x, h] of [
      [0, 9],
      [-2.4, 6],
      [2.4, 6.5],
    ] as const)
      canvas.limb(
        head.at([x, 2.5, 0]),
        head.at([x * 1.3 + Math.sin(phase + x) * 1.2, 2.5 + h, -1]),
        1.6,
        0.2,
        solid(core, 1),
      );
  }
  for (const side of [1, -1] as const)
    canvas.decal(
      head.at([side * 1.4, 0.4, 3.7]),
      head.dir([0, 0, 1]),
      shape === 'flame' ? [255, 255, 210] : ([20, 30, 60] as Rgb),
      1,
      1,
    );
}

function scale3(v: Vec3, k: number): Vec3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}
