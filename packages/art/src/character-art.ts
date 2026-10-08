import {
  Direction,
  ITEMS,
  type Appearance,
  type EquipmentLook,
  type FacialHair,
  type HairStyle,
  type ItemKind,
  type NpcRole,
} from '@fenix/shared';
import { hexToRgb, type PixelImage, type Rgb } from './pixel-art';
import {
  Camera,
  VolumeCanvas,
  add,
  axesAlong,
  cross,
  lerp,
  metal,
  noise,
  normalize,
  ramp,
  scale,
  solid,
  sub,
  tone,
  vec,
  type Material,
  type Ramp,
  type Vec3,
} from './volume';

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

/** `idle` = parado; 0..3 = ciclo de caminata (contacto, paso, contacto, paso). */
export type CharacterFrame = 'idle' | 0 | 1 | 2 | 3;
export const WALK_FRAMES: readonly CharacterFrame[] = [0, 1, 2, 3];

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

/** Color del contorno de todos los sprites. */
export const OUTLINE: Rgb = [24, 17, 14];

// ── Esqueleto animado ───────────────────────────────────────────────

/** Ángulos de la caminata: muslo (adelante +) y rodilla (doblada +) de cada pierna. */
interface LegPose {
  readonly thigh: number;
  readonly knee: number;
}

interface WalkPose {
  readonly right: LegPose;
  readonly left: LegPose;
}

const STAND: LegPose = { thigh: 0, knee: 0.04 };
const FORWARD: LegPose = { thigh: 0.42, knee: 0.08 };
const BACK: LegPose = { thigh: -0.4, knee: 0.3 };
const PASSING: LegPose = { thigh: 0.22, knee: 0.85 };

function walkPose(frame: CharacterFrame): WalkPose {
  switch (frame) {
    case 'idle':
      return { right: STAND, left: STAND };
    case 0:
      return { right: FORWARD, left: BACK };
    case 1:
      return { right: STAND, left: PASSING };
    case 2:
      return { right: BACK, left: FORWARD };
    case 3:
      return { right: PASSING, left: STAND };
  }
}

/** Dirección de un hueso que cuelga, girado hacia adelante `angle` radianes. */
const hanging = (angle: number, outward = 0): Vec3 =>
  normalize([outward, -Math.cos(angle), Math.sin(angle)]);

export interface Rig {
  readonly hip: Vec3;
  readonly chest: Vec3;
  readonly neck: Vec3;
  readonly head: Vec3;
  /** Por lado: 1 = derecha, -1 = izquierda. */
  readonly legs: Readonly<Record<1 | -1, { hip: Vec3; knee: Vec3; ankle: Vec3; toe: Vec3 }>>;
  readonly arms: Readonly<Record<1 | -1, { shoulder: Vec3; elbow: Vec3; hand: Vec3 }>>;
}

const THIGH = 12;
const SHIN = 12;
const UPPER_ARM = 8.5;
const FOREARM = 8;

/**
 * Arma el esqueleto de un humanoide para un frame. Los pies que pisan quedan
 * siempre en el suelo: el cuerpo sube y baja solo con la caminata.
 * `armed`: la mano derecha sostiene un arma (antebrazo más adelante).
 */
