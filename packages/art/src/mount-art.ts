import { MOUNTS, type Direction, type MountKind } from '@fenix/shared';
import { OUTLINE } from './character-art';
import { spriteCanvas } from './humanoid-rig';
import {
  PERSON_ZOOM,
  cameraFor,
  cyclePhase,
  type CharacterFrame,
  type Rig,
  type Seat,
} from './humanoid-rig';
import type { PixelImage, Rgb } from './pixel-art';
import type { VolumeCanvas } from './volume';
import {
  add,
  axesAlong,
  lerp,
  metal,
  noise,
  normalize,
  pitch,
  ramp,
  scale,
  solid,
  sub,
  tone,
  type Material,
  type Ramp,
  type Vec3,
} from './volume';

/**
 * Lienzo de un jinete con su montura (o de la montura sola): más grande que
 * el de una persona, con el suelo más abajo. Se dibuja a la misma escala que
 * las personas, así el jinete mide lo mismo que a pie.
 */
export const MOUNTED_ART_WIDTH = 120;
export const MOUNTED_ART_HEIGHT = 132;
export const MOUNTED_FEET_Y = 118;
/** Fila aproximada de la cabeza del jinete (para el nombre y la vida). */
export const MOUNTED_HEAD_Y = 30;
const MOUNTED_FRAME = { width: MOUNTED_ART_WIDTH, feetY: MOUNTED_FEET_Y };

export function mountedCamera(direction: Direction) {
  return cameraFor(direction, PERSON_ZOOM, MOUNTED_FRAME);
}

/** Lo que se usa del lienzo para dibujar una montura. */
interface Painter {
  ellipsoid(center: Vec3, axes: readonly [Vec3, Vec3, Vec3], radii: Vec3, material: Material): void;
  sphere(center: Vec3, radius: number, material: Material): void;
  limb(a: Vec3, b: Vec3, ra: number, rb: number, material: Material): void;
}

/**
 * Dibuja agrandado `k` veces desde el suelo: así la montura tiene el tamaño
 * justo al lado del jinete sin tocar sus medidas internas.
 */
class Scaled implements Painter {
  constructor(
    private readonly canvas: VolumeCanvas,
    readonly k: number,
  ) {}

  ellipsoid(
    center: Vec3,
    axes: readonly [Vec3, Vec3, Vec3],
    radii: Vec3,
    material: Material,
  ): void {
    this.canvas.ellipsoid(scale(center, this.k), axes, scale(radii, this.k), material);
  }

  sphere(center: Vec3, radius: number, material: Material): void {
    this.canvas.sphere(scale(center, this.k), radius * this.k, material);
  }

  limb(a: Vec3, b: Vec3, ra: number, rb: number, material: Material): void {
    this.canvas.limb(scale(a, this.k), scale(b, this.k), ra * this.k, rb * this.k, material);
  }
}

/** Manos y pies del jinete, en las medidas de la montura (para riendas y estribos). */
interface RiderHold {
  readonly hands: Readonly<Record<1 | -1, Vec3>>;
  readonly feet: Readonly<Record<1 | -1, Vec3>>;
}

function holdOf(rider: Rig | null, k: number): RiderHold | null {
  if (!rider) return null;
  const local = (p: Vec3): Vec3 => scale(p, 1 / k);
  return {
    hands: { 1: local(rider.arms[1].hand), [-1]: local(rider.arms[-1].hand) },
    feet: { 1: local(rider.legs[1].ankle), [-1]: local(rider.legs[-1].ankle) },
  };
}

/** El asiento, pasado de las medidas de la montura a las del lienzo. */
function seatAt(point: Vec3, girth: number, bob: number, k: number): Seat {
  return { y: (point[1] + 1.4) * k, z: (point[2] - 1) * k, girth: girth * k, bob: bob * k };
}

/** Lo que el jinete necesita de su montura. */
export interface MountPose {
  /** Dónde va sentado. */
  readonly seat: Seat;
  /** Riendas hasta las manos y estribos en los pies, una vez armado el jinete. */
  readonly tack: (canvas: VolumeCanvas, rider: Rig | null) => void;
}

/** La montura sola (siguiendo a su dueño), sin jinete. */
export function drawMountFrame(
  kind: MountKind,
  direction: Direction,
  frame: CharacterFrame,
): PixelImage {
  const canvas = spriteCanvas(MOUNTED_ART_WIDTH, MOUNTED_ART_HEIGHT, mountedCamera(direction));
  drawMount(canvas, kind, frame).tack(canvas, null);
  return canvas.toImage(OUTLINE);
}

/** Dibuja la montura en el lienzo y devuelve dónde se sienta el jinete. */
export function drawMount(canvas: VolumeCanvas, kind: MountKind, frame: CharacterFrame): MountPose {
  // Un poco más grandes que en la vida real al lado de una persona, como en UO.
  switch (MOUNTS[kind].species) {
    case 'horse':
      return drawQuadruped(
        canvas,
        HORSE,
        HORSE_COATS[kind as keyof typeof HORSE_COATS] ?? HORSE_COATS['horse-chestnut'],
        frame,
      );
    case 'llama':
      return drawQuadruped(canvas, LLAMA, LLAMA_COAT, frame);
    case 'runner':
      return drawRunner(canvas, frame);
  }
}

// ── Andares ─────────────────────────────────────────────────────────

type LegId = 'lf' | 'rf' | 'lh' | 'rh';

/** Una pata en un instante: cuánto va hacia adelante (rad) y cuánto se dobla para levantarse. */
interface LegState {
  readonly swing: number;
  readonly flex: number;
}

