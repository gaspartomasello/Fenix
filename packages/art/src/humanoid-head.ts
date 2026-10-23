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
  type Sample,
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

  /** Material que recibe el punto y la normal en el sistema de la cabeza. */
  local(paint: (p: Vec3, n: Vec3, s: Sample) => Rgb | null): Material {
    return clipping((s) =>
      paint(scale(this.basis.local(s.p), 1 / HEAD_SCALE), this.basis.localDir(s.n), s),
    );
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
  readonly headgear:
    | 'cap'
    | 'helmet'
    | 'plate-helm'
    | 'wizard'
    | 'straw-hat'
    | 'feathered-hat'
    | 'tricorne'
    | 'bandana'
    | 'skull'
    | 'kabuto'
    | 'galea'
    | 'great-helm'
    | null;
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
    look.headgear === 'cap' ||
    look.headgear === 'helmet' ||
    look.headgear === 'plate-helm' ||
    look.headgear === 'bandana' ||
    look.headgear === 'skull' ||
    look.headgear === 'kabuto' ||
    look.headgear === 'galea' ||
    look.headgear === 'great-helm';
  drawHair(head, look.hair, look.hairStyle, underHat);
  // Bajo una máscara o un yelmo cerrado no asoma la barba.
  if (look.headgear !== 'skull' && look.headgear !== 'plate-helm' && look.headgear !== 'great-helm')
    drawFacialHair(head, look.hair, look.facialHair);

  if (look.headgear === 'helmet') drawHelmet(head);
  else if (look.headgear === 'plate-helm') drawPlateHelm(head);
  else if (look.headgear === 'cap') drawCap(head, look.capColor);
  else if (look.headgear === 'wizard') drawWizardHat(head, look.hatColor);
  else if (look.headgear === 'straw-hat') drawWideHat(head, look.capColor, 'straw');
  else if (look.headgear === 'feathered-hat') drawWideHat(head, look.capColor, 'feather');
  else if (look.headgear === 'tricorne') drawWideHat(head, look.capColor, 'tricorne');
  else if (look.headgear === 'bandana') drawBandana(head, look.capColor);
  else if (look.headgear === 'skull') drawBoneHelm(head);
  else if (look.headgear === 'kabuto') drawKabuto(head, look.capColor);
  else if (look.headgear === 'galea') drawGalea(head);
  else if (look.headgear === 'great-helm') drawGreatHelm(head);
}

/** Sombrero de ala ancha: de paja (con trenzado), con pluma o tricornio (el ala doblada). */
function drawWideHat(head: HeadParts, color: Ramp, style: 'straw' | 'feather' | 'tricorne'): void {
  const weave: Material = (s) =>
    style === 'straw' ? tone(color, s.light, (s.x + s.y) % 2 ? -1 : 0) : tone(color, s.light);
  if (style === 'tricorne') {
    // Tres puntas: el ala levantada en tres lados.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      head.limb(
        [Math.cos(a) * 1.5, 3.6, Math.sin(a) * 1.5],
        [Math.cos(a) * 6.4, 4.6, Math.sin(a) * 6.4],
        1.8,
        0.5,
        weave,
      );
    }
    head.ellipsoid([0, 3.6, 0], [5.6, 0.8, 5.6], weave);
  } else head.ellipsoid([0, 3.4, 0], [7.4, 0.6, 7.4], weave);
  head.limb([0, 3.6, 0], [0, 7.4, -0.4], 4.4, 3.8, weave);
  if (style === 'feather')
    head.limb([3.6, 5.4, -1], [6, 11.5, -4.5], 0.9, 0.2, solid(ramp([230, 226, 214])));
  if (style !== 'straw') {
    const band = head.at([0, 4.4, 0])[1];
    head.limb([0, 4, 0], [0, 4.8, 0], 4.5, 4.5, (s) =>
      Math.abs(s.p[1] - band) < 0.5 ? tone(GOLD, s.light) : weave(s),
    );
  }
}

/** Pañuelo atado a la cabeza, con el nudo y las puntas atrás. */
function drawBandana(head: HeadParts, cloth: Ramp): void {
  head.ellipsoid(
    [0, 1.4, -0.4],
    [4.6, 5.1, 5.1],
    head.masked((n) => n[1] > 0.18, solid(cloth)),
  );
  head.ellipsoid([0, 1.2, -4.8], [1.2, 1, 0.9], solid(cloth, -1));
  head.limb([0, 0.8, -5.2], [0.8, -2.6, -6], 0.7, 0.3, solid(cloth, -1));
  head.limb([0, 0.8, -5.2], [-0.8, -2.8, -5.6], 0.7, 0.3, solid(cloth, -1));
}