export function humanoidRig(frame: CharacterFrame, armed: boolean): Rig {
  const pose = walkPose(frame);
  const hipHeight = 28;
  const legFor = (side: 1 | -1, leg: LegPose) => {
    const hip: Vec3 = [side * 3.4, hipHeight, 0];
    const knee = add(hip, scale(hanging(leg.thigh), THIGH));
    const ankle = add(knee, scale(hanging(leg.thigh - leg.knee), SHIN));
    return { hip, knee, ankle, toe: add(ankle, [0, -1.2, 4.2]) };
  };
  let legs = { 1: legFor(1, pose.right), [-1]: legFor(-1, pose.left) } as Rig['legs'];
  // Baja todo para que el pie más bajo apoye en el suelo (tobillo a 3 px).
  const drop = Math.min(legs[1].ankle[1], legs[-1].ankle[1]) - 3;
  const lower = (p: Vec3): Vec3 => [p[0], p[1] - drop, p[2]];
  legs = {
    1: mapJoints(legs[1], lower),
    [-1]: mapJoints(legs[-1], lower),
  } as Rig['legs'];

  const hip = lower([0, hipHeight, 0]);
  const shoulderY = hip[1] + 14;
  const armFor = (side: 1 | -1, swing: number) => {
    const shoulder: Vec3 = [side * 7.2, shoulderY, 0];
    const elbow = add(shoulder, scale(hanging(swing, side * 0.12), UPPER_ARM));
    const bend = side === 1 && armed ? 0.95 : 0.3;
    const hand = add(elbow, scale(hanging(swing + bend, side * 0.05), FOREARM));
    return { shoulder, elbow, hand };
  };
  // Los brazos van al revés que las piernas.
  const arms = {
    1: armFor(1, -pose.right.thigh * 0.8),
    [-1]: armFor(-1, -pose.left.thigh * 0.8),
  } as Rig['arms'];

  return {
    hip,
    chest: [0, hip[1] + 9.5, 0.2],
    neck: [0, hip[1] + 16.5, 0.3],
    head: [0, hip[1] + 24, 0.6],
    legs,
    arms,
  };
}

function mapJoints<T extends Record<string, Vec3>>(joints: T, f: (p: Vec3) => Vec3): T {
  return Object.fromEntries(Object.entries(joints).map(([k, v]) => [k, f(v)])) as T;
}

// ── Colores ─────────────────────────────────────────────────────────

/** Color de un objeto puesto, si tiene. */
function wornColor(kind: ItemKind | undefined): Rgb | null {
  const color = kind ? ITEMS[kind].color : undefined;
  return color === undefined ? null : hexToRgb(color);
}

const STEEL = ramp([126, 134, 148]);
const GOLD = ramp([196, 156, 60]);
const WOOD = ramp([118, 78, 44]);
const LEATHER_DARK = ramp([92, 60, 36]);
const LINEN = ramp([214, 206, 186]);

interface Palette {
  readonly skin: Ramp;
  readonly cloth: Ramp;
  readonly hair: Ramp;
  readonly pants: Ramp;
  readonly boots: Ramp;
  readonly belt: Ramp;
}

function paletteFor(appearance: Appearance, equipment: EquipmentLook): Palette {
  return {
    skin: ramp(hexToRgb(appearance.skinTone)),
    cloth: ramp(hexToRgb(appearance.clothHue)),
    hair: ramp(hexToRgb(appearance.hairHue)),
    pants: ramp(wornColor(equipment.legs) ?? [78, 62, 46]),
    boots: ramp(wornColor(equipment.feet) ?? [52, 38, 28]),
    belt: ramp([70, 48, 30]),
  };
}

/** Ropa de trabajo de los personajes del pueblo. */
type Outfit = 'apron' | 'robe' | 'innkeeper' | 'vest';
const OUTFITS: Readonly<Record<NpcRole, Outfit>> = {
  blacksmith: 'apron',
  mage: 'robe',
  innkeeper: 'innkeeper',
  banker: 'vest',
};

// ── Personaje ───────────────────────────────────────────────────────

/**
 * Dibuja un frame del personaje mirando en `direction`, con lo que tenga
 * puesto. `role` viste a los personajes del pueblo con su ropa de oficio.
 */
export function drawCharacterFrame(
  appearance: Appearance,
  direction: Direction,
  frame: CharacterFrame,
  equipment: EquipmentLook = {},
  role: NpcRole | null = null,
): PixelImage {
  const camera = cameraFor(direction);
  const canvas = new VolumeCanvas(CHARACTER_ART_WIDTH, CHARACTER_ART_HEIGHT, camera);
  const palette = paletteFor(appearance, equipment);
  const outfit = role ? OUTFITS[role] : null;
  const rig = humanoidRig(frame, equipment.rightHand !== undefined);

  drawLegs(canvas, rig, palette, outfit);
  drawTorso(canvas, rig, palette, equipment, outfit);
  drawArms(canvas, rig, palette, equipment, outfit);
  drawHead(canvas, rig, palette, appearance, equipment, outfit);
  if (equipment.cloak)
    drawCloak(canvas, rig, ramp(wornColor(equipment.cloak) ?? [120, 30, 40]), frame);
  if (equipment.leftHand) drawShield(canvas, rig, equipment.leftHand);
  if (equipment.rightHand) drawWeapon(canvas, rig, equipment.rightHand);
  return canvas.toImage(OUTLINE);
}