interface GaitPose {
  readonly legs: Readonly<Record<LegId, LegState>>;
  /** Cabeceo del cuerpo (+ baja el pecho). */
  readonly pitch: number;
  /** El cuerpo en el aire, sin patas apoyadas (galope). */
  readonly airborne: number;
  /** La cabeza sube y baja con el paso (rad, + hacia abajo). */
  readonly nod: number;
  /** Cola: 0 colgando, 1 al viento. */
  readonly tailLift: number;
  /** Vaivén de la cola hacia un costado (px). */
  readonly tailSwing: number;
  /** Rebote del jinete (px). */
  readonly bob: number;
}

const STILL: LegState = { swing: 0, flex: 0 };

/**
 * Una pata en la fase `phase` (0–1) del ciclo: apoyada (va de adelante hacia
 * atrás mientras el cuerpo avanza) o en el aire (se dobla y vuelve adelante).
 */
function legAt(phase: number, support: number, amplitude: number, lift: number): LegState {
  const p = ((phase % 1) + 1) % 1;
  if (p < support) return { swing: amplitude * (1 - (2 * p) / support), flex: 0 };
  const u = (p - support) / (1 - support);
  return { swing: -amplitude * Math.cos(Math.PI * u), flex: Math.sin(Math.PI * u) * lift };
}

/**
 * Paso de cuatro tiempos (trasera izquierda, delantera izquierda, trasera
 * derecha, delantera derecha), galope con un instante en el aire y reposo,
 * como los caballos de verdad. Las acciones del jinete (golpes, hechizos)
 * se hacen con la montura parada.
 */
function quadrupedGait(frame: CharacterFrame): GaitPose {
  const cycle = cyclePhase(frame);
  if (cycle && !cycle.running) {
    const t = cycle.phase;
    const at = (offset: number, amplitude: number) => legAt(t + offset, 0.62, amplitude, 1);
    return {
      legs: { lh: at(0, 0.32), lf: at(0.25, 0.34), rh: at(0.5, 0.32), rf: at(0.75, 0.34) },
      pitch: 0,
      airborne: 0,
      nod: Math.sin(t * Math.PI * 4) * 0.06,
      tailLift: 0.1,
      tailSwing: Math.sin(t * Math.PI * 2) * 1.6,
      bob: Math.abs(Math.sin(t * Math.PI * 2)) * 0.6,
    };
  }
  if (cycle) {
    const t = cycle.phase;
    const at = (offset: number, amplitude: number) => legAt(t + offset, 0.4, amplitude, 1.25);
    // Galope de cuatro tiempos: trasera izquierda, trasera derecha, delantera
    // izquierda y delantera derecha. Las de un mismo par van bien desfasadas:
    // mientras una se estira adelante la otra queda atrás, cruzadas.
    const legs = { lh: at(0, 0.55), rh: at(0.2, 0.55), lf: at(0.36, 0.62), rf: at(0.62, 0.62) };
    const flying = Object.values(legs).every((leg) => leg.flex > 0.05);
    return {
      legs,
      pitch: Math.sin(t * Math.PI * 2) * 0.07,
      airborne: flying ? 2.4 : 0,
      nod: -Math.sin(t * Math.PI * 2) * 0.16,
      tailLift: 0.75,
      tailSwing: Math.sin(t * Math.PI * 2) * 1,
      bob: 0.8 + Math.cos(t * Math.PI * 2) * 1.2,
    };
  }
  const pose = String(frame);
  // Parado. Los gestos de reposo mueven la cola o bajan la cabeza.
  const swish = pose.startsWith('shrug-') ? (Number(pose.slice(6)) < 2 ? 3 : -3) : 0;
  const graze = pose.startsWith('stance-') ? 0.25 : 0;
  return {
    legs: { lf: STILL, rf: STILL, lh: STILL, rh: { swing: 0.06, flex: 0.18 } },
    pitch: 0,
    airborne: 0,
    nod: 0.12 + graze,
    tailLift: 0,
    tailSwing: swish,
    bob: 0,
  };
}

// ── Cuadrúpedos: caballo y llama ────────────────────────────────────

interface LegBuild {
  /** Articulación de arriba (codo o babilla), del lado derecho. */
  readonly top: Vec3;
  /** Largo de antebrazo (o pierna), caña y cuartilla. */
  readonly lengths: readonly [number, number, number];
  /** Inclinación de los huesos parado (rad, + hacia adelante). */
  readonly rest: readonly [number, number, number];
  /** Grosor arriba del antebrazo (o de la pierna), y en la caña. */
  readonly thickness: readonly [number, number];
  /** Pata trasera: la caña se dobla en el corvejón hacia adelante. */
  readonly hind: boolean;
}

interface QuadrupedBuild {
  readonly front: LegBuild;
  readonly hind: LegBuild;
  /** Alto del casco (o de la pezuña). */
  readonly hoof: number;
  /** Centro sobre el que cabecea el cuerpo. */
  readonly pivot: Vec3;
  readonly saddle: { readonly y: number; readonly z: number; readonly girth: number };
  readonly body: (part: BodyKit) => HeadAnchors;
  /** Escala del animal al lado del jinete. */
  readonly size: number;
  /** Patas finas que terminan en dos dedos acolchados (llama), o en casco. */
  readonly padded: boolean;
}

/** Coloración: pelaje, crin y patas (con medias blancas o no). */
interface Coat {
  readonly body: Material;
  readonly mane: Ramp;
  /** Material de cada pata (para las medias blancas). */
  readonly leg: (id: LegId) => Material;
  readonly hoof: (id: LegId) => Ramp;
  /** Mancha blanca en la cara (lucero). */
  readonly blaze: boolean;
  /** Mantilla y montura. */
  readonly blanket: Ramp;
}

/** Lo que necesita quien dibuja el cuerpo: el lienzo y cómo ubicar cada punto. */
interface BodyKit {
  readonly canvas: Painter;
  readonly at: (p: Vec3) => Vec3;
  readonly axes: (forward: Vec3) => readonly [Vec3, Vec3, Vec3];
  readonly coat: Coat;
  readonly gait: GaitPose;
}

