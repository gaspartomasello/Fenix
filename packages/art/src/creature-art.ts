import { type CreatureKind, type Direction } from '@fenix/shared';
import {
  CHARACTER_ART_HEIGHT,
  CHARACTER_ART_WIDTH,
  CHARACTER_FEET_Y,
  drawSkeletonFrame,
  poseFor,
  viewFor,
  type CharacterFrame,
  type View,
} from './character-art';
import { PixelImage, shade, type Rgb } from './pixel-art';

/** Cómo es un cuadrúpedo: tamaño y colores. */
interface QuadrupedSpec {
  /** Medio largo y medio alto del cuerpo. */
  readonly length: number;
  readonly height: number;
  readonly headRadius: number;
  readonly legLength: number;
  readonly fur: Rgb;
  readonly belly: Rgb;
  readonly tail: Rgb;
  readonly tailLength: number;
  readonly eye: Rgb;
}

const QUADRUPEDS: Readonly<Record<'rat' | 'wolf', QuadrupedSpec>> = {
  rat: {
    length: 4.5,
    height: 2.5,
    headRadius: 2,
    legLength: 2,
    fur: [112, 92, 78],
    belly: [160, 140, 124],
    tail: [214, 150, 150],
    tailLength: 6,
    eye: [200, 30, 30],
  },
  wolf: {
    length: 7,
    height: 3.5,
    headRadius: 3,
    legLength: 4,
    fur: [128, 128, 132],
    belly: [176, 176, 180],
    tail: [110, 110, 114],
    tailLength: 5,
    eye: [240, 200, 60],
  },
};

/** Dibuja un frame de una criatura, en el mismo lienzo que los personajes. */
export function drawCreatureFrame(
  kind: CreatureKind,
  direction: Direction,
  frame: CharacterFrame,
): PixelImage {
  if (kind === 'skeleton') return drawSkeletonFrame(direction, frame);
  const { view, mirror } = viewFor(direction);
  const image = new PixelImage(CHARACTER_ART_WIDTH, CHARACTER_ART_HEIGHT);
  drawQuadruped(image, QUADRUPEDS[kind], view, frame);
  image.outline([27, 19, 14]);
  return mirror ? image.mirrored() : image;
}

/**
 * Cuadrúpedo visto desde el ángulo de la vista: el cuerpo es una elipse cuyo
 * largo se acorta al mirar de frente o de espaldas; cabeza adelante, cola atrás.
 */
function drawQuadruped(
  img: PixelImage,
  spec: QuadrupedSpec,
  view: View,
  frame: CharacterFrame,
): void {
  const pose = poseFor(frame);
  const groundY = CHARACTER_FEET_Y;
  const bodyY = groundY - spec.legLength - spec.height + 1 + pose.bob;
  const cx = CHARACTER_ART_WIDTH / 2;

  // Hacia dónde apunta la cabeza en pantalla (x, y) y cuánto se ve del largo.
  const facing: Record<View, { dx: number; dy: number; foreshorten: number }> = {
    side: { dx: 1, dy: 0, foreshorten: 1 },
    front3: { dx: 0.75, dy: 0.45, foreshorten: 0.8 },
    back3: { dx: 0.75, dy: -0.45, foreshorten: 0.8 },
    front: { dx: 0, dy: 1, foreshorten: 0.45 },
    back: { dx: 0, dy: -1, foreshorten: 0.45 },
  };
  const f = facing[view];
  const halfLength = Math.max(spec.height + 0.5, spec.length * f.foreshorten);
  const headX = cx + f.dx * (halfLength + spec.headRadius * 0.4);
  const headY = bodyY + f.dy * (spec.height * 0.9) - (f.dy === 0 ? spec.headRadius * 0.6 : 0);
  const tailX = cx - f.dx * (halfLength + 1);
  const tailY = bodyY - f.dy * spec.height;
  const headInFront = f.dy >= 0;

  // Patas: cuatro, alternando adelante y atrás con la caminata.
  const swing = pose.legShift[1] / 2;
  const legXs = [-0.6, -0.25, 0.25, 0.6].map((t) => cx + t * halfLength * 1.6);
  legXs.forEach((x, i) => {
    const shift = (i % 2 === 0 ? swing : -swing) * (f.dx !== 0 ? 1 : 0);
    const lift = f.dx === 0 && pose.liftedLeg === i % 2 ? 1 : 0;
    const tone = i < 2 ? shade(spec.fur, 0.75) : shade(spec.fur, 0.85);
    img.fillRect(
      Math.round(x + shift),
      Math.round(bodyY + spec.height - 1),
      1,
      Math.round(spec.legLength + 1 - lift),
      tone,
    );
  });

  // Cola (detrás del cuerpo cuando la cabeza mira hacia el frente).
  const drawTail = (): void => {
    for (let i = 0; i < spec.tailLength; i++) {
      const t = i / spec.tailLength;
      img.set(
        Math.round(tailX - f.dx * i * 0.7),
        Math.round(tailY - i * 0.5 + t * t * 2),
        spec.tail,
      );
    }
  };
  const drawHead = (): void => {
    img.fillEllipse(headX, headY, spec.headRadius, spec.headRadius * 0.9, (x) =>
      shade(spec.fur, x < headX ? 1.1 : 0.9),
    );
    // Orejas.
    img.set(
      Math.round(headX - spec.headRadius * 0.6),
      Math.round(headY - spec.headRadius),
      shade(spec.fur, 0.7),
    );
    img.set(
      Math.round(headX + spec.headRadius * 0.6),
      Math.round(headY - spec.headRadius),
      shade(spec.fur, 0.7),
    );
    if (f.dy >= 0) {
      // Hocico y ojos, solo si la cara mira a la cámara o de costado.
      const snoutX = Math.round(headX + f.dx * spec.headRadius);
      img.set(snoutX, Math.round(headY + 1), [30, 24, 22]);
      if (f.dx === 0) {
        img.set(Math.round(headX - 1), Math.round(headY - 0.5), spec.eye);
        img.set(Math.round(headX + 1), Math.round(headY - 0.5), spec.eye);
      } else {
        img.set(Math.round(headX + f.dx * 0.5), Math.round(headY - 0.5), spec.eye);
      }
    }
  };

  if (headInFront) drawTail();
  else drawHead();
  img.fillEllipse(cx, bodyY, halfLength, spec.height, (x, y) =>
    y > bodyY + spec.height * 0.4
      ? spec.belly
      : shade(spec.fur, 1.15 - ((x - cx) / halfLength) * 0.15 - ((y - bodyY) / spec.height) * 0.1),
  );
  if (headInFront) drawHead();
  else drawTail();
}