function drawLegs(canvas: VolumeCanvas, rig: Rig, p: Palette, outfit: Outfit | null): void {
  for (const side of [1, -1] as const) {
    const leg = rig.legs[side];
    // Pantalón hasta la caña de la bota; bota con borde claro.
    const legMaterial: Material = (s) => {
      if (s.p[1] < 9) return tone(p.boots, s.light, s.p[1] > 8 ? 1 : 0);
      return tone(p.pants, s.light);
    };
    canvas.limb(leg.hip, leg.knee, 3.3, 2.8, legMaterial);
    canvas.limb(leg.knee, leg.ankle, 2.8, 2.3, legMaterial);
    canvas.ellipsoid(
      lerp(leg.ankle, leg.toe, 0.55),
      axesAlong(sub(leg.toe, leg.ankle)),
      [2.4, 1.7, 3.6],
      solid(p.boots),
    );
  }
  if (outfit === 'robe') {
    // Túnica larga: discos cada vez más anchos de la cintura al suelo.
    const robe: Material = (s) => tone(p.cloth, s.light, Math.sin(s.p[0] * 0.9) > 0.6 ? -1 : 0);
    for (let y = rig.hip[1] + 1; y >= 2; y -= 1) {
      const t = (rig.hip[1] + 1 - y) / (rig.hip[1] - 1);
      canvas.ellipsoid([0, y, -0.3 * t], AXES, [5.6 + t * 3.2, 1.4, 4.4 + t * 2.4], robe);
    }
  }
}

function torsoMaterial(
  p: Palette,
  equipment: EquipmentLook,
  outfit: Outfit | null,
  hipY: number,
): Material {
  const armor = equipment.torso;
  const leather = armor === 'leather-armor' ? ramp(wornColor(armor) ?? [122, 78, 42]) : null;
  return (s) => {
    const y = s.p[1] - hipY;
    const front = s.n[2] > 0.35;
    // Cinturón con hebilla.
    if (y > -0.6 && y < 1.8 && outfit !== 'robe') {
      if (front && Math.abs(s.p[0]) < 1.3) return tone(GOLD, s.light);
      return tone(p.belt, s.light);
    }
    if (armor === 'chainmail' && y > -4) {
      // Malla: anillos alternados.
      const ring = (s.x + s.y * 2) % 3 === 0 ? -1 : (s.x + s.y) % 2 === 0 ? 1 : 0;
      return tone(STEEL, s.light, ring);
    }
    if (leather && y > 0) {
      // Pechera: costuras horizontales y remaches.
      if (Math.abs(((y + 0.5) % 4.5) - 0.5) < 0.45) return tone(leather, s.light, -1);
      if (front && Math.abs(Math.abs(s.p[0]) - 3.2) < 0.5 && Math.round(y) % 3 === 0)
        return tone(GOLD, s.light, 1);
      return tone(leather, s.light);
    }
    if (outfit === 'vest' && y > 0) {
      // Chaleco oscuro abierto sobre camisa blanca, con botones dorados.
      if (front && Math.abs(s.p[0]) < 1.6) {
        return Math.abs(s.p[0]) < 0.5 && Math.round(y) % 3 === 0
          ? tone(GOLD, s.light, 1)
          : tone(LINEN, s.light);
      }
      return tone(ramp([46, 40, 58]), s.light);
    }
    // Camisa: escote en V y una sombra suave en los pliegues.
    if (front && y > 12 && Math.abs(s.p[0]) < 2.2 - (y - 12) * 0) {
      if (Math.abs(s.p[0]) < (y - 11.5) * 0.7) return tone(p.skin, s.light, -1);
    }
    return tone(p.cloth, s.light, noise(Math.floor(s.p[0] / 2), Math.floor(y / 3)) > 0.82 ? -1 : 0);
  };
}