/** Dónde quedan la cabeza y el cuello, para el freno y las riendas. */
interface HeadAnchors {
  /** Anillas del freno, a cada lado de la boca. */
  readonly bit: Readonly<Record<1 | -1, Vec3>>;
  /** Donde descansan las riendas sin jinete. */
  readonly withers: Vec3;
}

function drawQuadruped(
  target: VolumeCanvas,
  build: QuadrupedBuild,
  coat: Coat,
  frame: CharacterFrame,
): MountPose {
  const canvas = new Scaled(target, build.size);
  const gait = quadrupedGait(frame);
  // El cuerpo cabecea sobre su centro; las patas cuelgan de él.
  const tilt = (p: Vec3): Vec3 => add(build.pivot, pitch(sub(p, build.pivot), gait.pitch));

  const legIds: readonly LegId[] = ['lf', 'rf', 'lh', 'rh'];
  const chains = legIds.map((id) => {
    const isHind = id === 'lh' || id === 'rh';
    const side: 1 | -1 = id === 'rf' || id === 'rh' ? 1 : -1;
    const leg = isHind ? build.hind : build.front;
    return { id, side, leg, joints: legChain(leg, side, tilt, gait.legs[id], build.hoof) };
  });
  // Baja (o sube) todo para que las patas apoyadas pisen el suelo.
  const planted = chains.filter((c) => gait.legs[c.id].flex < 0.05);
  const lowest = Math.min(...(planted.length > 0 ? planted : chains).map((c) => c.joints.sole[1]));
  const shift = -lowest + gait.airborne;
  const lift = (p: Vec3): Vec3 => [p[0], p[1] + shift, p[2]];
  const at = (p: Vec3): Vec3 => lift(tilt(p));
  const axes = (forward: Vec3) => axesAlong(pitch(forward, gait.pitch));

  // Patas del lado lejano primero no hace falta: el lienzo tiene profundidad.
  for (const { id, leg, joints } of chains)
    drawLeg(canvas, leg, mapChain(joints, lift), coat, id, build);
  const anchors = build.body({ canvas, at, axes, coat, gait });

  const saddle = build.saddle;
  const seatPoint = at([0, saddle.y, saddle.z]);
  drawSaddle(canvas, at, axes, saddle, coat.blanket);

  return {
    seat: seatAt(seatPoint, saddle.girth, gait.bob, build.size),
    tack: (c, rider) => {
      const painter = new Scaled(c, build.size);
      const hold = holdOf(rider, build.size);
      drawStirrups(painter, at, saddle, hold);
      drawReins(painter, anchors, hold);
    },
  };
}

interface LegJoints {
  readonly top: Vec3;
  readonly mid: Vec3;
  readonly fetlock: Vec3;
  readonly coronet: Vec3;
  readonly sole: Vec3;
}

/** Dirección de un hueso inclinado `angle` desde la vertical (+ hacia adelante). */
const bone = (angle: number): Vec3 => [0, -Math.cos(angle), Math.sin(angle)];

/**
 * Cadena de una pata. Delanteras: antebrazo, rodilla, caña, menudillo y
 * cuartilla; al levantarse la rodilla lleva la caña hacia atrás. Traseras:
 * pierna hacia atrás hasta el corvejón (alto, como en los caballos), caña
 * casi vertical y cuartilla; al levantarse el corvejón se cierra.
 */
function legChain(
  leg: LegBuild,
  side: 1 | -1,
  tilt: (p: Vec3) => Vec3,
  state: LegState,
  hoof: number,
): LegJoints {
  const top = tilt([leg.top[0] * side, leg.top[1], leg.top[2]]);
  const [l1, l2, l3] = leg.lengths;
  const [r1, r2, r3] = leg.rest;
  const a1 = r1 + state.swing * (leg.hind ? 0.75 : 1);
  const a2 = leg.hind
    ? r2 + state.swing * 0.7 + state.flex * 0.9
    : r2 + state.swing - state.flex * 1.45;
  const a3 = a2 + r3 - state.flex * 1.4;
  const mid = add(top, scale(bone(a1), l1));
  const fetlock = add(mid, scale(bone(a2), l2));
  const coronet = add(fetlock, scale(bone(a3), l3));
  const sole = add(coronet, scale(normalize(add(bone(a3), [0, -1.5, 0])), hoof));
  return { top, mid, fetlock, coronet, sole };
}

function mapChain(joints: LegJoints, f: (p: Vec3) => Vec3): LegJoints {
  return {
    top: f(joints.top),
    mid: f(joints.mid),
    fetlock: f(joints.fetlock),
    coronet: f(joints.coronet),
    sole: f(joints.sole),
  };
}

function drawLeg(
  canvas: Painter,
  leg: LegBuild,
  j: LegJoints,
  coat: Coat,
  id: LegId,
  build: QuadrupedBuild,
): void {
  const [upper, cannon] = leg.thickness;
  const skin = coat.leg(id);
  // El músculo de arriba se funde con el cuerpo.
  canvas.limb(add(j.top, [0, 5, leg.hind ? 1.5 : 0.6]), j.top, upper * 1.05, upper, coat.body);
  canvas.limb(j.top, j.mid, upper, cannon * 1.25, skin);
  // Rodilla (o corvejón, con la punta hacia atrás).
  canvas.sphere(j.mid, cannon * 1.35, skin);
  if (leg.hind) canvas.sphere(add(j.mid, [0, 0.6, -cannon * 1.1]), cannon * 1.05, skin);
  canvas.limb(j.mid, j.fetlock, cannon, cannon * 0.95, skin);
  // Menudillo: la articulación redonda sobre la cuartilla.
  canvas.sphere(j.fetlock, cannon * 1.28, skin);
  canvas.limb(j.fetlock, j.coronet, cannon * 0.95, cannon * 0.9, skin);
  const hoof = coat.hoof(id);
  if (build.padded) {
    // Dos dedos con almohadilla.
    for (const toe of [-1, 1]) {
      const at = add(j.sole, [toe * cannon * 0.55, build.hoof * 0.35, cannon * 0.9]);
      canvas.ellipsoid(
        at,
        axesAlong([0, 0, 1]),
        [cannon * 0.6, build.hoof * 0.5, cannon * 1.2],
        solid(hoof),
      );
    }
    return;
  }
  // Casco: más ancho abajo, con la pared inclinada.
  canvas.limb(j.coronet, j.sole, cannon * 1.15, cannon * 1.45, (s) =>
    tone(hoof, s.light, s.p[1] < j.sole[1] + 0.6 ? -1 : 0),
  );
}

