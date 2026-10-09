import { ART_DETAIL } from './humanoid-rig';
import { PixelImage, mixColors, shade, type Rgb } from './pixel-art';
import {
  Camera,
  VolumeCanvas,
  axesAlong,
  noise,
  ramp,
  solid,
  type Ramp,
  type Vec3,
} from './volume';

/**
 * Ventana de un cuerpo, como en UO: un ataúd de madera visto desde arriba,
 * con la calavera y los huesos cruzados en la cabecera. Medidas en pixeles
 * de pantalla (la imagen viene al doble de detalle).
 */
export const COFFIN_WIDTH = 180;
export const COFFIN_HEIGHT = 262;
/** Dónde van los objetos, dentro del ataúd. */
export const COFFIN_INTERIOR = { x: 24, y: 70, width: 132, height: 176 } as const;

/** Silueta del ataúd: angosto en la cabecera, ancho en los hombros y largo hasta los pies. */
const OUTER: readonly (readonly [number, number])[] = [
  [54, 40],
  [126, 40],
  [174, 92],
  [142, 256],
  [38, 256],
  [6, 92],
];
/** Ancho del marco de la tapa. */
const FRAME = 13;

const WOOD_FRAME: Rgb = [112, 74, 44];
const WOOD_INSIDE: Rgb = [58, 38, 26];
const OUTLINE: Rgb = [18, 12, 10];

/**
 * Distancia (con signo) de un punto al borde del polígono: positiva adentro.
 * También devuelve la normal hacia afuera del lado más cercano (para la luz).
 */
function edgeDistance(x: number, y: number): { d: number; nx: number; ny: number } {
  let best = Infinity;
  let nx = 0;
  let ny = 0;
  let inside = false;
  for (let i = 0; i < OUTER.length; i++) {
    const [ax, ay] = OUTER[i] ?? [0, 0];
    const [bx, by] = OUTER[(i + 1) % OUTER.length] ?? [0, 0];
    // Regla par-impar para saber si está adentro.
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    const ex = bx - ax;
    const ey = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey)));
    const dx = x - (ax + ex * t);
    const dy = y - (ay + ey * t);
    const d = Math.hypot(dx, dy);
    if (d < best) {
      best = d;
      const length = Math.hypot(ex, ey);
      // La normal hacia afuera de un polígono horario (en pantalla, y hacia abajo).
      nx = ey / length;
      ny = -ex / length;
    }
  }
  return { d: inside ? best : -best, nx, ny };
}

export function drawCoffin(): PixelImage {
  const k = ART_DETAIL;
  const image = new PixelImage(COFFIN_WIDTH * k, COFFIN_HEIGHT * k);
  for (let py = 0; py < image.height; py++) {
    for (let px = 0; px < image.width; px++) {
      const x = (px + 0.5) / k;
      const y = (py + 0.5) / k;
      const { d, nx, ny } = edgeDistance(x, y);
      if (d < 0) continue;
      const grain = noise(Math.floor(x * 0.7), Math.floor(y * 0.15)) * 0.12;
      if (d < FRAME) {
        // Marco biselado: la luz viene de arriba a la izquierda.
        const facing = -(nx * -0.6 + ny * -0.8);
        const bevel = d < 3 ? 1.12 : d > FRAME - 3 ? 0.72 : 1;
        const light = 0.86 + facing * 0.22 + grain;
        image.set(px, py, shade(WOOD_FRAME, light * bevel));
        continue;
      }
      // Interior: tablas a lo largo, más oscuro hacia los pies y en los bordes (sombra del marco).
      const plank = Math.floor((x - 6) / 21);
      const seam = Math.abs(((x - 6) % 21) - 0) < 0.8;
      const depthShade = 0.95 - (y / COFFIN_HEIGHT) * 0.2 - Math.max(0, 6 - (d - FRAME)) * 0.04;
      const tone = 0.9 + noise(plank, 7) * 0.18 + grain;
      const wood = seam ? shade(WOOD_INSIDE, 0.55) : shade(WOOD_INSIDE, tone * depthShade);
      image.set(px, py, wood);
    }
  }
  // Clavos en las esquinas del marco.
  for (const [cx, cy] of [
    [60, 48],
    [120, 48],
    [44, 248],
    [136, 248],
    [16, 96],
    [164, 96],
  ] as const) {
    for (let dy = -2 * k; dy <= 2 * k; dy++)
      for (let dx = -2 * k; dx <= 2 * k; dx++) {
        const r = Math.hypot(dx, dy) / k;
        if (r <= 1.8)
          image.set(cx * k + dx, cy * k + dy, mixColors([196, 170, 110], [70, 56, 36], r / 1.8));
      }
  }
  image.outline(OUTLINE, 1);
  image.draw(drawSkullAndBones(), (COFFIN_WIDTH / 2 - 55) * k, 0);
  return image;
}

/** Calavera con dos huesos cruzados detrás, de frente. */
function drawSkullAndBones(): PixelImage {
  const k = ART_DETAIL;
  const canvas = new VolumeCanvas(110 * k, 84 * k, new Camera(0, 55 * k, 78 * k, 0.12, 3.4 * k));
  const bone = ramp([226, 214, 182]);
  const boneMaterial = solid(bone);
  // Huesos cruzados: cada uno con dos nudos en cada punta.
  for (const tilt of [1, -1]) {
    const a: Vec3 = [-11.5, 13 - tilt * 6.5, -3];
    const b: Vec3 = [11.5, 13 + tilt * 6.5, -3];
    canvas.limb(a, b, 1.25, 1.25, boneMaterial);
    for (const end of [a, b]) {
      const across = axesAlong([b[0] - a[0], b[1] - a[1], 0])[1];
      for (const side of [1, -1]) {
        canvas.sphere(
          [end[0] + across[0] * side * 1.2, end[1] + across[1] * side * 1.2, end[2]],
          1.65,
          boneMaterial,
        );
      }
    }
  }
  drawSkull(canvas, bone);
  return canvas.toImage(OUTLINE);
}

/** Cráneo de frente: bóveda, pómulos, cuencas hondas, hueco de la nariz y dientes. */
function drawSkull(canvas: VolumeCanvas, bone: Ramp): void {
  const solidBone = solid(bone);
  const front = axesAlong([0, 0, 1]);
  canvas.ellipsoid([0, 16.5, 1.5], front, [5.4, 5.6, 5.2], solidBone);
  canvas.ellipsoid([0, 12.6, 2.6], front, [4.4, 3.4, 4], solidBone);
  for (const side of [1, -1]) {
    canvas.ellipsoid([side * 3.4, 12.8, 3.6], front, [1.6, 1.4, 1.6], solid(bone, 0.3));
  }
  canvas.ellipsoid([0, 9.4, 3], front, [3, 1.7, 2.6], solidBone);
  const hollow = solid(ramp([46, 30, 26]), -1);
  for (const side of [1, -1]) {
    // Cuencas: huecos oscuros con el borde de hueso alrededor.
    canvas.ellipsoid([side * 2.25, 14.6, 5], front, [2.1, 2, 1], hollow);
  }
  canvas.ellipsoid([0, 12.2, 6.1], front, [0.95, 1.2, 0.7], hollow);
  // Dientes: una fila con separaciones.
  for (let i = -3; i <= 3; i++) {
    canvas.ellipsoid([i * 0.78, 10, 5.25], front, [0.34, 0.75, 0.4], solid(bone, 0.5));
  }
  canvas.ellipsoid([0, 10, 4.95], front, [2.9, 0.85, 0.5], hollow);
}
