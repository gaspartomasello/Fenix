import type { FacialHair, HairStyle } from '@fenix/shared';
import type { Basis } from './humanoid-rig';
import type { Rgb } from './pixel-art';
import {
  clipping,
  metal,
  noise,
  normalize,
  ramp,
  scale,
  solid,
  tone,
  type Material,
  type Ramp,
  type Vec3,
  type VolumeCanvas,
} from './volume';

/**
 * Cabeza humana: no es una pelota sino un cráneo ovalado, una mandíbula más
 * angosta con mentón, el arco de las cejas (que deja los ojos en sombra) y
 * la nariz. Todo se ubica relativo a la cabeza, así gira con ella.
 */

/** Tamaño de la cabeza respecto de las medidas de abajo (cerca de 1/6,5 de la altura). */
const HEAD_SCALE = 0.86;

export const STEEL = ramp([126, 134, 148]);
export const GOLD = ramp([196, 156, 60]);
const EYE: Rgb = [28, 22, 30];
const EYE_WHITE: Rgb = [232, 228, 218];
const LIPS: Rgb = [168, 74, 72];

/** Ayudante para dibujar piezas relativas a la cabeza, ya escaladas. */
class HeadParts {
  constructor(
    readonly canvas: VolumeCanvas,
    readonly basis: Basis,
  ) {}

  at(offset: Vec3): Vec3 {
    return this.basis.at(scale(offset, HEAD_SCALE));
  }

  ellipsoid(offset: Vec3, radii: Vec3, material: Material): void {
    this.canvas.ellipsoid(this.at(offset), this.basis.axes, scale(radii, HEAD_SCALE), material);
  }

  limb(from: Vec3, to: Vec3, ra: number, rb: number, material: Material): void {
    this.canvas.limb(this.at(from), this.at(to), ra * HEAD_SCALE, rb * HEAD_SCALE, material);
  }

  decal(offset: Vec3, normal: Vec3, color: Rgb, width = 1, height = 1): void {
    this.canvas.decal(this.at(offset), this.basis.dir(normalize(normal)), color, width, height);
  }

  /** Material que recibe la normal en el sistema de la cabeza (para máscaras de pelo, casco…). */
  masked(mask: (n: Vec3, p: Vec3) => boolean, material: Material): Material {
    return clipping((s) => {
      const p = scale(this.basis.local(s.p), 1 / HEAD_SCALE);
      return mask(this.basis.localDir(s.n), p) ? material(s) : null;
    });
  }
}

/**
 * Forma de la cabeza (sin pelo): sirve igual para una persona y para una
 * calavera. La de mujer tiene la mandíbula más angosta y el mentón más fino.
 */
function drawSkull(head: HeadParts, skin: Material, female = false): void {
  head.ellipsoid([0, 0.6, -0.4], female ? [4, 4.8, 4.7] : [4.2, 4.9, 4.8], skin);
  head.ellipsoid([0, -2.3, 1.1], female ? [2.9, 3.1, 3.4] : [3.3, 3.3, 3.5], skin);
  head.ellipsoid([0, -4.2, 2.1], female ? [1.5, 1.2, 1.6] : [1.9, 1.4, 1.8], skin);
  // Arco de las cejas: hace sombra sobre los ojos.
  head.ellipsoid([0, 1, 3.5], female ? [2.9, 0.7, 1.1] : [3.1, 0.9, 1.3], skin);
  // Pómulos.
  for (const side of [1, -1] as const)
    head.ellipsoid([side * 2.2, -0.7, 2.5], female ? [1.2, 1, 1.3] : [1.3, 1.1, 1.3], skin);
}

export interface HeadLook {
  readonly skin: Ramp;
  readonly hair: Ramp;
  readonly hairStyle: HairStyle;
  readonly facialHair: FacialHair;
  readonly female: boolean;
  readonly headgear: 'cap' | 'helmet' | 'plate-helm' | 'wizard' | null;
  readonly capColor: Ramp;
  readonly hatColor: Ramp;
}