/** Mantilla, montura con borrén adelante y atrás, y cincha bajo la panza. */
function drawSaddle(
  canvas: Painter,
  at: (p: Vec3) => Vec3,
  axes: (forward: Vec3) => readonly [Vec3, Vec3, Vec3],
  saddle: QuadrupedBuild['saddle'],
  blanket: Ramp,
): void {
  const { y, z, girth } = saddle;
  const flat = axes([0, 0, 1]);
  // Largo de la montura según el animal: en una llama es más chica que en un caballo.
  const k = Math.min(1, girth / 9.4);
  const leather = ramp([104, 64, 36]);
  canvas.ellipsoid(at([0, y - 1.4, z]), flat, [girth + 0.6, 1.5, 8.6 * k], (s) =>
    tone(blanket, s.light, Math.abs(s.p[1] - (y - 2.6)) < 0.5 ? 1 : 0),
  );
  canvas.ellipsoid(at([0, y, z - 0.4]), flat, [girth * 0.78, 1.8, 6.4 * k], (s) =>
    tone(leather, s.light, noise(Math.floor(s.p[0]), Math.floor(s.p[2])) > 0.85 ? -1 : 0),
  );
  canvas.ellipsoid(at([0, y + 1.8, z + 5.4 * k]), flat, [2.8 * k, 2.1 * k, 1.7], solid(leather, 1));
  canvas.ellipsoid(
    at([0, y + 2.1, z - 5.6 * k]),
    flat,
    [girth * 0.55, 2.4 * k, 1.6],
    solid(leather),
  );
  // Faldones a los costados.
  for (const side of [1, -1] as const) {
    canvas.ellipsoid(
      at([side * (girth - 0.4), y - 3.6, z]),
      axes([0, 0, 1]),
      [0.9, 3.4 * k, 4.6 * k],
      solid(leather, -1),
    );
    canvas.limb(
      at([side * (girth - 0.8), y - 6, z + 2]),
      at([side * (girth - 2), y - 17, z + 3]),
      0.6,
      0.6,
      solid(leather, -1),
    );
  }
}

/** Estribos: cuelgan de la montura hasta los pies del jinete (o sueltos). */
function drawStirrups(
  canvas: Painter,
  at: (p: Vec3) => Vec3,
  saddle: QuadrupedBuild['saddle'],
  rider: RiderHold | null,
): void {
  const strap = solid(ramp([90, 56, 32]), -1);
  const iron = metal(ramp([150, 150, 156]));
  for (const side of [1, -1] as const) {
    const hang = at([side * (saddle.girth + 0.3), saddle.y - 2.5, saddle.z]);
    const foot = rider
      ? add(rider.feet[side], [0, -1.2, 0.8])
      : at([side * (saddle.girth + 0.8), saddle.y - 14, saddle.z + 0.5]);
    canvas.limb(hang, add(foot, [0, 1.4, 0]), 0.4, 0.4, strap);
    canvas.ellipsoid(foot, axesAlong([0, 0, 1]), [1.6, 0.5, 1.9], iron);
  }
}

/** Riendas: del freno a las manos del jinete, o apoyadas en la cruz. */
function drawReins(canvas: Painter, anchors: HeadAnchors, rider: RiderHold | null): void {
  const leather = solid(ramp([70, 42, 24]), -1);
  for (const side of [1, -1] as const) {
    const bit = anchors.bit[side];
    if (rider) {
      const hand = rider.hands[side];
      // Un poco de comba entre la boca y la mano.
      const middle = add(lerp(bit, hand, 0.5), [0, -1.4, 0]);
      canvas.limb(bit, middle, 0.32, 0.32, leather);
      canvas.limb(middle, hand, 0.32, 0.32, leather);
    } else {
      const rest = add(anchors.withers, [side * 3.2, -1, 0]);
      canvas.limb(bit, add(lerp(bit, rest, 0.5), [0, -3, 0]), 0.32, 0.32, leather);
      canvas.limb(add(lerp(bit, rest, 0.5), [0, -3, 0]), rest, 0.32, 0.32, leather);
    }
  }
}

// ── Caballo ─────────────────────────────────────────────────────────

/**
 * Caballo: pecho profundo, cruz marcada, lomo corto y grupa redonda; cuello
 * arqueado y grueso en la base; cabeza en cuña con mandíbula ancha, hocico
 * fino y orejas paradas. Patas delanteras rectas con rodilla, traseras con
 * el corvejón alto y la caña vertical, menudillos y cascos.
 */
const HORSE: QuadrupedBuild = {
  front: {
    top: [4.6, 23.5, 13],
    lengths: [10, 8.5, 3],
    rest: [0, 0, 0.62],
    thickness: [3.3, 1.45],
    hind: false,
  },
  hind: {
    top: [5.4, 24.6, -11.5],
    lengths: [11.5, 9, 3],
    rest: [-0.55, 0.12, 0.62],
    thickness: [3.7, 1.45],
    hind: true,
  },
  hoof: 2.4,
  pivot: [0, 30, 0],
  saddle: { y: 41.6, z: 3, girth: 9.4 },
  size: 1.14,
  padded: false,
  body: drawHorseBody,
};