/**
 * Yelmo de calavera: una máscara de hueso que cubre la cabeza entera, como
 * un cráneo enorme con cuencas hondas, la nariz hueca, los dientes, pómulos
 * marcados, una cresta de púas y dos cuernos curvos de carnero.
 */
function drawBoneHelm(head: HeadParts): void {
  const bone = ramp([212, 200, 150]);
  const hollow: Rgb = [22, 18, 16];
  const skull: Material = (s) =>
    tone(bone, s.light, noise(Math.floor(s.p[0] * 2), Math.floor(s.p[1] * 2)) > 0.86 ? -1 : 0);
  // Cráneo y cara: tapan todo (cabeza, orejas y mentón).
  head.ellipsoid([0, 1, -0.3], [5.1, 5.8, 5.7], skull);
  head.ellipsoid([0, -2.3, 1.5], [3.9, 3.7, 4.2], skull);
  head.ellipsoid([0, -4.5, 2.4], [2.4, 1.6, 2.1], skull);
  head.ellipsoid([0, 1.4, 4.5], [3.7, 1, 1.4], solid(bone, 1));
  for (const side of [1, -1] as const) {
    head.ellipsoid([side * 2.9, -1, 3.8], [1.3, 0.9, 1.1], solid(bone, 1));
    // Cuencas hondas.
    head.decal([side * 1.7, 0.1, 5.5], [side * 0.25, 0, 1], hollow, 2, 2);
    // Cuerno de carnero: sale de la sien, va hacia atrás y se enrosca hacia adelante.
    const curl: Vec3[] = [
      [side * 4.3, 3.2, 0.6],
      [side * 6.2, 4.6, -1.2],
      [side * 7.4, 3, -3],
      [side * 7.2, 0.2, -2.6],
      [side * 6.4, -1.4, -0.6],
      [side * 6.6, -0.6, 1],
    ];
    for (let i = 0; i + 1 < curl.length; i++)
      head.limb(curl[i] as Vec3, curl[i + 1] as Vec3, 1.3 - i * 0.2, 1.1 - i * 0.2, (s) =>
        tone(bone, s.light - 0.1, Math.floor(s.p[1] * 1.5) % 2 ? -1 : 0),
      );
  }
  // Nariz hueca y la fila de dientes.
  head.decal([0, -1.4, 5.6], [0, 0, 1], hollow, 1, 2);
  head.decal([0, -3.4, 5.6], [0, -0.1, 1], [236, 228, 196], 3, 1);
  head.decal([0, -3.9, 5.3], [0, -0.2, 1], hollow, 3, 1);
  // Cresta de púas sobre el cráneo.
  for (const z of [3, 0.6, -1.8])
    head.limb([0, 6.2, z], [0, 8.4, z - 1], 0.7, 0.12, solid(bone, 1));
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
  // La cresta y el moño alto dejan los costados rapados; el rapado es una capa al ras.
  const shaved = style === 'mohawk' || style === 'topknot' || style === 'buzz';
  if ((!underHat || style === 'bald') && !shaved) {
    const shell =
      style === 'receding'
        ? (n: Vec3): boolean => covers(n) && !(n[2] > 0.42 && n[1] > 0.2 && Math.abs(n[0]) < 0.5)
        : covers;
    head.ellipsoid([0, 0.9, -0.6], [4.7, 5.25, 5.3], head.masked(shell, strands));
  }
  if (shaved && !underHat) {
    // Pelo al ras: apenas una sombra del color del pelo sobre el cráneo.
    head.ellipsoid(
      [0, 0.75, -0.5],
      [4.35, 5.05, 4.95],
      head.masked(covers, (s) => tone(hair, s.light - 0.15, (s.x + s.y) % 2 ? -1 : 0)),
    );
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
    case 'spiky':
      // Mechones en punta que salen de la coronilla hacia arriba y atrás.
      if (underHat) break;
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        const r = i % 2 ? 2.4 : 3.6;
        const base: Vec3 = [Math.sin(a) * r, 4.6 - r * 0.3, -0.8 + Math.cos(a) * r];
        head.limb(base, [base[0] * 1.35, base[1] + 3, base[2] * 1.2 - 1], 1.3, 0.15, strands);
      }
      break;
    case 'mohawk':
      // Cresta: una franja alta del frente a la nuca.
      if (underHat) break;
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const a = -0.2 + t * 2.1;
        const base: Vec3 = [0, 1 + Math.cos(a) * 4.9, -0.6 + Math.sin(a) * -5];
        const tip: Vec3 = [0, 1 + Math.cos(a) * 7.6, -0.6 + Math.sin(a) * -7.4];
        head.limb(base, tip, 1.1, 0.5, strands);
      }
      break;
    case 'topknot':
      // Moño alto atado sobre la coronilla, con el pelo tirante hacia atrás.
      if (underHat) break;
      head.ellipsoid(
        [0, 3.4, -1.6],
        [3.4, 2.4, 3.6],
        head.masked((n) => n[1] > 0.3, strands),
      );
      head.limb([0, 5.4, -2.2], [0, 6.2, 0.6], 1.2, 0.9, strands);
      head.ellipsoid([0, 5.5, -2.4], [1, 0.6, 1], tie);
      break;
    case 'shoulder':
      // Pelo suelto que cae hasta los hombros por detrás y a los costados.
      head.ellipsoid(
        [0, -1.6, -1],
        [5.3, 6, 5.6],
        head.masked((n, p) => !(n[2] > 0.2 && p[1] < 2) && p[1] > -8, strands),
      );
      break;
    case 'wavy':
      // Largo ondulado: bucles que bajan por la espalda y caen sobre los hombros.
      for (let i = 0; i < 7; i++) {
        const y = 0.4 - i * 1.6;
        const w = Math.sin(i * 1.3) * 0.6;
        head.ellipsoid([w, y, -3.6 - i * 0.12], [4.6 - i * 0.12, 1.4, 2.4], strands);
        for (const side of [1, -1] as const)
          head.ellipsoid([side * (4.2 + w), y + 0.4, -1.2], [1.3, 1.4, 1.6], strands);
      }
      break;
    case 'side-braid':
      // Trenza que cae al costado, por delante del hombro.
      for (let i = 0; i < 7; i++)
        head.ellipsoid(
          [4.2 + i * 0.25 + (i % 2 ? 0.3 : -0.3), -1 - i * 1.4, 0.4 + i * 0.25],
          [1.2, 0.95, 1.1],
          strands,
        );
      head.ellipsoid([5.9, -11, 2.1], [0.8, 0.6, 0.8], tie);
      break;
    case 'twin-buns':
      for (const side of [1, -1] as const) {
        head.ellipsoid([side * 3.4, 4, -2.4], [1.9, 1.9, 1.8], strands);
        head.ellipsoid([side * 3, 3, -2.1], [1.2, 0.5, 1.1], tie);
      }
      break;
    default:
      break;
  }
}

