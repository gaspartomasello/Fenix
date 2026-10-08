import { Direction, type ItemKind } from '@fenix/shared';
import { Camera, add, normalize, pitch, scale, sub, yaw, type Vec3 } from './volume';

/**
 * Tamaño del sprite en pixeles. Se dibuja al doble de detalle que el resto
 * del arte y se muestra sin escalar, así ocupa lo mismo en pantalla.
 */
export const CHARACTER_ART_WIDTH = 44;
export const CHARACTER_ART_HEIGHT = 78;
/** Fila donde apoyan los pies: el ancla del sprite sobre el tile. */
export const CHARACTER_FEET_Y = 74;
/** Fila aproximada de la coronilla de una persona: sobre ella van el nombre y la vida. */
export const CHARACTER_HEAD_Y = 12;
/** Escala de las personas respecto del modelo (las criaturas usan la suya). */
const HUMAN_ZOOM = 1.12;

/**
 * Acciones animadas, cada una en pasos: correr, golpe en arco (espada, hacha),
 * estocada (daga), puñetazo, lanzar un hechizo, y dos gestos de reposo:
 * girar los hombros y cambiar el peso de pierna.
 */
export const ACTION_KINDS = ['run', 'slash', 'thrust', 'punch', 'cast', 'shrug', 'stance'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
export type ActionStep = 0 | 1 | 2 | 3;

/** `idle` = parado; 0..3 = caminata (contacto, paso, contacto, paso); o un paso de una acción. */
export type CharacterFrame = 'idle' | 0 | 1 | 2 | 3 | `${ActionKind}-${ActionStep}`;
export const WALK_FRAMES: readonly CharacterFrame[] = [0, 1, 2, 3];

/** Con qué gesto ataca según lo que tenga en la mano derecha. */
export function attackStyleFor(weapon: ItemKind | undefined): 'slash' | 'thrust' | 'punch' {
  if (!weapon) return 'punch';
  return weapon === 'dagger' ? 'thrust' : 'slash';
}

/**
 * Hacia dónde mira cada dirección de UO en la pantalla isométrica: 0 es de
 * frente a la cámara, π/2 a la derecha y π de espaldas.
 */
const FACING: Readonly<Record<Direction, number>> = {
  [Direction.North]: (3 * Math.PI) / 4, // arriba-derecha
  [Direction.NorthEast]: Math.PI / 2, // derecha
  [Direction.East]: Math.PI / 4, // abajo-derecha
  [Direction.SouthEast]: 0, // abajo
  [Direction.South]: -Math.PI / 4, // abajo-izquierda
  [Direction.SouthWest]: -Math.PI / 2, // izquierda
  [Direction.West]: (-3 * Math.PI) / 4, // arriba-izquierda
  [Direction.NorthWest]: Math.PI, // arriba
};

/** Cámara para un sprite que mira en `direction`. */
export function cameraFor(direction: Direction, zoom = HUMAN_ZOOM): Camera {
  return new Camera(FACING[direction], CHARACTER_ART_WIDTH / 2, CHARACTER_FEET_Y, undefined, zoom);
}

/**
 * Sistema de referencia de una parte del cuerpo (torso, cabeza): un origen y
 * un giro sobre el eje vertical (y una inclinación hacia adelante). Sirve
 * para ubicar detalles relativos a esa
 * parte aunque el personaje gire los hombros.
 */
export class Basis {
  constructor(
    readonly origin: Vec3,
    readonly turn: number,
    readonly bow = 0,
  ) {}

  /** Punto relativo a la parte → modelo. */
  at(offset: Vec3): Vec3 {
    return add(this.origin, this.dir(offset));
  }

  /** Dirección relativa a la parte → modelo. */
  dir(v: Vec3): Vec3 {
    return yaw(pitch(v, this.bow), this.turn);
  }

  /** Punto del modelo → relativo a la parte (para los materiales). */
  local(p: Vec3): Vec3 {
    return this.localDir(sub(p, this.origin));
  }

  /** Dirección del modelo → relativa a la parte. */
  localDir(v: Vec3): Vec3 {
    return pitch(yaw(v, -this.turn), -this.bow);
  }

  get axes(): readonly [Vec3, Vec3, Vec3] {
    return [this.dir([1, 0, 0]), this.dir([0, 1, 0]), this.dir([0, 0, 1])];
  }
}

// ── Poses ───────────────────────────────────────────────────────────

/** Pierna: muslo hacia adelante (+), rodilla doblada (+) y apertura hacia afuera. */
interface LegPose {
  readonly thigh: number;
  readonly knee: number;
  readonly spread?: number;
}

/** Brazo: cuánto se levanta hacia adelante (0 colgando, π/2 al frente, π arriba), apertura y codo. */
interface ArmPose {
  readonly raise: number;
  readonly spread: number;
  readonly bend: number;
}

interface BodyPose {
  readonly right: LegPose;
  readonly left: LegPose;
  readonly rightArm?: ArmPose;
  readonly leftArm?: ArmPose;
  /** Giro de hombros (+ lleva el hombro derecho hacia atrás). */
  readonly twist?: number;
  /** Cadera corrida hacia la derecha (+) en px: el peso sobre una pierna. */
  readonly hipShift?: number;
  /** Hombro derecho más bajo (+) en px. */
  readonly tilt?: number;
  /** Torso inclinado hacia adelante (+) en px. */
  readonly lean?: number;
  /** Cuerpo en el aire (px), en la fase de vuelo de la carrera. */
  readonly lift?: number;
}

/** Proporciones de un cuerpo de hombre o de mujer. */
export interface Build {
  /** Media distancia entre hombros y entre caderas. */
  readonly shoulder: number;
  readonly hip: number;
  /** Altura relativa. */
  readonly stature: number;
}

export const BUILDS: Readonly<Record<'male' | 'female', Build>> = {
  male: { shoulder: 6.7, hip: 3.4, stature: 1 },
  female: { shoulder: 6.1, hip: 3.7, stature: 0.95 },
};

const STAND: LegPose = { thigh: 0, knee: 0.04, spread: 0.03 };
const FORWARD: LegPose = { thigh: 0.42, knee: 0.08 };
const BACK: LegPose = { thigh: -0.4, knee: 0.3 };
const PASSING: LegPose = { thigh: 0.22, knee: 0.85 };
/** Piernas firmes y un poco abiertas, para pelear. */
const BRACED: LegPose = { thigh: 0.05, knee: 0.15, spread: 0.12 };
const LUNGE_FRONT: LegPose = { thigh: 0.38, knee: 0.18, spread: 0.06 };
const LUNGE_BACK: LegPose = { thigh: -0.3, knee: 0.22, spread: 0.08 };

const WALK: Readonly<Record<0 | 1 | 2 | 3, BodyPose>> = {
  0: { right: FORWARD, left: BACK },
  1: { right: STAND, left: PASSING },
  2: { right: BACK, left: FORWARD },
  3: { right: PASSING, left: STAND },
};

/** Pasos de cada acción (las que tienen menos de 4 repiten el último). */
const ACTIONS: Readonly<Record<ActionKind, readonly BodyPose[]>> = {
  // Carrera, como en UO: torso inclinado, brazos doblados que bombean, rodillas altas y un
  // instante en el aire (no es una caminata rápida).
  run: [
    {
      right: { thigh: 0.55, knee: 0.35 },
      left: { thigh: -0.45, knee: 0.25 },
      rightArm: { raise: -0.55, spread: 0.15, bend: 1.55 },
      leftArm: { raise: 0.95, spread: 0.1, bend: 1.45 },
      twist: -0.12,
      lean: 2.3,
    },
    {
      right: { thigh: -0.2, knee: 0.3 },
      left: { thigh: 0.55, knee: 1.45 },
      rightArm: { raise: 0.15, spread: 0.15, bend: 1.5 },
      leftArm: { raise: 0.25, spread: 0.1, bend: 1.5 },
      lean: 2.3,
      lift: 1.4,
    },
    {
      right: { thigh: -0.45, knee: 0.25 },
      left: { thigh: 0.55, knee: 0.35 },
      rightArm: { raise: 0.95, spread: 0.15, bend: 1.45 },
      leftArm: { raise: -0.55, spread: 0.1, bend: 1.55 },
      twist: 0.12,
      lean: 2.3,
    },
    {
      right: { thigh: 0.55, knee: 1.45 },
      left: { thigh: -0.2, knee: 0.3 },
      rightArm: { raise: 0.25, spread: 0.15, bend: 1.5 },
      leftArm: { raise: 0.15, spread: 0.1, bend: 1.5 },
      lean: 2.3,
      lift: 1.4,
    },
  ],
  // Golpe en arco: arma arriba y atrás, golpe hacia adelante y abajo, y seguida cruzando el cuerpo.
  slash: [
    {
      right: BRACED,
      left: BRACED,
      rightArm: { raise: 2.7, spread: 0.35, bend: 0.55 },
      leftArm: { raise: 0.55, spread: 0.3, bend: 0.7 },
      twist: 0.4,
      lean: -0.6,
    },
    {
      right: LUNGE_FRONT,
      left: LUNGE_BACK,
      rightArm: { raise: 1.55, spread: 0.12, bend: 0.1 },
      leftArm: { raise: 0.3, spread: 0.35, bend: 0.5 },
      twist: -0.12,
      lean: 1.2,
    },
    {
      right: LUNGE_FRONT,
      left: LUNGE_BACK,
      rightArm: { raise: 0.55, spread: -0.45, bend: 0.4 },
      leftArm: { raise: 0.2, spread: 0.35, bend: 0.4 },
      twist: -0.45,
      lean: 1,
    },
  ],
  // Estocada: la mano se recoge junto a la cadera y sale recta hacia adelante.
  thrust: [
    {
      right: BRACED,
      left: BRACED,
      rightArm: { raise: 0.25, spread: 0.25, bend: 1.75 },
      leftArm: { raise: 0.9, spread: 0.1, bend: 1.4 },
      twist: 0.35,
    },
    {
      right: LUNGE_FRONT,
      left: LUNGE_BACK,
      rightArm: { raise: 1.45, spread: 0, bend: 0.05 },
      leftArm: { raise: 0.4, spread: 0.3, bend: 0.8 },
      twist: -0.3,
      lean: 1.6,
    },
    {
      right: BRACED,
      left: BRACED,
      rightArm: { raise: 0.9, spread: 0.1, bend: 0.8 },
      leftArm: { raise: 0.7, spread: 0.15, bend: 1.2 },
      twist: -0.05,
      lean: 0.6,
    },
  ],
  // Puñetazo: guardia con la izquierda y la derecha que sale recta.
  punch: [
    {
      right: BRACED,
      left: BRACED,
      rightArm: { raise: 0.6, spread: 0.2, bend: 1.9 },
      leftArm: { raise: 1.05, spread: 0.1, bend: 1.9 },
      twist: 0.3,
    },
    {
      right: LUNGE_FRONT,
      left: LUNGE_BACK,
      rightArm: { raise: 1.5, spread: -0.05, bend: 0.05 },
      leftArm: { raise: 1, spread: 0.12, bend: 2 },
      twist: -0.35,
      lean: 1.4,
    },
    {
      right: BRACED,
      left: BRACED,
      rightArm: { raise: 1, spread: 0.1, bend: 1.5 },
      leftArm: { raise: 1.05, spread: 0.1, bend: 1.9 },
      twist: 0.05,
      lean: 0.4,
    },
  ],
  // Hechizo: las manos se levantan al frente y luego hacia arriba.
  cast: [
    {
      right: BRACED,
      left: BRACED,
      rightArm: { raise: 1.25, spread: 0.35, bend: 0.75 },
      leftArm: { raise: 1.25, spread: 0.35, bend: 0.75 },
    },
    {
      right: BRACED,
      left: BRACED,
      rightArm: { raise: 2.25, spread: 0.5, bend: 0.25 },
      leftArm: { raise: 2.25, spread: 0.5, bend: 0.25 },
      lean: -0.4,
    },
  ],
  // Reposo: hombros que giran un poco hacia un lado (0, 1) o al otro (2, 3).
  shrug: [
    { right: STAND, left: STAND, twist: 0.14, tilt: 0.3 },
    { right: STAND, left: STAND, twist: 0.28, tilt: 0.6 },
    { right: STAND, left: STAND, twist: -0.14, tilt: -0.3 },
    { right: STAND, left: STAND, twist: -0.28, tilt: -0.6 },
  ],
  // Reposo: el peso pasa a una pierna, la otra se afloja y abre (contrapposto).
  stance: [
    {
      right: { thigh: 0, knee: 0.02, spread: 0 },
      left: { thigh: 0.04, knee: 0.18, spread: 0.12 },
      hipShift: 0.7,
      tilt: -0.3,
    },
    {
      right: { thigh: 0, knee: 0, spread: -0.02 },
      left: { thigh: 0.1, knee: 0.36, spread: 0.22 },
      leftArm: { raise: 0.3, spread: 0.6, bend: 1.55 },
      hipShift: 1.4,
      tilt: -0.6,
    },
    {
      right: { thigh: 0.04, knee: 0.18, spread: 0.12 },
      left: { thigh: 0, knee: 0.02, spread: 0 },
      hipShift: -0.7,
      tilt: 0.3,
    },
    {
      right: { thigh: 0.1, knee: 0.36, spread: 0.22 },
      left: { thigh: 0, knee: 0, spread: -0.02 },
      rightArm: { raise: 0.3, spread: 0.6, bend: 1.55 },
      hipShift: -1.4,
      tilt: 0.6,
    },
  ],
};

function poseFor(frame: CharacterFrame): BodyPose {
  if (frame === 'idle') return { right: STAND, left: STAND };
  if (typeof frame === 'number') return WALK[frame];
  const [kind, step] = frame.split('-') as [ActionKind, string];
  const steps = ACTIONS[kind];
  return steps[Math.min(Number(step), steps.length - 1)] ?? { right: STAND, left: STAND };
}

// ── Esqueleto ───────────────────────────────────────────────────────

export interface Rig {
  readonly pelvis: Basis;
  readonly chest: Basis;
  readonly head: Basis;
  readonly neck: Vec3;
  /** Por lado: 1 = derecha, -1 = izquierda. */
  readonly legs: Readonly<Record<1 | -1, { hip: Vec3; knee: Vec3; ankle: Vec3; toe: Vec3 }>>;
  readonly arms: Readonly<
    Record<1 | -1, { shoulder: Vec3; elbow: Vec3; hand: Vec3; weaponDir: Vec3 }>
  >;
  /** Cuánto se abre la capa hacia atrás (al moverse o pelear). */
  readonly sway: number;
}

const THIGH = 12;
const SHIN = 12;
const UPPER_ARM = 8.5;
const FOREARM = 8;
/** Ángulo extra con el que la mano sostiene el arma respecto del antebrazo. */
const GRIP = 0.15;

/** Dirección de un hueso: colgando, levantado hacia adelante `raise` y abierto `spread` hacia afuera. */
function boneDir(raise: number, spread: number, side: 1 | -1): Vec3 {
  const c = Math.cos(spread);
  return normalize([side * Math.sin(spread), -Math.cos(raise) * c, Math.sin(raise) * c]);
}

/**
 * Arma el esqueleto de un humanoide para un frame. El pie que pisa queda
 * siempre en el suelo: el cuerpo sube y baja solo con la pose.
 * `armed`: la mano derecha sostiene un arma (antebrazo más adelante).
 */
export function humanoidRig(
  frame: CharacterFrame,
  armed: boolean,
  build: Build = BUILDS.male,
): Rig {
  const pose = poseFor(frame);
  const k = build.stature;
  const hipShift = pose.hipShift ?? 0;
  const twist = pose.twist ?? 0;
  const lean = pose.lean ?? 0;
  const tilt = pose.tilt ?? 0;
  const hipHeight = 28 * k;

  const legFor = (side: 1 | -1, leg: LegPose) => {
    const hip: Vec3 = [side * build.hip + hipShift, hipHeight, 0];
    const knee = add(hip, scale(boneDir(leg.thigh, leg.spread ?? 0, side), THIGH * k));
    const ankle = add(knee, scale(boneDir(leg.thigh - leg.knee, leg.spread ?? 0, side), SHIN * k));
    return { hip, knee, ankle, toe: add(ankle, [side * 0.4, -1.2, 4.2]) };
  };
  const rawLegs = { 1: legFor(1, pose.right), [-1]: legFor(-1, pose.left) } as Rig['legs'];
  // Baja todo para que el pie más bajo apoye en el suelo (tobillo a 3 px).
  const drop = Math.min(rawLegs[1].ankle[1], rawLegs[-1].ankle[1]) - 3 - (pose.lift ?? 0);
  const lower = (p: Vec3): Vec3 => [p[0], p[1] - drop, p[2]];
  const legs = {
    1: mapJoints(rawLegs[1], lower),
    [-1]: mapJoints(rawLegs[-1], lower),
  } as Rig['legs'];

  const hipY = hipHeight - drop;
  const pelvis = new Basis([hipShift, hipY, 0], twist * 0.3);
  const chest = new Basis([hipShift * 0.4, hipY + 9.5 * k, 0.2 + lean * 0.4], twist, lean * 0.09);
  const head = new Basis(
    [hipShift * 0.2, hipY + 23.6 * k, 0.5 + lean * 1.1],
    twist * 0.55,
    lean * 0.04,
  );

  // Los brazos van al revés que las piernas al caminar.
  const swing = typeof frame === 'number' ? 1 : 0;
  const defaultArm = (side: 1 | -1): ArmPose => ({
    raise: -(side === 1 ? pose.right.thigh : pose.left.thigh) * 0.8 * swing,
    spread: 0.12,
    bend: side === 1 && armed ? 0.95 : 0.3,
  });
  const armFor = (side: 1 | -1, armPose: ArmPose) => {
    const shoulder = chest.at([side * build.shoulder, 4.4 * k - side * tilt, -0.2]);
    const elbow = add(
      shoulder,
      scale(chest.dir(boneDir(armPose.raise, armPose.spread, side)), UPPER_ARM * k),
    );
    const forearm = chest.dir(boneDir(armPose.raise + armPose.bend, armPose.spread * 0.6, side));
    const hand = add(elbow, scale(forearm, FOREARM * k));
    const weaponDir = chest.dir(
      boneDir(armPose.raise + armPose.bend + GRIP, armPose.spread * 0.5, side),
    );
    return { shoulder, elbow, hand, weaponDir };
  };
  const arms = {
    1: armFor(1, pose.rightArm ?? defaultArm(1)),
    [-1]: armFor(-1, pose.leftArm ?? defaultArm(-1)),
  } as Rig['arms'];

  const moving = typeof frame === 'number' ? (frame % 2 === 1 ? 1.6 : 0.8) : 0;
  return {
    pelvis,
    chest,
    head,
    neck: [hipShift * 0.3, hipY + 15.5 * k, 0.3 + lean * 0.8],
    legs,
    arms,
    sway: Math.max(moving, Math.abs(lean) * 0.8),
  };
}

function mapJoints<T extends Record<string, Vec3>>(joints: T, f: (p: Vec3) => Vec3): T {
  return Object.fromEntries(Object.entries(joints).map(([k, v]) => [k, f(v)])) as T;
}