function drawHorseBody({ canvas, at, axes, coat, gait }: BodyKit): HeadAnchors {
  const along = axes([0, 0, 1]);
  const body = coat.body;
  // Tronco: pecho, costillar, panza, lomo y grupa, que se funden entre sí.
  // Pocas piezas grandes y bien encimadas, así la línea del lomo queda continua.
  canvas.ellipsoid(at([0, 31, -1]), along, [9.2, 10, 15], body);
  canvas.ellipsoid(at([0, 30.5, 11]), along, [8.3, 10.3, 10.5], body);
  canvas.ellipsoid(at([0, 28.5, 19]), along, [6.6, 7.6, 4.8], body);
  canvas.ellipsoid(at([0, 32, -13]), along, [9.3, 10.4, 11.5], body);
  canvas.ellipsoid(at([0, 31.5, -19.5]), along, [8, 9.2, 6.5], body);
  // Cruz, paletas (inclinadas desde la cruz hasta la punta del hombro) y muslos.
  canvas.ellipsoid(at([0, 39.6, 12]), axes([0, 0.3, 1]), [4, 4, 8], body);
  for (const side of [1, -1] as const) {
    canvas.ellipsoid(at([side * 5.6, 32.5, 15]), axes([0, 0.85, -0.52]), [3.2, 4.6, 9], body);
    canvas.ellipsoid(at([side * 6, 28, -15]), axes([0, -0.9, 0.4]), [3.8, 5, 8.5], body);
  }

  // Cuello arqueado: grueso en la base, fino en la nuca, con la cresta arriba.
  const base = at([0, 35.5, 17.5]);
  const middle = at([0, 45, 23.5]);
  const nape = at([0, 52.5, 27]);
  const poll = at([0, 55, 28.5]);
  canvas.limb(base, middle, 8.2, 6.2, body);
  canvas.limb(middle, nape, 6.2, 4.5, body);
  canvas.limb(nape, poll, 4.5, 4, body);
  const neckDir = normalize(sub(nape, base));
  canvas.ellipsoid(
    add(lerp(base, nape, 0.5), [0, 2.4, -1.6]),
    axesAlong(neckDir),
    [3.6, 3, 9],
    body,
  );

  // Cabeza en cuña, que cabecea con el paso.
  const h = normalize(pitch([0, -0.66, 0.75], gait.nod + gait.pitch));
  const headAxes = axesAlong(h);
  const head = (t: number, offset: Vec3 = [0, 0, 0]): Vec3 => add(add(poll, scale(h, t)), offset);
  const face: Material = (s) => {
    if (coat.blaze && Math.abs(s.p[0]) < 1.1 && s.n[2] > 0.15 && s.p[1] > head(15)[1])
      return tone(ramp([236, 232, 222]), s.light);
    return body(s);
  };
  canvas.ellipsoid(head(4.4, [0, -1.4, 0]), headAxes, [3.5, 4.8, 5.4], body);
  canvas.ellipsoid(head(3, [0, 1.2, 0]), headAxes, [3.3, 3.2, 4.6], face);
  canvas.limb(head(6), head(15.5), 3.05, 2.5, face);
  canvas.ellipsoid(head(17), headAxes, [2.9, 3.2, 3.4], face);
  canvas.ellipsoid(head(16, [0, -2.1, 0]), headAxes, [2.2, 1.5, 2.4], body);
  const dark = solid(ramp([28, 22, 20]));
  for (const side of [1, -1] as const) {
    // Ollares, ojos y orejas.
    canvas.sphere(head(18.6, [side * 1.55, 0.4, 0]), 0.75, dark);
    canvas.sphere(head(5.4, [side * 3.15, 1.3, 0]), 0.95, (s) =>
      s.light > 0.92 ? [230, 230, 230] : [26, 20, 18],
    );
    const ear = add(poll, [side * 1.7, 1.2, -0.6]);
    canvas.limb(ear, add(ear, [side * 0.7, 5, -1.4]), 1.15, 0.25, body);
  }
  // Crin: una cresta y mechones finos que caen hacia la derecha, y el copete.
  const mane = coat.mane;
  // Cerdas: vetas finas a lo largo del pelo, claras y oscuras.
  const strands: Material = (s) =>
    tone(mane, s.light, Math.sin(s.p[0] * 5.1 + s.p[2] * 3.7) > 0.55 ? 0.6 : 0);
  const crestTop = (t: number): Vec3 =>
    add(lerp(nape, base, t), [0.6, 4.2 - t * 0.7, -1.2 - t * 0.6]);
  canvas.limb(crestTop(0), crestTop(1), 1.5, 1.8, strands);
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const root = crestTop(t);
    const fall = 3.8 + t * 1.8 + noise(i, 3) * 1.2;
    const tip = add(root, [2.4 + noise(i, 5) * 0.8, -fall, -0.8 - noise(i, 7)]);
    canvas.limb(root, lerp(root, tip, 0.55), 1.15, 0.85, strands);
    canvas.limb(lerp(root, tip, 0.55), tip, 0.85, 0.3, strands);
  }
  canvas.limb(add(poll, [0, 2, -0.5]), head(6, [0.4, 1.8, 0]), 1.3, 0.5, strands);

  // Cola: sale del maslo alta y cae en una cascada de cerdas; al galope vuela.
  const dock = at([0, 37.6, -24.4]);
  const w = gait.tailLift;
  const swing = gait.tailSwing;
  const c1 = add(dock, [0, -1 + w, -3.5 - w]);
  canvas.limb(dock, c1, 1.9, 2.1, coat.body);
  for (let i = 0; i < 9; i++) {
    const spread = (i - 4) * 0.45;
    const length = 0.85 + noise(i, 11) * 0.25;
    const c2 = add(c1, [spread * 0.5 + swing * 0.5, (-6 + w * 4) * length, (-3 - w * 4) * length]);
    const c3 = add(c1, [spread + swing, (-15 + w * 9) * length, (-3.5 - w * 7) * length]);
    const c4 = add(c1, [
      spread * 1.4 + swing * 1.3,
      (-22 + w * 13) * length,
      (-2 - w * 11) * length,
    ]);
    canvas.limb(c1, c2, 1.4, 1.5, strands);
    canvas.limb(c2, c3, 1.5, 1.2, strands);
    canvas.limb(c3, c4, 1.2, 0.35, strands);
  }

  // Cabezada: carrilleras, muserola y anillas del freno.
  const strap = solid(ramp([70, 42, 24]), -1);
  const bit = { 1: head(15.4, [2.5, -1.6, 0]), [-1]: head(15.4, [-2.5, -1.6, 0]) } as Record<
    1 | -1,
    Vec3
  >;
  for (const side of [1, -1] as const) {
    canvas.limb(
      add(poll, [side * 2.9, 0.6, 0.2]),
      head(13, [side * 2.7, 0.2, 0]),
      0.35,
      0.35,
      strap,
    );
    canvas.limb(head(13, [side * 2.8, 0.4, 0]), head(13.6, [0, 2.9, 0]), 0.35, 0.35, strap);
    canvas.sphere(bit[side], 0.6, metal(ramp([170, 170, 176])));
  }
  return { bit, withers: at([0, 41, 10]) };
}

