import { isMountKind, type CreatureKind, type Direction } from '@fenix/shared';
import { drawMountFrame } from './mount-art';
import {
  CHARACTER_ART_HEIGHT,
  CHARACTER_ART_WIDTH,
  OUTLINE,
  cameraFor,
  drawSkeletonFrame,
  type CharacterFrame,
} from './character-art';
import { spriteCanvas, type CanvasFactory } from './humanoid-rig';
import type { PixelImage, Rgb } from './pixel-art';
import { drawSummonFrame, isSummonKind } from './summon-art';
import { drawMonsterFrame, isMonsterKind } from './monster-art';
import type { VolumeCanvas } from './volume';
import { add, axesAlong, normalize, ramp, solid, tone, type Vec3 } from './volume';
import { biteOffset, fur, gait, tailWag } from './creature-motion';

/** Dibuja un frame de una criatura, en el mismo lienzo que los personajes. */
export function drawCreatureFrame(
  kind: CreatureKind,
  direction: Direction,
  frame: CharacterFrame,
  canvasFor: CanvasFactory = spriteCanvas,
): PixelImage {
  if (kind === 'skeleton') return drawSkeletonFrame(direction, frame, canvasFor);
  if (isSummonKind(kind)) return drawSummonFrame(kind, direction, frame, canvasFor);
  if (isMonsterKind(kind)) return drawMonsterFrame(kind, direction, frame, canvasFor);
  if (isMountKind(kind)) return drawMountFrame(kind, direction, frame, canvasFor);
  const zoom = kind === 'rat' ? 1.6 : 1.25;
  const canvas = canvasFor(CHARACTER_ART_WIDTH, CHARACTER_ART_HEIGHT, cameraFor(direction, zoom));
  if (kind === 'wolf') drawWolf(canvas, frame);
  else drawRat(canvas, frame);
  return canvas.toImage(OUTLINE);
}

const WOLF_FUR = ramp([134, 134, 140]);
const WOLF_BELLY = ramp([196, 192, 186]);
const DARK: Rgb = [22, 18, 18];

function drawWolf(canvas: VolumeCanvas, frame: CharacterFrame): void {
  const step = gait(frame, 2.4);
  const body = fur(WOLF_FUR, WOLF_BELLY, 15);
  const bob = step.lift;

  // Patas: muslo grueso y pata fina, con la mano al final.
  const legs: [number, number, number][] = [
    [1, 5, step.pairA],
    [-1, 5, step.pairB],
    [1, -6, step.pairB],
    [-1, -6, step.pairA],
  ];
  for (const [side, z, swing] of legs) {
    const top: Vec3 = [side * 2.2, 11 + bob, z];
    const knee: Vec3 = [side * 2.3, 5.5 + bob * 0.5, z + swing * 0.5 + (z < 0 ? -1 : 0.5)];
    const paw: Vec3 = [side * 2.3, 1, z + swing];
    canvas.limb(top, knee, 2, 1.3, body);
    canvas.limb(knee, paw, 1.2, 1.1, body);
    canvas.ellipsoid(
      add(paw, [0, -0.2, 0.8]),
      axesAlong([0, 0, 1]),
      [1.3, 0.9, 1.8],
      solid(WOLF_FUR, -1),
    );
  }

  // Cuerpo: lomo, pecho ancho y anca.
  canvas.ellipsoid([0, 12 + bob, -0.8], axesAlong([0, 0.08, 1]), [3.5, 3.8, 7.2], body);
  canvas.sphere([0, 12.6 + bob, 4.6], 4.2, body);
  canvas.sphere([0, 12 + bob, -5.8], 3.7, body);

  // Cola peluda que se mueve al caminar.
  const wag = tailWag(frame) * 1.2;
  canvas.limb([0, 13.5 + bob, -8.5], [wag * 0.5, 12.5 + bob, -12], 1.8, 1.9, body);
  canvas.limb([wag * 0.5, 12.5 + bob, -12], [wag, 9 + bob, -14.5], 1.9, 0.9, (s) =>
    s.p[2] < -13.6 ? tone(WOLF_BELLY, s.light) : body(s),
  );

  // Cuello y cabeza con hocico largo.
  const head: Vec3 = add([0, 17 + bob, 9.6], biteOffset(frame, 2.6));
  canvas.limb([0, 14 + bob, 5.6], head, 3, 2.6, body);
  canvas.sphere(head, 3.2, body);
  canvas.ellipsoid(add(head, [0, -1, 3.3]), axesAlong([0, -0.2, 1]), [1.6, 1.5, 2.8], (s) =>
    s.n[1] < -0.2 ? tone(WOLF_BELLY, s.light) : body(s),
  );
  for (const side of [1, -1] as const) {
    canvas.ellipsoid(
      add(head, [side * 1.8, 3, -0.6]),
      axesAlong([0, 0, 1], [side * -0.3, 1, 0]),
      [0.9, 2, 0.7],
      solid(WOLF_FUR, -1),
    );
    canvas.decal(
      add(head, [side * 1.5, 0.9, 2.6]),
      normalize([side * 0.5, 0.2, 1]),
      [240, 196, 60],
    );
  }
  canvas.decal(add(head, [0, -0.7, 6.1]), [0, 0, 1], DARK, 2, 1);
}

const RAT_FUR = ramp([118, 98, 84]);
const RAT_BELLY = ramp([170, 152, 136]);
const PINK = ramp([214, 150, 150]);

function drawRat(canvas: VolumeCanvas, frame: CharacterFrame): void {
  const step = gait(frame, 1.2);
  const body = fur(RAT_FUR, RAT_BELLY, 6);
  const bob = step.lift * 0.5;

  for (const [side, z, swing] of [
    [1, 2.6, step.pairA],
    [-1, 2.6, step.pairB],
    [1, -2.4, step.pairB],
    [-1, -2.4, step.pairA],
  ] as const) {
    canvas.limb([side * 1.6, 3 + bob, z], [side * 1.8, 0.6, z + swing], 0.8, 0.6, solid(PINK, -1));
  }
  canvas.ellipsoid([0, 4.4 + bob, -0.6], axesAlong([0, 0.1, 1]), [2.7, 2.7, 4.8], body);

  // Cola larga, rosada y en curva.
  const tail: Vec3[] = [
    [0, 3.8 + bob, -5],
    [0.6, 2.4, -8.5],
    [frame === 'idle' ? 1.6 : 0.4, 1.2, -11.5],
    [frame === 'idle' ? 2.8 : 1.4, 1.6, -14],
  ];
  tail.slice(1).forEach((to, i) => {
    const from = tail[i] ?? to;
    canvas.limb(from, to, 0.75 - i * 0.15, 0.6 - i * 0.15, solid(PINK));
  });

  // Cabeza puntiaguda, orejas redondas, ojos rojos.
  const head: Vec3 = add([0, 5 + bob, 4.6], biteOffset(frame, 1.4));
  canvas.ellipsoid(head, axesAlong([0, -0.25, 1]), [2, 2, 3], body);
  canvas.sphere(add(head, [0, -0.7, 2.9]), 0.7, solid(PINK));
  for (const side of [1, -1] as const) {
    canvas.ellipsoid(
      add(head, [side * 1.5, 2, -0.8]),
      axesAlong([0, 0, 1]),
      [1.3, 1.3, 0.5],
      (s) => (s.n[2] > 0.3 ? tone(PINK, s.light) : tone(RAT_FUR, s.light, -1)),
    );
    canvas.decal(add(head, [side * 1.1, 0.7, 1.9]), normalize([side * 0.6, 0.3, 1]), [210, 30, 30]);
  }
}
