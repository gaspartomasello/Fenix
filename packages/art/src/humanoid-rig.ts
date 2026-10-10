import { Direction, type ItemKind } from '@fenix/shared';
import { Camera, VolumeCanvas, add, normalize, pitch, scale, sub, yaw, type Vec3 } from './volume';

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
 * Acciones animadas, cada una en pasos: correr, golpe en arco (espada, hacha,
 * maza), estocada (daga, estoque, lanza), puñetazo, disparo con arco, lanzar un hechizo, y dos gestos de reposo:
 * girar los hombros y cambiar el peso de pierna.
 */
export const ACTION_KINDS = [
  'run',
  'slash',
  'thrust',
  'punch',
  'shoot',
  'cast',
  'shrug',
  'stance',
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
export type ActionStep = 0 | 1 | 2 | 3;

/** Cuadros de un ciclo de caminata o carrera (dos pasos): más cuadros, más fluido. */
export const WALK_FRAME_COUNT = 8;
export type WalkStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * `idle` = parado; 0..7 = caminata (un ciclo de dos pasos); `run-0..7` =
 * carrera; o un paso de una acción.
 */
/** `dead`: tirado en el piso (el cuerpo muerto; ver corpse-art). */
export type CharacterFrame =
  'idle' | 'dead' | WalkStep | `run-${WalkStep}` | `${ActionKind}-${ActionStep}`;
export const WALK_FRAMES: readonly WalkStep[] = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * En qué punto del ciclo de caminar o correr está un cuadro (0–1, un ciclo
 * son dos pasos), o null si no es caminar ni correr.
 */
export function cyclePhase(frame: CharacterFrame): { phase: number; running: boolean } | null {
  if (typeof frame === 'number') return { phase: frame / WALK_FRAME_COUNT, running: false };
  if (frame.startsWith('run-'))
    return { phase: Number(frame.slice(4)) / WALK_FRAME_COUNT, running: true };
  return null;
}

/** Con qué gesto ataca según lo que tenga en la mano derecha. */
export function attackStyleFor(
  weapon: ItemKind | undefined,
): 'slash' | 'thrust' | 'punch' | 'shoot' {
  if (!weapon) return 'punch';
  if (weapon === 'bow') return 'shoot';
  return THRUSTING.has(weapon) ? 'thrust' : 'slash';
}

const THRUSTING: ReadonlySet<ItemKind> = new Set<ItemKind>(['dagger', 'kryss', 'spear']);

/** Armas que se llevan en la mano izquierda (el arco, como en UO). */
export function heldInLeftHand(weapon: ItemKind | undefined): boolean {
  return weapon === 'bow';
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

/**
 * Cámara para un sprite que mira en `direction`. `frame` cambia el lienzo
 * (los jinetes y sus monturas usan uno más grande).
 */
export function cameraFor(
  direction: Direction,
  zoom = HUMAN_ZOOM,
  frame: { width: number; feetY: number } = {
    width: CHARACTER_ART_WIDTH,
    feetY: CHARACTER_FEET_Y,
  },
): Camera {
  return new Camera(
    FACING[direction],
    (frame.width * ART_DETAIL) / 2,
    frame.feetY * ART_DETAIL,
    undefined,
    zoom * ART_DETAIL,
  );
}

/**
 * Detalle de los sprites de personas, criaturas y monturas: múltiplo de su
 * tamaño en pantalla al que se dibujan. En 1 se dibujan pixel a pixel, con
 * el aspecto de siempre (se probó 2, con filtro suave, y se veía peor).
 */
export const ART_DETAIL = 1;

/** Lienzo de un sprite de `width`×`height` (en pixeles de pantalla), al detalle de arte. */
export function spriteCanvas(width: number, height: number, camera: Camera): VolumeCanvas {
  return new VolumeCanvas(width * ART_DETAIL, height * ART_DETAIL, camera);
}

/**
 * Hace el lienzo donde se dibuja un sprite. Normalmente es `spriteCanvas`;
 * los cuerpos tirados en el piso usan otro, que acuesta el modelo (ver corpse-art).
 */
export type CanvasFactory = (width: number, height: number, camera: Camera) => VolumeCanvas;

/** Escala de las personas (el jinete y su montura se dibujan a la misma). */
export const PERSON_ZOOM = HUMAN_ZOOM;

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
  /** Apertura de la pierna desde la rodilla (si no, la misma que el muslo). */
  readonly shinSpread?: number;
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
  male: { shoulder: 6.5, hip: 3.4, stature: 1 },
  female: { shoulder: 5.7, hip: 3.7, stature: 0.95 },
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
  // Disparo: de costado, el arco al frente con la izquierda; la derecha tensa la cuerda
  // hasta la cara y la suelta.
  shoot: [
    {
      right: BRACED,
      left: BRACED,
      leftArm: { raise: 1.5, spread: 0.05, bend: 0.1 },
      rightArm: { raise: 1.45, spread: -0.35, bend: 0.6 },
      twist: 0.55,
    },
    {
      right: BRACED,
      left: BRACED,
      leftArm: { raise: 1.55, spread: 0.05, bend: 0.05 },
      rightArm: { raise: 1.35, spread: -0.2, bend: 2.3 },
      twist: 0.65,
      lean: -0.3,
    },
    {
      right: BRACED,
      left: BRACED,
      leftArm: { raise: 1.5, spread: 0.05, bend: 0.1 },
      rightArm: { raise: 1.2, spread: 0.45, bend: 1.6 },
      twist: 0.6,
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

/**
 * Muerto (se dibuja de pie y después se acuesta el modelo entero): brazos
 * abiertos y estirados, con el arma siguiendo la mano en el piso, y las
 * piernas apenas separadas.
 */
const DEAD: BodyPose = {
  right: { thigh: 0, knee: 0.12, spread: 0.14 },
  left: { thigh: 0.05, knee: 0.05, spread: 0.1 },
  rightArm: { raise: 0.1, spread: 0.8, bend: 0.12 },
  leftArm: { raise: 0.05, spread: 0.55, bend: 0.35 },
};

function poseFor(frame: CharacterFrame): BodyPose {
  if (frame === 'idle') return { right: STAND, left: STAND };
  if (frame === 'dead') return DEAD;
  // Caminar y correr: entre las cuatro poses clave se interpola, así hay más cuadros.
  const cycle = cyclePhase(frame);
  if (cycle) {
    const keys = cycle.running ? ACTIONS.run : [WALK[0], WALK[1], WALK[2], WALK[3]];
    const at = cycle.phase * keys.length;
    const index = Math.floor(at);
    const a = keys[index % keys.length] ?? WALK[0];
    const b = keys[(index + 1) % keys.length] ?? WALK[0];
    return blendPose(a, b, at - index);
  }
  const [kind, step] = String(frame).split('-') as [ActionKind, string];
  const steps = ACTIONS[kind];
  return steps[Math.min(Number(step), steps.length - 1)] ?? { right: STAND, left: STAND };
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

function blendLeg(a: LegPose, b: LegPose, t: number): LegPose {
  return {
    thigh: mix(a.thigh, b.thigh, t),
    knee: mix(a.knee, b.knee, t),
    spread: mix(a.spread ?? 0, b.spread ?? 0, t),
  };
}

function blendArm(a: ArmPose | undefined, b: ArmPose | undefined, t: number): ArmPose | undefined {
  if (!a || !b) return t < 0.5 ? a : b;
  return {
    raise: mix(a.raise, b.raise, t),
    spread: mix(a.spread, b.spread, t),
    bend: mix(a.bend, b.bend, t),
  };
}

/** Pose intermedia entre dos poses clave, con un paso suave (sin tirones). */
function blendPose(a: BodyPose, b: BodyPose, raw: number): BodyPose {
  const t = raw * raw * (3 - 2 * raw);
  const rightArm = blendArm(a.rightArm, b.rightArm, t);
  const leftArm = blendArm(a.leftArm, b.leftArm, t);
  return {
    right: blendLeg(a.right, b.right, t),
    left: blendLeg(a.left, b.left, t),
    ...(rightArm ? { rightArm } : {}),
    ...(leftArm ? { leftArm } : {}),
    twist: mix(a.twist ?? 0, b.twist ?? 0, t),
    hipShift: mix(a.hipShift ?? 0, b.hipShift ?? 0, t),
    tilt: mix(a.tilt ?? 0, b.tilt ?? 0, t),
    lean: mix(a.lean ?? 0, b.lean ?? 0, t),
    lift: mix(a.lift ?? 0, b.lift ?? 0, t),
  };
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
  /**
   * Cuánto vuela la capa hacia atrás: poco al caminar, mucho al correr, y
   * según el giro y la inclinación al pelear.
   */
  readonly sway: number;
  /** Fase del ciclo (0–3), para que la tela ondee distinto en cada paso. */
  readonly phase: number;
  /** Tensando la cuerda del arco (la cuerda va a la mano derecha). */
  readonly drawing: boolean;
  /**
   * Hasta dónde baja la ropa larga (túnica, capa): el suelo de pie, o la
   * altura de los estribos montado.
   */
  readonly hem: number;
  /** Montado: las piernas abrazan el lomo y la ropa no llega al suelo. */
  readonly seated: boolean;
}

/** Dónde va sentado el jinete: altura y avance de la cadera sobre la montura. */
export interface Seat {
  readonly y: number;
  readonly z: number;
  /** Media anchura del lomo a la altura de las rodillas: las piernas lo rodean. */
  readonly girth: number;
  /** Rebote del jinete en este frame (px), según el andar de la montura. */
  readonly bob?: number;
}

/** Montado: las piernas abiertas sobre el lomo, rodillas dobladas, pies en los estribos. */
const RIDING_LEG = (girth: number): LegPose => ({
  thigh: 0.8,
  knee: 1.45,
  spread: Math.min(0.75, 0.3 + girth * 0.032),
  shinSpread: 0.06,
});
/** Las manos al frente, sosteniendo las riendas. */
const REINS: ArmPose = { raise: 0.7, spread: 0.08, bend: 0.85 };

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
  seat?: Seat,
): Rig {
  const base = poseFor(frame);
  const moving = frame === 'idle' || cyclePhase(frame) !== null;
  const galloping = cyclePhase(frame)?.running === true;
  // Montado, las piernas van siempre en la montura; los brazos llevan las
  // riendas salvo durante una acción (golpe, hechizo, disparo).
  const pose: BodyPose = seat
    ? {
        ...base,
        right: RIDING_LEG(seat.girth),
        left: RIDING_LEG(seat.girth),
        ...(moving ? { rightArm: REINS, leftArm: REINS } : {}),
        lean: moving ? (galloping ? 1.8 : 0.4) : (base.lean ?? 0),
        hipShift: 0,
        tilt: moving ? 0 : (base.tilt ?? 0),
        twist: moving ? 0 : (base.twist ?? 0),
      }
    : base;
  const k = build.stature;
  const hipShift = pose.hipShift ?? 0;
  const twist = pose.twist ?? 0;
  const lean = pose.lean ?? 0;
  const tilt = pose.tilt ?? 0;
  const hipHeight = 28 * k;

  const legFor = (side: 1 | -1, leg: LegPose) => {
    const hip: Vec3 = [side * build.hip + hipShift, hipHeight, 0];
    const knee = add(hip, scale(boneDir(leg.thigh, leg.spread ?? 0, side), THIGH * k));
    const ankle = add(
      knee,
      scale(boneDir(leg.thigh - leg.knee, leg.shinSpread ?? leg.spread ?? 0, side), SHIN * k),
    );
    return { hip, knee, ankle, toe: add(ankle, [side * 0.4, -1.2, 4.2]) };
  };
  const rawLegs = { 1: legFor(1, pose.right), [-1]: legFor(-1, pose.left) } as Rig['legs'];
  // Baja todo para que el pie más bajo apoye en el suelo (tobillo a 3 px);
  // montado, la cadera va a la altura de la montura.
  const drop = seat
    ? hipHeight - seat.y - (seat.bob ?? 0)
    : Math.min(rawLegs[1].ankle[1], rawLegs[-1].ankle[1]) - 3 - (pose.lift ?? 0);
  const forward = seat?.z ?? 0;
  const lower = (p: Vec3): Vec3 => [p[0], p[1] - drop, p[2] + forward];
  const legs = {
    1: mapJoints(rawLegs[1], lower),
    [-1]: mapJoints(rawLegs[-1], lower),
  } as Rig['legs'];

  const hipY = hipHeight - drop;
  const pelvis = new Basis([hipShift, hipY, forward], twist * 0.3);
  const chest = new Basis(
    [hipShift * 0.4, hipY + 9.5 * k, forward + 0.2 + lean * 0.4],
    twist,
    lean * 0.09,
  );
  const head = new Basis(
    [hipShift * 0.2, hipY + 23.6 * k, forward + 0.5 + lean * 1.1],
    twist * 0.55,
    lean * 0.04,
  );

  // Los brazos van al revés que las piernas al caminar (montado, no).
  const swing = typeof frame === 'number' && !seat ? 1 : 0;
  const defaultArm = (side: 1 | -1): ArmPose => ({
    raise: -(side === 1 ? pose.right.thigh : pose.left.thigh) * 0.8 * swing,
    spread: 0.12,
    bend: side === 1 && armed ? 0.95 : 0.3,
  });
  const armFor = (side: 1 | -1, armPose: ArmPose) => {
    const shoulder = chest.at([side * build.shoulder, 4 * k - side * tilt, -0.2]);
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

  const cycle = cyclePhase(frame);
  const running = cycle?.running === true;
  const walking = cycle !== null && !running;
  // Paso del ciclo en la escala de las poses clave (0–4), para que la tela ondee.
  const step = cycle ? cycle.phase * 4 : 0;
  // La capa vuela más en el medio de cada paso.
  const flutter = Math.abs(Math.sin(step * (Math.PI / 2)));
  const sway = running
    ? (seat ? 6 : 4.2) + flutter * 0.8
    : walking
      ? (seat ? 2.2 : 1.1) + flutter * 0.5
      : Math.abs(lean) * 1.1 + Math.abs(twist) * 2.5;
  return {
    pelvis,
    chest,
    head,
    neck: [hipShift * 0.3, hipY + 15.5 * k, forward + 0.3 + lean * 0.8],
    legs,
    arms,
    sway,
    phase: step,
    drawing: frame === 'shoot-0' || frame === 'shoot-1',
    hem: seat ? Math.min(legs[1].ankle[1], legs[-1].ankle[1]) + 2 : 0,
    seated: seat !== undefined,
  };
}

function mapJoints<T extends Record<string, Vec3>>(joints: T, f: (p: Vec3) => Vec3): T {
  return Object.fromEntries(Object.entries(joints).map(([k, v]) => [k, f(v)])) as T;
}