/** Pelaje corto y brillante: la luz hace un brillo sobre los músculos. */
function glossy(colors: Ramp): Material {
  return (s) => tone(colors, s.light, s.light > 0.86 ? 1 : 0);
}

function horseCoat(
  body: Material,
  mane: Rgb,
  options: { socks?: readonly LegId[]; legs?: Material; blaze?: boolean; blanket: Rgb },
): Coat {
  const white = ramp([232, 228, 218]);
  const socks = new Set(options.socks ?? []);
  return {
    body,
    mane: ramp(mane),
    blaze: options.blaze ?? false,
    blanket: ramp(options.blanket),
    leg: (id) => (s) => {
      if (socks.has(id) && s.p[1] < 11) return tone(white, s.light);
      return (options.legs ?? body)(s);
    },
    hoof: (id) => (socks.has(id) ? ramp([164, 150, 124]) : ramp([58, 50, 44])),
  };
}

const CHESTNUT = ramp([160, 86, 44]);
const BLACK = ramp([40, 36, 42]);
const GRAY = ramp([182, 182, 178]);

/** Tordillo: manchas redondas más oscuras (rodados) y patas que se oscurecen hacia abajo. */
const dappled: Material = (s) => {
  const ring = smoothNoise(s.p[0] / 2.2, s.p[1] / 2.2, s.p[2] / 2.2) > 0.62;
  return tone(GRAY, s.light, ring ? -1 : s.light > 0.88 ? 1 : 0);
};

/** Ruido suave (interpolado), para manchas de borde redondeado. */
function smoothNoise(x: number, y: number, z: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const f = (t: number): number => t * t * (3 - 2 * t);
  const fx = f(x - x0);
  const fy = f(y - y0);
  const fz = f(z - z0);
  const plane = (zz: number): number => {
    const a = noise(x0, y0, zz) + (noise(x0 + 1, y0, zz) - noise(x0, y0, zz)) * fx;
    const b = noise(x0, y0 + 1, zz) + (noise(x0 + 1, y0 + 1, zz) - noise(x0, y0 + 1, zz)) * fx;
    return a + (b - a) * fy;
  };
  return plane(z0) + (plane(z0 + 1) - plane(z0)) * fz;
}

/** Overo: manchas blancas grandes e irregulares sobre el alazán. */
const pinto: Material = (s) => {
  const blot = smoothNoise(s.p[0] / 6, s.p[1] / 5, s.p[2] / 6);
  if (blot > 0.56) return tone(ramp([234, 230, 220]), s.light);
  return glossy(ramp([146, 82, 42]))(s);
};

const HORSE_COATS: Record<'horse-chestnut' | 'horse-black' | 'horse-gray' | 'horse-pinto', Coat> = {
  'horse-chestnut': horseCoat(glossy(CHESTNUT), [124, 62, 30], {
    socks: ['lh', 'rh'],
    blaze: true,
    blanket: [150, 40, 36],
  }),
  'horse-black': horseCoat(glossy(BLACK), [24, 22, 26], { blanket: [52, 82, 150] }),
  'horse-gray': horseCoat(dappled, [92, 92, 98], {
    legs: (s) => tone(s.p[1] < 12 ? ramp([96, 96, 100]) : GRAY, s.light),
    blanket: [40, 104, 64],
  }),
  'horse-pinto': horseCoat(pinto, [60, 40, 26], {
    socks: ['lf', 'rf', 'lh', 'rh'],
    blaze: true,
    blanket: [196, 150, 54],
  }),
};

// ── Llama ───────────────────────────────────────────────────────────

/**
 * Llama: cuerpo chico cubierto de lana, cuello largo y casi vertical,
 * cabeza chica con orejas largas curvadas, patas finas con dos dedos y la
 * colita levantada.
 */
const LLAMA: QuadrupedBuild = {
  front: {
    top: [3.6, 17.5, 10],
    lengths: [8, 6.6, 2],
    rest: [0.02, 0, 0.5],
    thickness: [2.4, 1.05],
    hind: false,
  },
  hind: {
    top: [3.9, 18.4, -9],
    lengths: [8.6, 7, 2],
    rest: [-0.38, 0.1, 0.5],
    thickness: [2.7, 1.05],
    hind: true,
  },
  hoof: 1.4,
  pivot: [0, 24, 0],
  saddle: { y: 32.4, z: 1, girth: 7.6 },
  size: 1.12,
  padded: true,
  body: drawLlamaBody,
};

const WOOL = ramp([214, 196, 168]);
const WOOL_DARK = ramp([132, 92, 60]);

