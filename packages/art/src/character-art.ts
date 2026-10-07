import { Direction, type Appearance } from '@fenix/shared';
import { hexToRgb, PixelImage, shade, type Rgb } from './pixel-art';

/** Tamaño lógico del sprite (se escala x2 al dibujar). */
export const CHARACTER_ART_WIDTH = 20;
export const CHARACTER_ART_HEIGHT = 35;
/** Fila donde apoyan los pies: el ancla del sprite sobre el tile. */
export const CHARACTER_FEET_Y = 33;

/** `idle` = parado; 0..3 = ciclo de caminata (contacto, paso, contacto, paso). */
export type CharacterFrame = 'idle' | 0 | 1 | 2 | 3;
export const WALK_FRAMES: readonly CharacterFrame[] = [0, 1, 2, 3];

/** Cómo se ve el cuerpo según hacia dónde mira en pantalla. */
type View = 'front' | 'front3' | 'side' | 'back3' | 'back';

/**
 * Cada dirección de UO apunta a un lado distinto de la pantalla isométrica.
 * Solo se dibujan 5 vistas; las otras 3 son espejos.
 */
const VIEW_BY_DIRECTION: Readonly<Record<Direction, { view: View; mirror: boolean }>> = {
  [Direction.North]: { view: 'back3', mirror: false }, // arriba-derecha
  [Direction.NorthEast]: { view: 'side', mirror: false }, // derecha
  [Direction.East]: { view: 'front3', mirror: false }, // abajo-derecha
  [Direction.SouthEast]: { view: 'front', mirror: false }, // abajo
  [Direction.South]: { view: 'front3', mirror: true }, // abajo-izquierda
  [Direction.SouthWest]: { view: 'side', mirror: true }, // izquierda
  [Direction.West]: { view: 'back3', mirror: true }, // arriba-izquierda
  [Direction.NorthWest]: { view: 'back', mirror: false }, // arriba
};

interface Palette {
  readonly skin: Rgb;
  readonly cloth: Rgb;
  readonly hair: Rgb;
  readonly pants: Rgb;
  readonly boots: Rgb;
  readonly belt: Rgb;
  readonly buckle: Rgb;
  readonly eye: Rgb;
}

function paletteFor(appearance: Appearance): Palette {
  return {
    skin: hexToRgb(appearance.skinTone),
    cloth: hexToRgb(appearance.clothHue),
    hair: hexToRgb(appearance.hairHue),
    pants: [74, 58, 42],
    boots: [44, 31, 23],
    belt: [59, 42, 26],
    buckle: [201, 164, 58],
    eye: [26, 22, 20],
  };
}

/** Pincel con sombreado: luz desde arriba a la izquierda, como en UO. */
class Brush {
  constructor(
    private readonly image: PixelImage,
    private readonly offsetY: number,
  ) {}

  rect(x: number, y: number, w: number, h: number, color: Rgb): void {
    if (w <= 0 || h <= 0) return;
    this.image.fillRect(x, y + this.offsetY, w, h, color);
  }

  /** Rectángulo con borde izquierdo iluminado y derecho en sombra. */
  shaded(x: number, y: number, w: number, h: number, color: Rgb): void {
    this.rect(x, y, w, h, color);
    if (w >= 3) {
      this.rect(x, y, 1, h, shade(color, 1.18));
      this.rect(x + w - 1, y, 1, h, shade(color, 0.72));
    }
  }

  dot(x: number, y: number, color: Rgb): void {
    this.rect(x, y, 1, 1, color);
  }
}

interface Pose {
  /** Desplazamiento de cada pierna: [lejana, cercana]. */
  readonly legShift: readonly [number, number];
  /** Pierna levantada (1 px más corta): -1 ninguna, 0 lejana, 1 cercana. */
  readonly liftedLeg: -1 | 0 | 1;
  /** Balanceo de brazos (opuesto a las piernas). */
  readonly armSwing: number;
  readonly bob: number;
}

function poseFor(frame: CharacterFrame): Pose {
  switch (frame) {
    case 'idle':
      return { legShift: [0, 0], liftedLeg: -1, armSwing: 0, bob: 0 };
    case 0:
      return { legShift: [-2, 2], liftedLeg: 0, armSwing: -1, bob: 0 };
    case 2:
      return { legShift: [2, -2], liftedLeg: 1, armSwing: 1, bob: 0 };
    default:
      return { legShift: [0, 0], liftedLeg: -1, armSwing: 0, bob: -1 };
  }
}

/** Dibuja un frame del personaje mirando en `direction`. */
export function drawCharacterFrame(
  appearance: Appearance,
  direction: Direction,
  frame: CharacterFrame,
): PixelImage {
  const { view, mirror } = VIEW_BY_DIRECTION[direction];
  const image = new PixelImage(CHARACTER_ART_WIDTH, CHARACTER_ART_HEIGHT);
  const pose = poseFor(frame);
  const palette = paletteFor(appearance);
  const body = new Brush(image, pose.bob);
  const legs = new Brush(image, 0);

  switch (view) {
    case 'front':
    case 'back':
      drawFrontOrBack(body, legs, palette, pose, view === 'back');
      break;
    case 'front3':
    case 'back3':
      drawThreeQuarter(body, legs, palette, pose, view === 'back3');
      break;
    case 'side':
      drawSide(body, legs, palette, pose);
      break;
  }

  image.outline([27, 19, 14]);
  return mirror ? image.mirrored() : image;
}

function drawLeg(brush: Brush, x: number, lifted: boolean, p: Palette, dim = 1): void {
  const lift = lifted ? 1 : 0;
  brush.shaded(x, 23, 3, 8 - lift, shade(p.pants, dim));
  brush.rect(x, 31 - lift, 3, 2, shade(p.boots, dim));
  brush.rect(x, 33 - lift - 1, 3, 1, shade(p.boots, dim * 0.8));
}