/** Cuello, cabeza, cara, pelo, barba y lo que tenga puesto en la cabeza. */
export function drawHumanHead(
  canvas: VolumeCanvas,
  basis: Basis,
  neck: Vec3,
  look: HeadLook,
): void {
  const head = new HeadParts(canvas, basis);
  canvas.limb(neck, head.at([0, -3.2, 0.2]), 1.9, 1.8, solid(look.skin, -1));
  drawSkull(head, solid(look.skin), look.female);
  head.ellipsoid(
    [0, -0.9, 4.3],
    look.female ? [0.55, 1.1, 0.75] : [0.65, 1.3, 0.9],
    solid(look.skin),
  );
  for (const side of [1, -1] as const)
    head.ellipsoid([side * 4.1, -0.5, 0.1], [0.6, 1.3, 0.9], solid(look.skin, -1));

  // Ojos, cejas y boca.
  for (const side of [1, -1] as const) {
    const normal: Vec3 = [side * 0.3, 0, 1];
    head.decal([side * 1.55, -0.1, 4.05], normal, EYE, 1, look.female ? 2 : 1);
    head.decal([side * 2.4, -0.1, 3.75], normal, EYE_WHITE);
    head.decal([side * 1.8, 1.25, 4.25], [side * 0.3, 0.3, 1], tone(look.hair, 0.3), 2, 1);
  }
  // Labios: más marcados en las mujeres.
  head.decal([0, -3, 4.3], [0, -0.2, 1], look.female ? LIPS : tone(look.skin, 0.15), 2, 1);

  const underHat =
    look.headgear === 'cap' || look.headgear === 'helmet' || look.headgear === 'plate-helm';
  drawHair(head, look.hair, look.hairStyle, underHat);
  drawFacialHair(head, look.hair, look.facialHair);

  if (look.headgear === 'helmet') drawHelmet(head);
  else if (look.headgear === 'plate-helm') drawPlateHelm(head);
  else if (look.headgear === 'cap') drawCap(head, look.capColor);
  else if (look.headgear === 'wizard') drawWizardHat(head, look.hatColor);
}

/**
 * Pelo: una cáscara apenas más grande que el cráneo, de la que se muestra
 * solo la parte que cubre según el peinado (nunca la cara).
 */
function drawHair(head: HeadParts, hair: Ramp, style: HairStyle, underHat: boolean): void {
  const strands: Material = (s) =>
    tone(hair, s.light, Math.floor(s.p[0] * 0.9 + s.p[1] * 0.3) % 3 === 0 ? -1 : 0);
  const covers = (n: Vec3): boolean => {
    if (n[2] > 0.3 && n[1] < 0.45) return false;
    if (style === 'bald') return n[1] > -0.3 && n[1] < 0.2 && n[2] < 0.05;
    return (
      n[1] > 0.15 ||
      (n[2] < -0.1 && n[1] > -0.55) ||
      (Math.abs(n[0]) > 0.75 && n[1] > -0.2 && n[2] < 0.1)
    );
  };
  const tie = solid(ramp([70, 40, 30]));
  if (!underHat || style === 'bald') {
    head.ellipsoid([0, 0.9, -0.6], [4.7, 5.25, 5.3], head.masked(covers, strands));
  }
  switch (style) {
    case 'long':
      head.limb(
        [0, 1, -3.4],
        [0, -9.5, -3.8],
        4.4,
        3.6,
        head.masked((n) => n[2] < 0.25, strands),
      );
      break;
    case 'ponytail':
      head.ellipsoid([0, 0.8, -5.3], [1.4, 1.4, 1.2], tie);
      head.limb([0, 0.4, -6], [0, -8.5, -6.8], 1.9, 1.1, strands);
      break;
    case 'bob':
      // Melena a la altura de la mandíbula, con flequillo.
      head.ellipsoid(
        [0, -0.6, -0.5],
        [5.2, 4.6, 5.6],
        head.masked((n, p) => !(n[2] > 0.25 && p[1] < 1.6) && p[1] > -4.4, strands),
      );
      break;
    case 'bun':
      head.ellipsoid([0, 3.6, -4.3], [2.3, 2.2, 2.1], strands);
      head.ellipsoid([0, 2.6, -3.9], [1.6, 0.6, 1.4], tie);
      break;
    case 'braid':
      // Trenza: eslabones alternados que bajan por la espalda.
      for (let i = 0; i < 7; i++) {
        head.ellipsoid([i % 2 ? 0.4 : -0.4, -1 - i * 1.5, -5 - i * 0.12], [1.3, 1, 1.1], strands);
      }
      head.ellipsoid([0, -11.6, -5.9], [0.9, 0.7, 0.9], tie);
      break;
    case 'curly':
      // Rulos: bolitas sobre la cáscara del pelo, que dan volumen irregular.
      for (let i = 0; i < 40; i++) {
        const a = noise(i, 1) * Math.PI * 2;
        const b = noise(i, 2) * 1.9 - 0.35;
        const n: Vec3 = [Math.cos(b) * Math.sin(a), Math.sin(b), Math.cos(b) * Math.cos(a)];
        if (!covers(n)) continue;
        head.ellipsoid([n[0] * 5, 0.9 + n[1] * 5.4, -0.6 + n[2] * 5.4], [1.5, 1.5, 1.5], strands);
      }
      break;
    case 'pigtails':
      for (const side of [1, -1] as const) {
        head.ellipsoid([side * 4.4, 0.4, -1.8], [1.1, 1.1, 1.1], tie);
        head.limb([side * 5, -0.4, -2], [side * 5.6, -7.5, -2.4], 1.7, 0.9, strands);
      }
      break;
    default:
      break;
  }
}