/** Lana en mechones: bultitos claros y oscuros, y manchas marrones. */
const wool: Material = (s) => {
  const patch =
    noise(Math.floor(s.p[0] / 6), Math.floor(s.p[1] / 5), Math.floor(s.p[2] / 6)) > 0.62;
  const tuft = noise(Math.floor(s.p[0] * 1.3), Math.floor(s.p[1] * 1.3), Math.floor(s.p[2] * 1.3));
  return tone(patch ? WOOL_DARK : WOOL, s.light, tuft > 0.75 ? 1 : tuft < 0.2 ? -1 : 0);
};

const LLAMA_COAT: Coat = {
  body: wool,
  mane: WOOL,
  blaze: false,
  blanket: ramp([176, 52, 96]),
  leg: () => (s) => tone(WOOL, s.light, s.p[1] < 9 ? -1 : 0),
  hoof: () => ramp([70, 56, 48]),
};

function drawLlamaBody({ canvas, at, axes, coat, gait }: BodyKit): HeadAnchors {
  const along = axes([0, 0, 1]);
  const body = coat.body;
  canvas.ellipsoid(at([0, 24.5, 0]), along, [7.2, 7.6, 12.4], body);
  canvas.ellipsoid(at([0, 24.5, 8]), along, [6.8, 7.4, 7], body);
  canvas.ellipsoid(at([0, 25.5, -8.6]), along, [7, 7.2, 6.6], body);
  canvas.ellipsoid(at([0, 29.5, -1]), along, [5.4, 3.2, 10], body);
  // Cuello largo, casi vertical, y cabeza chica hacia adelante.
  const base = at([0, 27, 11.5]);
  const top = at([0, 46.5, 15.5]);
  canvas.limb(base, at([0, 36, 13.5]), 5.2, 3.8, body);
  canvas.limb(at([0, 36, 13.5]), top, 3.8, 3.1, body);
  const h = normalize(pitch([0, -0.28, 1], gait.nod * 0.6 + gait.pitch));
  const head = (t: number, offset: Vec3 = [0, 0, 0]): Vec3 => add(add(top, scale(h, t)), offset);
  const face = solid(ramp([196, 176, 148]));
  canvas.ellipsoid(head(1.6, [0, 0.8, 0]), axesAlong(h), [3.1, 3, 3.6], body);
  canvas.limb(head(2.5), head(7.6), 2.3, 1.8, face);
  canvas.ellipsoid(head(8, [0, -0.4, 0]), axesAlong(h), [1.9, 1.8, 1.6], face);
  const dark = solid(ramp([30, 24, 22]));
  for (const side of [1, -1] as const) {
    canvas.sphere(head(2.6, [side * 2.4, 1.1, 0]), 0.75, dark);
    canvas.sphere(head(9.2, [side * 0.9, 0, 0]), 0.45, dark);
    // Orejas largas que se curvan hacia adentro, como bananas.
    const ear = head(-0.6, [side * 1.6, 2.4, 0]);
    canvas.limb(ear, add(ear, [side * 0.9, 3.4, 0.3]), 0.95, 0.75, face);
    canvas.limb(add(ear, [side * 0.9, 3.4, 0.3]), add(ear, [side * 0.3, 6, 0.9]), 0.75, 0.2, face);
  }
  // Colita levantada.
  const tail = at([0, 29, -14.5]);
  canvas.limb(tail, add(tail, [gait.tailSwing * 0.3, 1.8, -2.6]), 1.8, 1.3, body);
  // Cabestro: correa en el hocico con las anillas.
  const strap = solid(ramp([150, 40, 70]));
  const bit = { 1: head(6.2, [1.9, -0.6, 0]), [-1]: head(6.2, [-1.9, -0.6, 0]) } as Record<
    1 | -1,
    Vec3
  >;
  for (const side of [1, -1] as const) {
    canvas.limb(head(1, [side * 2.7, 1.4, 0]), bit[side], 0.35, 0.35, strap);
    canvas.sphere(bit[side], 0.5, metal(ramp([170, 170, 176])));
  }
  return { bit, withers: at([0, 31, 8]) };
}

// ── Lagarto corredor ────────────────────────────────────────────────

const SCALES = ramp([92, 132, 70]);
const SCALES_DARK = ramp([54, 84, 44]);
const BELLY = ramp([206, 196, 140]);

/** Escamas: franjas oscuras en el lomo, vientre claro y textura de placas. */
const scaly: Material = (s) => {
  if (s.n[1] < -0.3) return tone(BELLY, s.light);
  const band = Math.sin(s.p[2] * 0.7) > 0.55 && s.n[1] > 0.2;
  const plate =
    noise(Math.floor(s.p[0] * 1.2), Math.floor(s.p[1] * 1.2), Math.floor(s.p[2] * 1.2)) > 0.7;
  return tone(band ? SCALES_DARK : SCALES, s.light, plate ? 1 : 0);
};

/**
 * Lagarto corredor: bípedo, con el cuerpo horizontal balanceado por una cola
 * larga, patas traseras fuertes con el tobillo alto (apoya los dedos),
 * bracitos, cuello curvo y cabeza alargada con cresta.
 */
const RUNNER_SIZE = 1.1;