function drawTorso(
  canvas: VolumeCanvas,
  rig: Rig,
  p: Palette,
  equipment: EquipmentLook,
  outfit: Outfit | null,
): void {
  const material = torsoMaterial(p, equipment, outfit, rig.hip[1]);
  const [, hy] = rig.hip;
  canvas.ellipsoid([0, hy + 0.5, 0], AXES, [5.3, 3.8, 3.5], material);
  canvas.ellipsoid([0, hy + 4.5, 0.1], AXES, [4.9, 3.6, 3.2], material);
  canvas.ellipsoid(rig.chest, AXES, [6.3, 6.4, 3.9], material);
  // Faldón de la camisa debajo del cinturón.
  if (outfit !== 'robe' && equipment.torso !== 'chainmail') {
    canvas.ellipsoid([0, hy - 2.2, 0], AXES, [5.5, 2.6, 3.7], solid(p.cloth, -1));
  }
  if (equipment.torso === 'leather-armor' || equipment.torso === 'chainmail') {
    // Hombreras.
    const pad =
      equipment.torso === 'chainmail'
        ? metal(STEEL)
        : solid(ramp(wornColor(equipment.torso) ?? [122, 78, 42]), 1);
    for (const side of [1, -1] as const) {
      canvas.ellipsoid(
        add(rig.arms[side].shoulder, [side * 0.4, 0.8, 0]),
        AXES,
        [3.2, 2.4, 3.3],
        pad,
      );
    }
  }
  if (outfit === 'apron') {
    const front = (x: number, y: number, z: number): Vec3 => [x, y, z];
    canvas.polygon(
      [
        front(-4.4, hy + 13, 4.1),
        front(4.4, hy + 13, 4.1),
        front(5.6, hy - 12, 5.4),
        front(-5.6, hy - 12, 5.4),
      ],
      (s) => tone(LEATHER_DARK, s.light + 0.15, Math.abs(s.p[0]) > 4.4 ? -1 : 0),
    );
  }
  if (outfit === 'innkeeper') {
    canvas.polygon(
      [
        [-4.9, hy + 1.5, 3.9],
        [4.9, hy + 1.5, 3.9],
        [5.4, hy - 11, 4.9],
        [-5.4, hy - 11, 4.9],
      ],
      (s) => tone(LINEN, s.light + 0.2, Math.round(s.p[0] * 0.7) % 3 === 0 ? -1 : 0),
    );
  }
}

function drawArms(
  canvas: VolumeCanvas,
  rig: Rig,
  p: Palette,
  equipment: EquipmentLook,
  outfit: Outfit | null,
): void {
  const chainmail = equipment.torso === 'chainmail';
  const sleeve: Material = chainmail
    ? metal(STEEL)
    : outfit === 'vest'
      ? solid(LINEN)
      : solid(p.cloth);
  // Herrero y tabernero trabajan con las mangas arremangadas.
  const bareForearms = outfit === 'apron' || outfit === 'innkeeper';
  for (const side of [1, -1] as const) {
    const arm = rig.arms[side];
    canvas.limb(arm.shoulder, arm.elbow, 2.5, 2.2, sleeve);
    canvas.limb(arm.elbow, arm.hand, 2.2, 1.9, bareForearms ? solid(p.skin) : sleeve);
    canvas.sphere(arm.hand, 1.9, solid(p.skin));
  }
}

// ── Cabeza ──────────────────────────────────────────────────────────

const EYE: Rgb = [28, 22, 30];

function drawHead(
  canvas: VolumeCanvas,
  rig: Rig,
  p: Palette,
  appearance: Appearance,
  equipment: EquipmentLook,
  outfit: Outfit | null,
): void {
  const head = rig.head;
  canvas.limb(rig.neck, add(rig.neck, [0, 3, 0.3]), 2.3, 2.3, solid(p.skin, -1));
  canvas.ellipsoid(head, AXES, [5.4, 6, 5.3], solid(p.skin));
  // Nariz y orejas: el volumen las sombrea solo.
  canvas.sphere(add(head, [0, -0.8, 5.2]), 1, solid(p.skin));
  for (const side of [1, -1] as const) {
    canvas.ellipsoid(add(head, [side * 5.2, -0.2, -0.2]), AXES, [0.9, 1.6, 1.1], solid(p.skin, -1));
  }
  drawFace(canvas, head, p);

  const style: HairStyle = appearance.hairStyle ?? 'short';
  const headgear = equipment.head;
  if (style !== 'bald' || !headgear) drawHair(canvas, head, p.hair, style, headgear !== undefined);
  drawFacialHair(canvas, head, p.hair, appearance.facialHair ?? 'none');

  if (headgear === 'iron-helmet') drawHelmet(canvas, head);
  else if (headgear) drawCap(canvas, head, ramp(wornColor(headgear) ?? [122, 78, 42]));
  else if (outfit === 'robe') drawWizardHat(canvas, head, p.cloth);
}