function drawFacialHair(head: HeadParts, hair: Ramp, kind: FacialHair): void {
  if (kind === 'none') return;
  if (kind === 'beard') {
    head.ellipsoid(
      [0, -3, 1.6],
      [3.5, 2.9, 3.4],
      head.masked(
        (n) => n[1] < 0.25 && n[2] > -0.35,
        (s) => tone(hair, s.light, -1),
      ),
    );
  }
  for (const side of [1, -1] as const) {
    head.decal([side * 0.8, -2.35, 4.55], [0, -0.1, 1], tone(hair, 0.4), 2, 1);
  }
}

function drawCap(head: HeadParts, leather: Ramp): void {
  head.ellipsoid(
    [0, 1.1, -0.5],
    [4.7, 5.3, 5.2],
    head.masked((n) => n[1] > 0.32, solid(leather)),
  );
  head.ellipsoid([0, 3.2, 0.1], [5.2, 0.6, 5.4], solid(leather, -1));
}

function drawHelmet(head: HeadParts): void {
  head.ellipsoid(
    [0, 0.8, -0.4],
    [4.9, 5.6, 5.4],
    head.masked(
      (n) => !(n[2] > 0.45 && n[1] < 0.3 && Math.abs(n[0]) < 0.6) && n[1] > -0.5,
      (s) =>
        Math.abs(s.p[1] - head.at([0, 0.2, 0])[1]) < 0.5
          ? tone(STEEL, s.light, 1)
          : metal(STEEL)(s),
    ),
  );
  head.limb([0, 3.4, 5], [0, -1.2, 4.9], 0.7, 0.6, metal(STEEL));
}

/** Yelmo cerrado: cubre toda la cabeza, con ranura para los ojos, respiraderos y cresta. */
function drawPlateHelm(head: HeadParts): void {
  head.ellipsoid([0, 0.4, 0.1], [5.1, 6.1, 5.6], metal(STEEL));
  head.decal([0, 0.2, 5.6], [0, 0, 1], [20, 18, 22], 5, 1);
  head.decal([0, -2.8, 5.4], [0, -0.2, 1], [40, 38, 44], 1, 2);
  head.limb([0, 6.4, -4.4], [0, 6.6, 3.4], 0.6, 0.5, metal(STEEL));
}

function drawWizardHat(head: HeadParts, cloth: Ramp): void {
  const hat = solid(cloth, -1);
  head.ellipsoid([0, 3.4, 0], [6.4, 0.8, 6.4], hat);
  const band = head.at([0, 6, 0])[1];
  head.limb([0, 4, 0], [1, 12.5, -2.3], 4.4, 0.4, (s) =>
    Math.abs(s.p[1] - band) < 0.6 ? tone(GOLD, s.light) : hat(s),
  );
}

/** Calavera del esqueleto: la misma forma, con cuencas vacías y dientes. */
export function drawSkullHead(canvas: VolumeCanvas, basis: Basis, bone: Ramp): void {
  const head = new HeadParts(canvas, basis);
  drawSkull(head, solid(bone));
  head.ellipsoid([0, -4.6, 1.6], [2.6, 1.2, 2.4], solid(bone, -1));
  for (const side of [1, -1] as const) {
    head.decal([side * 1.6, -0.2, 4], [side * 0.3, 0, 1], [16, 10, 12], 2, 2);
  }
  head.decal([0, -1.9, 4.3], [0, 0, 1], [40, 30, 30]);
  head.decal([0, -4.1, 3.8], [0, -0.3, 1], [90, 80, 70], 3, 1);
}