function drawRunner(target: VolumeCanvas, frame: CharacterFrame): MountPose {
  const canvas = new Scaled(target, RUNNER_SIZE);
  const cycle = cyclePhase(frame);
  const running = cycle?.running === true;
  const walking = cycle !== null && !running;
  const t = cycle?.phase ?? 0;
  const amplitude = running ? 0.75 : walking ? 0.45 : 0;
  const leg = (offset: number): LegState =>
    amplitude === 0 ? STILL : legAt(t + offset, running ? 0.42 : 0.6, amplitude, running ? 1.3 : 1);
  const legs = { 1: leg(0), [-1]: leg(0.5) } as Record<1 | -1, LegState>;
  // Rebota dos veces por ciclo (una por pisada).
  const bounce = Math.abs(Math.sin(t * Math.PI * 2));
  const bob = running ? bounce * 2.2 - 0.4 : walking ? bounce * 0.6 : 0;
  const lean = running ? 0.1 : 0;
  const tailSway = Math.sin(t * Math.PI * 2) * (running ? 1.4 : 2.4);

  const pivot: Vec3 = [0, 30, 0];
  const at = (p: Vec3): Vec3 => add(add(pivot, pitch(sub(p, pivot), lean)), [0, bob, 0]);
  const along = axesAlong(pitch([0, 0, 1], lean));
  const body = scaly;

  // Patas: muslo grueso hacia adelante, pierna hacia atrás, tobillo alto y dedos.
  for (const side of [1, -1] as const) {
    const state = legs[side];
    const hip = at([side * 4.6, 29, -2.5]);
    const a1 = 0.55 + state.swing;
    const knee = add(hip, scale(bone(a1), 10));
    const ankle = add(knee, scale(bone(a1 - 1.25 - state.flex * 0.6), 10.5));
    const ball = add(ankle, scale(bone(a1 - 0.35 + state.flex * 0.9), 8));
    const ground = state.flex < 0.05 ? Math.min(ball[1], 1.2) : ball[1];
    const drop = ball[1] - ground;
    const lower = (p: Vec3): Vec3 => [p[0], p[1] - drop * 0.5, p[2]];
    canvas.ellipsoid(lerp(hip, knee, 0.4), axesAlong(sub(knee, hip)), [3.8, 3.8, 6.8], body);
    canvas.limb(knee, lower(ankle), 2.4, 1.5, body);
    canvas.sphere(lower(ankle), 1.6, body);
    canvas.limb(lower(ankle), lower(ball), 1.4, 1.2, body);
    // Tres dedos con garras.
    for (const toe of [-0.45, 0, 0.45]) {
      const tip = add(lower(ball), [side * 0.2 + toe * 2.2, -0.6, 3.6 - Math.abs(toe) * 1.2]);
      canvas.limb(lower(ball), tip, 0.9, 0.5, body);
      canvas.limb(tip, add(tip, [0, -0.5, 1]), 0.4, 0.15, solid(ramp([224, 218, 200])));
    }
  }

  // Cuerpo horizontal y cola larga que equilibra.
  canvas.ellipsoid(at([0, 31, 3]), along, [6.6, 7.2, 12.5], body);
  canvas.ellipsoid(at([0, 30, -6]), along, [6.2, 6.6, 7], body);
  let previous = at([0, 31, -10]);
  for (let i = 1; i <= 6; i++) {
    const k = i / 6;
    const next = at([tailSway * k * k * 2.2, 31 - k * 9 + k * k * 4, -10 - k * 25]);
    canvas.limb(previous, next, 5.2 * (1 - k) + 1.2, 5.2 * (1 - k - 1 / 6) + 1, body);
    previous = next;
  }
  // Cuello curvo y cabeza alargada con mandíbula y cresta.
  const neckBase = at([0, 34, 13]);
  const neckMid = at([0, 41, 19]);
  const skull = at([0, 45, 22.5]);
  canvas.limb(neckBase, neckMid, 4.8, 3.4, body);
  canvas.limb(neckMid, skull, 3.4, 3, body);
  const h = normalize(pitch([0, -0.15, 1], lean * 2 + (running ? -0.1 : 0)));
  const head = (d: number, o: Vec3 = [0, 0, 0]): Vec3 => add(add(skull, scale(h, d)), o);
  canvas.ellipsoid(head(2.2, [0, 0.6, 0]), axesAlong(h), [3.2, 3.2, 4.4], body);
  canvas.limb(head(4), head(10.5), 2.5, 1.6, body);
  canvas.limb(head(3, [0, -2, 0]), head(9.5, [0, -1.6, 0]), 1.7, 1.1, (s) => tone(BELLY, s.light));
  const crest = solid(ramp([196, 76, 48]));
  for (let i = 0; i < 4; i++)
    canvas.limb(
      head(3 - i * 1.6, [0, 2.6, 0]),
      head(1.5 - i * 1.6, [0, 5.2 - i * 0.6, -1.4]),
      0.8,
      0.2,
      crest,
    );
  for (const side of [1, -1] as const) {
    canvas.sphere(head(3.4, [side * 2.6, 1.2, 0]), 0.85, (s) =>
      s.light > 0.9 ? [255, 236, 120] : [196, 150, 30],
    );
    // Bracitos con garras.
    const shoulder = at([side * 4.4, 30, 11]);
    const elbow = add(shoulder, [side * 0.8, -4, 1.5]);
    canvas.limb(shoulder, elbow, 1.4, 1, body);
    canvas.limb(elbow, add(elbow, [0, -1.2, 3]), 1, 0.6, body);
  }

  const saddle = { y: 38.6, z: 2.5, girth: 7 };
  const at2 = (p: Vec3): Vec3 => at(p);
  drawSaddle(canvas, at2, () => along, saddle, ramp([60, 70, 130]));
  const bit = { 1: head(7, [1.9, -1.2, 0]), [-1]: head(7, [-1.9, -1.2, 0]) } as Record<
    1 | -1,
    Vec3
  >;
  for (const side of [1, -1] as const) canvas.sphere(bit[side], 0.55, metal(ramp([170, 170, 176])));
  const seatPoint = at([0, saddle.y, saddle.z]);
  return {
    seat: seatAt(seatPoint, saddle.girth, running ? bob * 0.5 : 0, RUNNER_SIZE),
    tack: (c, rider) => {
      const painter = new Scaled(c, RUNNER_SIZE);
      const hold = holdOf(rider, RUNNER_SIZE);
      drawStirrups(painter, at2, saddle, hold);
      drawReins(painter, { bit, withers: at([0, 38, 9]) }, hold);
    },
  };
}
