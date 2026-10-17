import { SHIPS, type ShipFacing, type ShipKind } from '@fenix/shared';
import { PixelImage, type Rgb } from './pixel-art';
import {
  RotatedProjection,
  VolumeCanvas,
  WorldProjection,
  clipping,
  noise,
  ramp,
  solid,
  tone,
  type Material,
  type Ramp,
  type Vec3,
} from './volume';

/** Lienzo de un barco: entra entero en cualquier dirección, con los mástiles. */
export const SHIP_ART_WIDTH = 420;
export const SHIP_ART_HEIGHT = 400;
/** Dónde cae el centro del barco (el tile del medio, a nivel del agua). */
export const SHIP_ART_ORIGIN = { x: 210, y: 262 } as const;

/** Un tile en unidades del modelo (como los objetos fijos). */
const TILE = 22 * Math.SQRT2;
const OUTLINE: Rgb = [24, 17, 14];
const AXES: readonly [Vec3, Vec3, Vec3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const WOOD = ramp([118, 78, 44]);
const DARK_WOOD = ramp([82, 54, 32]);
const DECK = ramp([176, 136, 88]);
const SAIL = ramp([236, 228, 206]);
const IRON = ramp([58, 58, 64]);

/** Tablas de la cubierta, a lo largo del barco. */
const deckPlanks: Material = (s) => {
  const across = s.p[2];
  const seam = Math.abs(((across + 200) % 6) - 3) > 2.5;
  if (seam) return tone(DECK, s.light, -1);
  const grain = noise(Math.floor((across + 200) / 6), Math.floor(s.p[0] / 5));
  return tone(DECK, s.light, grain > 0.82 ? 1 : 0);
};

/** El casco: tablones horizontales, una franja de color y nada bajo el agua. */
function hullMaterial(stripe: Ramp, deckY: number): Material {
  return clipping((s) => {
    if (s.p[1] < 0 || s.p[1] > deckY + 0.5) return null;
    if (Math.abs(s.p[1] - 15) < 1.4) return tone(stripe, s.light);
    return tone(WOOD, s.light, Math.floor(s.p[1] / 3.2) % 2 ? -1 : 0);
  });
}

/**
 * Un barco visto desde arriba como en UO, con la proa hacia `facing`. El
 * modelo se arma con la proa hacia +x y se gira con la proyección.
 */
export function drawShip(kind: ShipKind, facing: ShipFacing): PixelImage {
  const quarter = (((facing - 2 + 8) % 8) / 2) as 0 | 1 | 2 | 3;
  const projection = new RotatedProjection(
    new WorldProjection(SHIP_ART_ORIGIN.x, SHIP_ART_ORIGIN.y),
    quarter,
  );
  const c = new VolumeCanvas(SHIP_ART_WIDTH, SHIP_ART_HEIGHT, projection);
  const { length, width } = SHIPS[kind];
  const halfL = (length * TILE) / 2;
  const halfW = (width * TILE) / 2 - 3;
  const deckY = 22;

  // Casco: lados rectos y popa cuadrada hasta la mitad de proa, que termina en punta;
  // así cubre toda la huella del barco (la gente puede pararse en las esquinas).
  const hull = hullMaterial(kind === 'galleon' ? ramp([150, 40, 36]) : ramp([40, 90, 140]), deckY);
  const sternX = -halfL - 2;
  const waist = halfL * 0.35;
  const body = { center: (sternX + waist) / 2, half: (waist - sternX) / 2 };
  const bow = { center: waist, length: halfL * 0.75 };
  for (let y = 1; y <= deckY; y += 1.5) {
    const k = 0.88 + 0.12 * Math.sqrt(y / deckY);
    c.box([body.center, y, 0], AXES, [body.half * (0.96 + 0.04 * k), 0.8, halfW * k], hull);
    c.ellipsoid([bow.center, y, 0], AXES, [bow.length * k, 1.6, halfW * k], hull);
  }
  // Cubierta: tablas que tapan el casco por arriba.
  c.box([body.center, deckY - 0.4, 0], AXES, [body.half - 1, 0.8, halfW - 1], deckPlanks);
  c.ellipsoid([bow.center, deckY - 0.6, 0], AXES, [bow.length - 1.5, 1.4, halfW - 1], deckPlanks);
  // Borda: un pasamanos alrededor (recto en los costados y la popa, curvo en la proa).
  const rail: Vec3[] = [];
  const rx = halfW - 1.5;
  rail.push(
    [waist, deckY + 3, rx],
    [sternX + 1.5, deckY + 3, rx],
    [sternX + 1.5, deckY + 3, -rx],
    [waist, deckY + 3, -rx],
  );
  for (let k = 0; k <= 24; k++) {
    const t = -Math.PI / 2 + (Math.PI * k) / 24;
    rail.push([bow.center + Math.cos(t) * (bow.length - 1.5), deckY + 3, Math.sin(t) * rx]);
  }
  const start = rail[0];
  if (start) rail.push(start);
  for (let k = 0; k < rail.length - 1; k++) {
    const a = rail[k];
    const b = rail[k + 1];
    if (a && b) c.limb(a, b, 1.1, 1.1, solid(DARK_WOOD));
  }
  // Bauprés.
  c.limb(
    [waist + bow.length - 3, deckY + 3, 0],
    [waist + bow.length + 22, deckY + 16, 0],
    1.6,
    0.9,
    solid(DARK_WOOD),
  );

  if (kind === 'galleon') {
    // Castillo de popa, un farol y un cañón asomando por cada banda.
    c.box([sternX + halfL * 0.2, deckY + 8, 0], AXES, [halfL * 0.18, 8, halfW - 2], hull);
    c.box([sternX + halfL * 0.2, deckY + 16.5, 0], AXES, [halfL * 0.18, 1, halfW - 2], deckPlanks);
    c.sphere([sternX + 2, deckY + 20, 0], 2.6, (s) =>
      tone(ramp([255, 200, 100]), 0.6 + s.light * 0.4),
    );
    for (const side of [1, -1]) {
      c.limb(
        [0, deckY + 4, side * (halfW - 4)],
        [0, deckY + 5, side * (halfW + 6)],
        2.6,
        2.2,
        solid(IRON),
      );
      c.ellipsoid([0, deckY + 3, side * (halfW - 6)], AXES, [4, 3, 3], solid(DARK_WOOD));
    }
  }

  // Mástiles con sus velas: uno en la balandra, dos en el galeón.
  const masts: readonly [number, number][] =
    kind === 'galleon'
      ? [
          [halfL * 0.22, 150],
          [-halfL * 0.3, 128],
        ]
      : [[halfL * 0.08, 120]];
  for (const [x, top] of masts) {
    c.limb([x, deckY, 0], [x, top, 0], 2.4, 1.6, solid(WOOD));
    const spread = halfW + 10;
    c.limb([x, top - 26, -spread], [x, top - 26, spread], 1.1, 1.1, solid(WOOD));
    c.polygon(
      [
        [x + 2, top - 26, -spread + 2],
        [x + 2, top - 26, spread - 2],
        [x + 9, top - 78, spread - 5],
        [x + 9, top - 78, -spread + 5],
      ],
      (s) => tone(SAIL, 0.45 + s.light * 0.55, Math.abs(s.p[2]) < 1 ? -1 : 0),
    );
  }
  // Banderín en el tope del palo mayor.
  const [mainX, mainTop] = masts[0] ?? [0, 120];
  c.polygon(
    [
      [mainX, mainTop, 0],
      [mainX, mainTop - 10, 0],
      [mainX - 16, mainTop - 7, 1],
      [mainX - 16, mainTop - 3, 1],
    ],
    solid(kind === 'galleon' ? ramp([170, 40, 40]) : ramp([40, 90, 150])),
  );

  const image = new PixelImage(SHIP_ART_WIDTH, SHIP_ART_HEIGHT);
  image.draw(c.toImage(OUTLINE), 0, 0);
  return image;
}