function drawFace(canvas: VolumeCanvas, head: Vec3, p: Palette): void {
  for (const side of [1, -1] as const) {
    const eye = add(head, [side * 2, 0.6, 4.9]);
    const normal = normalize([side * 0.35, 0.1, 1]);
    canvas.decal(eye, normal, EYE, 1, 2);
    canvas.decal(add(eye, [side * 0.9, 0, -0.3]), normal, [236, 232, 222]);
    // Cejas.
    canvas.decal(add(head, [side * 2.1, 2.5, 4.8]), normal, tone(p.hair, 0.3), 2, 1);
  }
  canvas.decal(add(head, [0, -2.9, 5]), [0, -0.2, 1], tone(p.skin, 0.2), 2, 1);
}

/**
 * Pelo: una cáscara apenas más grande que la cabeza, de la que se muestra
 * solo la parte que cubre según el peinado (nunca la cara).
 */
function drawHair(
  canvas: VolumeCanvas,
  head: Vec3,
  hair: Ramp,
  style: HairStyle,
  underHat: boolean,
): void {
  const strands: Material = (s) =>
    tone(hair, s.light, Math.floor(s.p[0] * 0.8 + s.p[1] * 0.25) % 3 === 0 ? -1 : 0);
  const covers = (n: Vec3): boolean => {
    const face = n[2] > 0.3 && n[1] < 0.38;
    if (face) return false;
    if (style === 'bald') return n[1] > -0.25 && n[1] < 0.15 && n[2] < 0.1;
    return (
      n[1] > 0.12 ||
      (n[2] < -0.1 && n[1] > -0.55) ||
      (Math.abs(n[0]) > 0.8 && n[1] > -0.25 && n[2] < 0.05)
    );
  };
  if (!underHat || style === 'bald') {
    canvas.ellipsoid(add(head, [0, 0.5, -0.3]), AXES, [6, 6.4, 5.9], (s) =>
      covers(s.n) ? strands(s) : null,
    );
  }
  if (style === 'long') {
    canvas.limb(add(head, [0, 1, -3.2]), add(head, [0, -10, -3.6]), 5.2, 4.2, (s) =>
      s.n[2] < 0.25 ? strands(s) : null,
    );
  }
  if (style === 'ponytail') {
    canvas.sphere(add(head, [0, 1, -5.6]), 1.6, solid(ramp([70, 40, 30])));
    canvas.limb(add(head, [0, 0.5, -6.4]), add(head, [0, -9, -7.2]), 2.1, 1.2, strands);
  }
}

function drawFacialHair(canvas: VolumeCanvas, head: Vec3, hair: Ramp, kind: FacialHair): void {
  if (kind === 'none') return;
  if (kind === 'beard') {
    canvas.ellipsoid(add(head, [0, -3.4, 2.6]), AXES, [4.3, 3.6, 3], (s) =>
      s.n[1] < 0.2 ? tone(hair, s.light, -1) : null,
    );
  }
  for (const side of [1, -1] as const) {
    canvas.decal(add(head, [side * 1, -2.1, 5.2]), [0, -0.1, 1], tone(hair, 0.4), 2, 1);
  }
}

function drawCap(canvas: VolumeCanvas, head: Vec3, leather: Ramp): void {
  canvas.ellipsoid(add(head, [0, 1, -0.2]), AXES, [6.2, 6.6, 6.1], (s) =>
    s.n[1] > 0.3 ? tone(leather, s.light) : null,
  );
  canvas.ellipsoid(add(head, [0, 3.3, 0.2]), AXES, [6.5, 0.8, 6.5], solid(leather, -1));
}