function drawFrontOrBack(b: Brush, legs: Brush, p: Palette, pose: Pose, back: boolean): void {
  // De frente las piernas suben y bajan en lugar de ir adelante y atrás.
  drawLeg(legs, 6, pose.liftedLeg === 0, p);
  drawLeg(legs, 11, pose.liftedLeg === 1, p);

  // Brazos detrás del torso.
  const swing = pose.armSwing;
  b.shaded(3, 14 + swing, 2, 8, p.cloth);
  b.rect(3, 22 + swing, 2, 2, p.skin);
  b.shaded(15, 14 - swing, 2, 8, shade(p.cloth, 0.9));
  b.rect(15, 22 - swing, 2, 2, shade(p.skin, 0.9));

  // Torso y cinturón.
  b.shaded(5, 13, 10, 11, p.cloth);
  b.rect(5, 23, 10, 1, shade(p.cloth, 0.7));
  b.rect(5, 20, 10, 1, p.belt);
  if (!back) b.rect(9, 20, 2, 1, p.buckle);

  // Cuello y cabeza.
  b.rect(8, 12, 4, 1, shade(p.skin, 0.8));
  b.shaded(7, 4, 6, 8, p.skin);
  b.rect(7, 11, 6, 1, shade(p.skin, 0.82));

  if (back) {
    b.rect(7, 2, 6, 1, p.hair);
    b.shaded(6, 3, 8, 8, p.hair);
    b.rect(7, 10, 6, 1, shade(p.hair, 0.75));
  } else {
    b.rect(7, 2, 6, 1, p.hair);
    b.shaded(6, 3, 8, 2, p.hair);
    b.rect(6, 5, 1, 4, p.hair);
    b.rect(13, 5, 1, 4, shade(p.hair, 0.75));
    b.dot(8, 7, p.eye);
    b.dot(11, 7, p.eye);
    b.dot(9, 9, shade(p.skin, 0.8));
    b.dot(10, 9, shade(p.skin, 0.8));
  }
}

function drawThreeQuarter(b: Brush, legs: Brush, p: Palette, pose: Pose, back: boolean): void {
  const [farShift, nearShift] = pose.legShift;
  drawLeg(legs, 7 + Math.sign(farShift), pose.liftedLeg === 0, p, 0.85);
  drawLeg(legs, 10 + Math.sign(nearShift), pose.liftedLeg === 1, p);

  // Brazo lejano (detrás del torso).
  b.shaded(4, 14 - pose.armSwing, 2, 8, shade(p.cloth, 0.8));
  b.rect(4, 22 - pose.armSwing, 2, 2, shade(p.skin, 0.85));

  b.shaded(6, 13, 8, 11, p.cloth);
  b.rect(6, 23, 8, 1, shade(p.cloth, 0.7));
  b.rect(6, 20, 8, 1, p.belt);
  if (!back) b.rect(11, 20, 2, 1, p.buckle);

  // Brazo cercano (delante del torso).
  b.shaded(14, 14 + pose.armSwing, 2, 8, p.cloth);
  b.rect(14, 22 + pose.armSwing, 2, 2, p.skin);

  b.rect(8, 12, 4, 1, shade(p.skin, 0.8));
  b.shaded(7, 4, 6, 8, p.skin);
  b.rect(7, 11, 6, 1, shade(p.skin, 0.82));

  if (back) {
    // De espaldas: el pelo tapa casi toda la cabeza, se ve la oreja.
    b.rect(7, 2, 6, 1, p.hair);
    b.shaded(6, 3, 7, 8, p.hair);
    b.rect(12, 6, 1, 3, shade(p.skin, 0.85));
  } else {
    b.rect(7, 2, 6, 1, p.hair);
    b.shaded(6, 3, 7, 2, p.hair);
    b.rect(6, 5, 2, 5, p.hair);
    b.dot(9, 7, p.eye);
    b.dot(12, 7, p.eye);
    b.dot(12, 9, shade(p.skin, 0.78));
  }
}

function drawSide(b: Brush, legs: Brush, p: Palette, pose: Pose): void {
  const [farShift, nearShift] = pose.legShift;
  drawLeg(legs, 8 + farShift, pose.liftedLeg === 0, p, 0.8);

  // Brazo lejano, casi oculto (va opuesto al cercano).
  b.rect(8 - pose.armSwing, 15, 2, 7, shade(p.cloth, 0.7));

  b.shaded(7, 13, 6, 11, p.cloth);
  b.rect(7, 23, 6, 1, shade(p.cloth, 0.7));
  b.rect(7, 20, 6, 1, p.belt);

  drawLeg(legs, 8 + nearShift, pose.liftedLeg === 1, p);

  // Brazo cercano: va hacia atrás cuando la pierna cercana va adelante.
  const swing = pose.armSwing * 2;
  b.rect(9, 14, 2, 4, p.cloth);
  b.rect(9 + swing / 2, 18, 2, 4, shade(p.cloth, 0.92));
  b.rect(9 + swing, 22, 2, 2, p.skin);

  b.rect(9, 12, 3, 1, shade(p.skin, 0.8));
  b.shaded(8, 4, 6, 8, p.skin);
  b.rect(8, 11, 6, 1, shade(p.skin, 0.82));
  b.dot(14, 8, shade(p.skin, 0.9));

  b.rect(8, 2, 5, 1, p.hair);
  b.shaded(7, 3, 6, 2, p.hair);
  b.rect(7, 5, 3, 5, p.hair);
  b.dot(12, 7, p.eye);
}