function drawFacialHair(head: HeadParts, hair: Ramp, kind: FacialHair): void {
  if (kind === 'none') return;
  if (kind === 'goatee') {
    // Chivita: el mentón cubierto, sin las mejillas.
    head.ellipsoid([0, -4.4, 2.6], [1.5, 1.7, 1.5], (s) => tone(hair, s.light, -1));
  }
  if (kind === 'long-beard') {
    // Barba larga que baja sobre el pecho.
    head.ellipsoid(
      [0, -3, 1.6],
      [3.5, 2.9, 3.4],
      head.masked(
        (n) => n[1] < 0.25 && n[2] > -0.35,
        (s) => tone(hair, s.light, -1),
      ),
    );
    head.limb([0, -4.6, 3], [0, -9.2, 3.6], 2.8, 1, (s) =>
      tone(hair, s.light, Math.floor(s.p[0] * 1.6) % 3 === 0 ? -1 : 0),
    );
  }
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

/**
 * Yelmo de hierro: cubre la cabeza hasta la nuca, con protectores de mejillas
 * que bajan hasta la mandíbula, nasal y una cortina de malla sobre el cuello.
 * Solo queda a la vista la franja de los ojos y la boca.
 */
function drawHelmet(head: HeadParts): void {
  const band = head.at([0, 0.6, 0])[1];
  head.ellipsoid(
    [0, 0.8, -0.4],
    [5, 5.7, 5.5],
    head.masked(
      (n) => !(n[2] > 0.55 && n[1] < 0.28 && n[1] > -0.75 && Math.abs(n[0]) < 0.42),
      (s) => (Math.abs(s.p[1] - band) < 0.5 ? tone(STEEL, s.light, 1) : metal(STEEL)(s)),
    ),
  );
  for (const side of [1, -1] as const)
    head.ellipsoid([side * 3.3, -2.6, 2], [1.4, 2.8, 2.6], metal(STEEL));
  head.limb([0, 3.4, 5.2], [0, -1.6, 5.1], 0.7, 0.6, metal(STEEL));
  // Malla de la nuca y el cuello.
  head.ellipsoid(
    [0, -4.2, -0.8],
    [4.6, 2.6, 4.8],
    head.masked(
      (n) => n[2] < 0.5,
      (s) => tone(STEEL, s.light, (Math.floor(s.p[0] * 2) + Math.floor(s.p[1] * 2)) % 2 ? -1 : 0),
    ),
  );
}

/**
 * Yelmo cerrado: cubre toda la cabeza y el mentón, con ranura para los ojos,
 * respiraderos, cresta y gola sobre el cuello.
 */
function drawPlateHelm(head: HeadParts): void {
  head.ellipsoid([0, 0.3, 0.1], [5.2, 6.4, 5.7], metal(STEEL));
  head.ellipsoid([0, -3.4, 1.4], [4, 3, 4.4], metal(STEEL));
  head.ellipsoid([0, -5.6, 0], [4.8, 1.5, 4.8], (s) => tone(STEEL, s.light - 0.1, 1));
  head.decal([0, 0.2, 5.8], [0, 0, 1], [20, 18, 22], 5, 1);
  for (const dx of [-1, 0, 1]) head.decal([dx * 1.1, -2.9, 5.7], [0, -0.2, 1], [40, 38, 44], 1, 2);
  head.limb([0, 6.6, -4.4], [0, 6.8, 3.4], 0.6, 0.5, metal(STEEL));
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

// ── Etapa 59: yelmos samurái, legionario y templario, y la máscara samurái ──

const LACE = ramp([40, 46, 84]);
const BLACK_LACQUER = ramp([44, 34, 36]);
const CREST = ramp([172, 34, 30]);

/** Placas laqueadas en hileras (según la altura `row`), con el borde dorado y el cordón. */
function lacquerRows(color: Ramp, row: number, x: number, light: number): Rgb {
  const r = (((row % 1.3) + 1.3) % 1.3) / 1.3;
  if (r < 0.16) return tone(GOLD, light + 0.1);
  if ((((x * 0.9) % 1) + 1) % 1 < 0.14) return tone(LACE, light);
  return tone(color, light + 0.12 - r * 0.25, r < 0.32 ? 1 : 0);
}

/**
 * Yelmo samurái: cuenco laqueado con nervios dorados, visera, un cubrenuca
 * de tres láminas que se abren, las solapas vueltas junto a la cara y los
 * cuernos dorados en media luna al frente.
 */
function drawKabuto(head: HeadParts, color: Ramp): void {
  head.ellipsoid(
    [0, 1.6, -0.3],
    [5.3, 5.7, 5.6],
    head.local((p, _n, s) => {
      if (p[1] < 1) return null;
      const a = Math.atan2(p[0], p[2]);
      return Math.abs(Math.sin(a * 6)) < 0.07
        ? tone(GOLD, s.light)
        : tone(BLACK_LACQUER, s.light + 0.2, 1);
    }),
  );
  head.ellipsoid([0, 1.3, 4.6], [4.4, 0.45, 1.9], solid(BLACK_LACQUER, 1));
  for (let i = 0; i < 3; i++)
    head.ellipsoid(
      [0, 0.6 - i * 1.4, -1],
      [5.7 + i * 0.75, 0.8, 5.6 + i * 0.75],
      head.local((p, _n, s) =>
        p[2] > 1.4 + i * 0.3 ? null : lacquerRows(color, p[1] + 0.4 + i * 1.4, p[0], s.light),
      ),
    );
  for (const side of [1, -1] as const) {
    head.ellipsoid([side * 5.6, 0.6, 2.4], [0.7, 1.9, 1.6], solid(color, 1));
    head.limb([side * 0.8, 2.6, 5.1], [side * 2.9, 6.4, 5.8], 0.55, 0.4, metal(GOLD));
    head.limb([side * 2.9, 6.4, 5.8], [side * 3.4, 9.8, 4.6], 0.4, 0.12, metal(GOLD));
  }
  head.ellipsoid([0, 2.8, 5.6], [1.1, 1.1, 0.35], metal(GOLD));
}

/**
 * Yelmo legionario: casco de acero con la banda de bronce, visera, el
 * cubrenuca ancho atrás, las carrilleras y un penacho rojo de adelante atrás.
 */
function drawGalea(head: HeadParts): void {
  head.ellipsoid(
    [0, 1, -0.4],
    [5.1, 5.9, 5.6],
    head.local((p, _n, s) => {
      if (p[1] < 0.6 && p[2] > -1.4) return null;
      if (Math.abs(p[1] - 1.4) < 0.45 && p[2] > -2) return tone(GOLD, s.light);
      return metal(STEEL)(s);
    }),
  );
  head.ellipsoid([0, 1.2, 4.7], [4.4, 0.35, 1.5], metal(STEEL));
  head.ellipsoid([0, -2.4, -4], [5.4, 0.55, 3.2], (s) => tone(STEEL, s.light, 1));
  for (const side of [1, -1] as const) {
    head.ellipsoid([side * 4.5, -2.2, 2.1], [0.55, 2.8, 2.1], metal(STEEL));
    head.ellipsoid([side * 4.95, -2, 2.1], [0.3, 0.45, 0.45], metal(GOLD));
  }
  head.limb([0, 5.8, 2.4], [0, 6.6, 2.4], 0.6, 0.5, metal(GOLD));
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const z = 3.4 - t * 8.4;
    const y = 6.8 + Math.sin(t * Math.PI) * 1.2;
    head.limb([0, y - 0.8, z], [0, y + 1.8, z - 0.3], 1, 0.6, (s) =>
      tone(CREST, s.light, (i + s.y) % 3 === 0 ? -1 : 0),
    );
  }
}

/**
 * Yelmo templario: un cilindro de techo plano que cubre toda la cabeza, con
 * la mirilla, la cruz de refuerzo en bronce y los agujeros para respirar.
 */
function drawGreatHelm(head: HeadParts): void {
  const steel = metal(STEEL);
  // Un cilindro con el techo plano: se cortan las puntas redondas del tubo.
  head.limb(
    [0, -6.4, 0.3],
    [0, 4.4, 0.3],
    5.6,
    5.4,
    head.local((p, n, s) => {
      if (p[1] > 4.9) return null;
      const front = n[2] > 0.45;
      if (front && Math.abs(p[1] - 0.3) < 0.45 && Math.abs(p[0]) > 0.6) return [18, 16, 18];
      if (front && Math.abs(p[0]) < 0.6 && p[1] < 4.5) return tone(GOLD, s.light);
      if (front && Math.abs(p[1] - 1.6) < 0.4) return tone(GOLD, s.light);
      if (front && p[1] < -1.6 && p[1] > -4.4 && p[0] > 1.2 && (s.x + s.y) % 3 === 0)
        return [26, 24, 26];
      return steel(s);
    }),
  );
  head.ellipsoid([0, 4.9, 0.3], [5.3, 0.45, 5.3], steel);
}

/**
 * Máscara samurái sobre la mitad de abajo de la cara: laqueada, con nariz,
 * boca abierta y bigote, y el babero de láminas que cubre la garganta.
 */
export function drawMempo(canvas: VolumeCanvas, basis: Basis, color: Ramp): void {
  const head = new HeadParts(canvas, basis);
  head.ellipsoid(
    [0, -2.7, 1.5],
    [4.1, 3.4, 4.1],
    head.local((p, _n, s) => (p[2] < 0.4 || p[1] > -0.8 ? null : tone(color, s.light + 0.12))),
  );
  head.ellipsoid([0, -1.1, 4.9], [0.8, 1.3, 0.9], solid(color, 1));
  head.decal([0, -3.3, 5.3], [0, -0.2, 1], [20, 14, 14], 3, 1);
  for (const side of [1, -1] as const)
    head.limb(
      [side * 0.4, -2.5, 5.3],
      [side * 2.4, -3.1, 4.4],
      0.35,
      0.12,
      solid(ramp([24, 20, 20])),
    );
  for (let i = 0; i < 3; i++)
    head.ellipsoid(
      [0, -5.9 - i * 1.1, 0.6],
      [4.1 + i * 0.5, 0.65, 4 + i * 0.5],
      head.local((p, _n, s) =>
        p[2] < -1 ? null : lacquerRows(color, p[1] + 6.3 + i * 0.2, p[0], s.light),
      ),
    );
}