function drawHelmet(canvas: VolumeCanvas, head: Vec3): void {
  canvas.ellipsoid(add(head, [0, 0.6, -0.2]), AXES, [6.3, 6.8, 6.2], (s) => {
    const window = s.n[2] > 0.45 && s.n[1] < 0.28 && Math.abs(s.n[0]) < 0.62;
    if (window || s.n[1] < -0.45) return null;
    return s.p[1] - head[1] > -1 && s.p[1] - head[1] < 0.4
      ? tone(STEEL, s.light, 1)
      : metal(STEEL)(s);
  });
  canvas.limb(add(head, [0, 3.5, 6.1]), add(head, [0, -1.6, 6.2]), 0.7, 0.6, metal(STEEL));
}

function drawWizardHat(canvas: VolumeCanvas, head: Vec3, cloth: Ramp): void {
  const hat = solid(cloth, -1);
  canvas.ellipsoid(add(head, [0, 3.6, 0]), AXES, [7.6, 0.9, 7.6], hat);
  canvas.limb(add(head, [0, 4.5, 0]), add(head, [1.2, 13, -2.5]), 5.2, 0.4, (s) =>
    Math.abs(s.p[1] - head[1] - 6) < 0.6 ? tone(GOLD, s.light) : hat(s),
  );
}

// ── Equipo ──────────────────────────────────────────────────────────

function drawCloak(canvas: VolumeCanvas, rig: Rig, cloak: Ramp, frame: CharacterFrame): void {
  const top = rig.arms[1].shoulder[1] + 1;
  const sway = frame === 1 || frame === 3 ? 1.6 : frame === 'idle' ? 0 : 0.8;
  const folds: Material = (s) => tone(cloak, s.light * 0.9, Math.sin(s.p[0] * 1.3) > 0.55 ? -1 : 0);
  canvas.polygon(
    [
      [-7.6, top, -2.8],
      [7.6, top, -2.8],
      [9.6, 9, -6 - sway],
      [-9.6, 9, -6 - sway],
    ],
    folds,
  );
  // Esclavina sobre los hombros y broche.
  canvas.ellipsoid([0, top - 0.6, -0.4], AXES, [8.4, 2.5, 4.6], solid(cloak));
  canvas.sphere([0, top - 1.6, 4.1], 1, metal(GOLD));
}

function drawShield(canvas: VolumeCanvas, rig: Rig, kind: ItemKind): void {
  const hand = rig.arms[-1].hand;
  const center = add(hand, [-1.6, 3, 1.2]);
  const facing = normalize([-0.8, 0, 0.6]);
  const axes = axesAlong(facing);
  const wood = ramp(wornColor(kind) ?? [138, 90, 46]);
  canvas.ellipsoid(center, axes, [5.4, 6, 0.9], (s) => {
    const d = Math.hypot(...sub(s.p, center));
    if (d > 4.7) return tone(STEEL, s.light);
    if (d < 1.4) return metal(GOLD)(s);
    const plank = Math.floor((s.p[1] - center[1]) * 0.55) % 2 === 0 ? 0 : -1;
    return tone(wood, s.light, plank);
  });
}

function drawWeapon(canvas: VolumeCanvas, rig: Rig, kind: ItemKind): void {
  const hand = rig.arms[1].hand;
  // Se sostiene apuntando hacia adelante y un poco abajo.
  const dir = normalize([0.12, -0.45, 0.88]);
  const side = normalize(cross(dir, [0, 1, 0]));
  const along = (k: number): Vec3 => add(hand, scale(dir, k));
  const grip = solid(ramp([84, 56, 34]));

  if (kind === 'axe' || kind === 'pickaxe') {
    canvas.limb(along(-3), along(12), 0.75, 0.75, solid(WOOD));
    if (kind === 'axe') {
      const head = along(10.5);
      canvas.polygon(
        [
          add(head, scale(side, 0.5)),
          add(head, [0, 2.6, 0]),
          add(add(head, scale(side, 4.4)), [0, 3.4, 0]),
          add(add(head, scale(side, 4.4)), [0, -2.6, 0]),
          add(head, [0, -1.8, 0]),
        ],
        metal(STEEL),
      );
    } else {
      const head = along(11.5);
      canvas.limb(add(head, scale(side, -4.2)), add(head, [0, 1.2, 0]), 0.5, 0.9, metal(STEEL));
      canvas.limb(add(head, [0, 1.2, 0]), add(head, scale(side, 4.2)), 0.9, 0.5, metal(STEEL));
    }
    return;
  }

  const length = kind === 'dagger' ? 6 : 13;
  canvas.limb(along(-2), along(1.2), 0.8, 0.8, grip);
  canvas.sphere(along(-2.4), 0.9, metal(GOLD));
  canvas.limb(
    add(along(1.6), scale(side, -2.4)),
    add(along(1.6), scale(side, 2.4)),
    0.6,
    0.6,
    metal(GOLD),
  );
  canvas.limb(along(2), along(2 + length), 0.85, 0.35, metal(STEEL));
}

// ── Esqueleto (la criatura) ─────────────────────────────────────────

const BONE = ramp([226, 218, 196]);

/** Esqueleto: huesos finos, costillas con huecos, calavera y una espada oxidada. */
export function drawSkeletonFrame(direction: Direction, frame: CharacterFrame): PixelImage {
  const canvas = new VolumeCanvas(CHARACTER_ART_WIDTH, CHARACTER_ART_HEIGHT, cameraFor(direction));
  const rig = humanoidRig(frame, true);
  const bone = solid(BONE);

  for (const side of [1, -1] as const) {
    const leg = rig.legs[side];
    canvas.limb(leg.hip, leg.knee, 1.3, 1.1, bone);
    canvas.sphere(leg.knee, 1.6, bone);
    canvas.limb(leg.knee, leg.ankle, 1.1, 1, bone);
    canvas.ellipsoid(
      lerp(leg.ankle, leg.toe, 0.5),
      axesAlong(sub(leg.toe, leg.ankle)),
      [1.6, 1, 3],
      bone,
    );
    const arm = rig.arms[side];
    canvas.limb(arm.shoulder, arm.elbow, 1.1, 1, bone);
    canvas.sphere(arm.elbow, 1.3, bone);
    canvas.limb(arm.elbow, arm.hand, 1, 0.9, bone);
    canvas.sphere(arm.hand, 1.4, bone);
    canvas.sphere(arm.shoulder, 1.8, bone);
  }
  // Pelvis, columna y costillas (bandas con huecos).
  canvas.ellipsoid(rig.hip, AXES, [4.6, 2.4, 2.8], bone);
  canvas.limb(rig.hip, rig.neck, 1.2, 1.1, solid(BONE, -1));
  canvas.ellipsoid(rig.chest, AXES, [5.8, 5.6, 3.6], (s) =>
    ((s.p[1] - rig.chest[1] + 20) % 2.6 < 1.25 || Math.abs(s.p[0]) < 0.8) &&
    s.p[1] > rig.chest[1] - 4.5
      ? tone(BONE, s.light)
      : null,
  );
  canvas.ellipsoid(add(rig.chest, [0, 4.6, 0]), AXES, [6.8, 1.2, 2.6], bone);
  // Calavera.
  const head = rig.head;
  canvas.ellipsoid(head, AXES, [5, 5.4, 5], bone);
  canvas.ellipsoid(add(head, [0, -4.4, 1.6]), AXES, [3.2, 1.6, 2.8], solid(BONE, -1));
  for (const side of [1, -1] as const) {
    canvas.decal(
      add(head, [side * 2, 0.3, 4.6]),
      normalize([side * 0.35, 0, 1]),
      [16, 10, 12],
      2,
      2,
    );
  }
  canvas.decal(add(head, [0, -1.8, 5]), [0, 0, 1], [40, 30, 30], 1, 1);
  canvas.decal(add(head, [0, -4.2, 4.2]), [0, -0.3, 1], [90, 80, 70], 3, 1);

  drawWeapon(canvas, rig, 'short-sword');
  return canvas.toImage(OUTLINE);
}

const AXES: readonly [Vec3, Vec3, Vec3] = [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)];
