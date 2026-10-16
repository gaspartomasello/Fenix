import { biteOffset, gait, tailWag } from './creature-motion';
import type { CharacterFrame } from './humanoid-rig';
import type { VolumeCanvas } from './volume';
import {
  add,
  axesAlong,
  lerp,
  noise,
  normalize,
  ramp,
  scale,
  solid,
  sub,
  tone,
  type Material,
  type Vec3,
} from './volume';

/** Lienzo del dragón grande: casi tres veces el alto de una persona con las alas en alto. */
export const GREAT_DRAGON_LAYOUT = { width: 288, height: 256, feetY: 226, headY: 26 } as const;
export const GREAT_DRAGON_ZOOM = 1.35;

const SCALES = ramp([176, 44, 30]);
const SCALES_DARK = ramp([120, 28, 22]);
const BELLY = ramp([220, 156, 84]);
const MEMBRANE = ramp([184, 78, 38]);
const IVORY = ramp([230, 218, 190]);

/** Escamas: lomo con placas más oscuras, vientre claro en franjas. */
const scales: Material = (s) => {
  if (s.n[1] < -0.35) return tone(BELLY, s.light, Math.floor(s.p[2] / 2.6) % 2 === 0 ? 0 : -1);
  const plate = noise(Math.floor(s.p[0] / 2), Math.floor(s.p[1] / 2), Math.floor(s.p[2] / 2));
  const ridge = s.n[1] > 0.7 && plate > 0.6;
  return tone(ridge ? SCALES_DARK : SCALES, s.light, plate > 0.86 ? 1 : 0);
};

/** Membrana del ala: anaranjada, con venas finas que salen de los dedos. */
const membrane: Material = (s) =>
  tone(MEMBRANE, 0.35 + s.light * 0.6, Math.sin(s.p[1] * 0.9 + s.p[2] * 0.6) > 0.93 ? -1 : 0);

/**
 * Dragón grande: cuatro patas con garras (las de atrás con el talón alto),
 * cuerpo macizo, cuello largo en S, cabeza con cuernos hacia atrás y
 * crestas en la mandíbula, púas por el lomo, cola larga que termina en
 * curva y alas enormes plegadas hacia arriba: el brazo del ala sube a una
 * muñeca alta y de ahí bajan los dedos largos con la membrana entre ellos.
 * Muerto, queda con las alas abiertas sobre el suelo.
 */
export function drawGreatDragon(c: VolumeCanvas, frame: CharacterFrame): void {
  const step = gait(frame, 9);
  const dead = frame === 'dead';
  const bob = step.lift * 1.5;
  const wag = tailWag(frame) * 6;
  const flap = typeof frame === 'string' && /-1$/.test(frame) ? 6 : step.lift * 3;
  const claws = solid(IVORY);

  // ── Alas ──
  for (const side of [1, -1] as const) {
    const root: Vec3 = [side * 9, 48 + bob, 12];
    const elbow: Vec3 = dead ? [side * 34, 30, 4] : [side * 18, 82 + bob + flap * 0.5, 4];
    const wrist: Vec3 = dead ? [side * 60, 14, -10] : [side * 15, 118 + bob + flap, -12];
    const fingers: Vec3[] = dead
      ? [
          [side * 86, 3, -34],
          [side * 74, 3, -54],
          [side * 52, 3, -58],
          [side * 30, 6, -40],
        ]
      : [
          [side * 24, 92 + bob + flap, -70],
          [side * 28, 66 + bob, -66],
          [side * 26, 48 + bob, -46],
          [side * 19, 42 + bob, -22],
        ];
    c.limb(root, elbow, 4, 3, scales);
    c.limb(elbow, wrist, 3, 2.2, scales);
    c.sphere(elbow, 3.2, scales);
    // El pulgar con su garra, en la muñeca.
    c.limb(wrist, add(wrist, [side * 1.5, 4, 3]), 1.2, 0.3, claws);
    fingers.forEach((tip, k) => c.limb(wrist, tip, 1.9 - k * 0.25, 0.5, scales));
    // Membrana entre dedo y dedo, con el borde mordido (la punta del medio se hunde).
    const body: Vec3 = dead ? [side * 14, 10, -16] : [side * 12, 40 + bob, -10];
    const span = [...fingers, body];
    for (let k = 0; k < span.length - 1; k++) {
      const a = span[k] as Vec3;
      const b = span[k + 1] as Vec3;
      const notch = lerp(lerp(a, b, 0.5), wrist, 0.18);
      c.polygon([wrist, a, notch, b], membrane);
    }
    c.polygon([root, elbow, wrist, body], membrane);
  }

  // ── Patas ──
  for (const side of [1, -1] as const) {
    // Delantera: hombro, codo atrás, mano con tres garras.
    const swing = side === 1 ? step.pairA : step.pairB;
    const top: Vec3 = [side * 12, 34 + bob, 22];
    const elbow: Vec3 = [side * 14, 18 + bob * 0.5, 18 + swing * 0.4];
    const hand: Vec3 = [side * 13, 3, 24 + swing];
    c.ellipsoid(add(top, [0, 2, 0]), axesAlong([0, 1, 0.2]), [8.5, 12, 9.5], scales);
    c.limb(top, elbow, 7.4, 6, scales);
    c.limb(elbow, hand, 6, 4.6, scales);
    c.ellipsoid(add(hand, [0, -0.6, 2]), axesAlong([0, 0, 1]), [4.2, 2.2, 5], scales);
    for (const k of [-2, 0, 2])
      c.limb(add(hand, [k, -1.2, 6]), add(hand, [k * 1.1, -2.6, 9]), 0.9, 0.2, claws);

    // Trasera: muslo grueso, rodilla adelante, talón alto atrás.
    const back = side === 1 ? step.pairB : step.pairA;
    const hip: Vec3 = [side * 13, 34 + bob, -20];
    const knee: Vec3 = [side * 16, 22 + bob * 0.5, -10 + back * 0.3];
    const hock: Vec3 = [side * 15, 10, -24 + back * 0.6];
    const foot: Vec3 = [side * 15, 2, -18 + back];
    c.ellipsoid(hip, axesAlong([0, 1, -0.1]), [10, 15, 13], scales);
    c.limb(hip, knee, 8.6, 6.6, scales);
    c.limb(knee, hock, 6.6, 4.6, scales);
    c.limb(hock, foot, 4.6, 4, scales);
    c.ellipsoid(add(foot, [0, -0.6, 2.4]), axesAlong([0, 0, 1]), [4.4, 2.2, 5.6], scales);
    for (const k of [-2, 0, 2])
      c.limb(add(foot, [k, -1.2, 6.6]), add(foot, [k * 1.1, -2.6, 9.6]), 0.9, 0.2, claws);
  }

  // ── Cuerpo ──
  c.ellipsoid([0, 37 + bob, 0], axesAlong([0, 0.08, 1]), [18, 17, 30], scales);
  c.ellipsoid([0, 41 + bob, 18], axesAlong([0, 0.2, 1]), [17, 18, 16], scales);
  c.ellipsoid([0, 34 + bob, -20], axesAlong([0, -0.1, 1]), [14, 14, 14], scales);

  // ── Cola: larga, se afina y termina en curva ──
  const tail: Vec3[] = dead
    ? [
        [0, 30, -32],
        [4, 12, -50],
        [2, 5, -70],
        [-6, 4, -88],
        [-18, 4, -100],
        [-30, 5, -104],
      ]
    : [
        [0, 32 + bob, -32],
        [wag * 0.3 + 3, 26, -50],
        [wag * 0.6 - 2, 18, -68],
        [wag - 10, 12, -84],
        [wag - 22, 12, -96],
        [wag - 30, 18, -102],
      ];
  tail.slice(1).forEach((to, i) => {
    const from = tail[i] ?? to;
    c.limb(from, to, 9 - i * 1.6, 9 - (i + 1) * 1.6, scales);
  });
  // La punta, como una hoja.
  const end = tail[tail.length - 1] as Vec3;
  c.ellipsoid(
    end,
    axesAlong(normalize(sub(end, tail[tail.length - 2] as Vec3))),
    [3, 1, 4],
    scales,
  );

  // ── Cuello en S y cabeza ──
  const bite = biteOffset(frame, 10);
  const neck: Vec3[] = dead
    ? [
        [0, 40, 28],
        [0, 30, 42],
        [0, 18, 54],
        [0, 10, 64],
      ]
    : [
        [0, 46 + bob, 30],
        [0, 60 + bob, 40],
        add([0, 74 + bob, 42], scale(bite, 0.3)),
        add([0, 84 + bob, 48], scale(bite, 0.7)),
      ];
  neck.slice(1).forEach((to, i) => {
    const from = neck[i] ?? to;
    c.limb(from, to, 11 - i * 1.5, 11 - (i + 1) * 1.5, scales);
  });
  // Púas del lomo: del cuello a la cola.
  const spine = [
    ...neck.slice(1).reverse(),
    [0, 51 + bob, 10] as Vec3,
    [0, 49 + bob, -8] as Vec3,
    ...tail.slice(0, 4),
  ];
  spine.forEach((p, i) => {
    const size = i < 3 ? 2.6 : 3.6 - i * 0.25;
    if (size <= 0.6) return;
    c.limb(
      add(p, [0, 4, 0]),
      add(p, [0, 4 + size * 2.2, -size]),
      size * 0.6,
      0.2,
      solid(SCALES_DARK),
    );
  });

  const head: Vec3 = dead ? [0, 8, 72] : add([0, 88 + bob, 56], bite);
  const look = dead ? axesAlong([0, -0.1, 1]) : axesAlong([0, -0.25, 1]);
  c.ellipsoid(head, look, [8, 7.6, 10], scales);
  // Hocico largo, mandíbula y fosas.
  const snout = add(head, dead ? [0, -1, 11] : [0, -3.4, 11]);
  c.ellipsoid(snout, look, [5.4, 4.2, 8], scales);
  const open = bite[2] > 1 ? 3 : 0;
  c.ellipsoid(add(snout, [0, -3.6 - open, -1]), look, [4.6, 2.2, 7.4], scales);
  for (const side of [1, -1] as const) {
    // Cuernos largos hacia atrás, y uno chico más abajo.
    const base = add(head, [side * 3.4, 4, -3]);
    const mid = add(base, [side * 2, 4, -8]);
    c.limb(base, mid, 1.8, 1.2, solid(IVORY));
    c.limb(mid, add(mid, [side * 1, 1.5, -7]), 1.2, 0.2, solid(IVORY));
    c.limb(add(head, [side * 5, -1, -3]), add(head, [side * 8, 0, -9]), 1, 0.2, solid(IVORY));
    // Crestas en la mandíbula.
    for (const k of [0, 1, 2])
      c.limb(
        add(head, [side * 5, -3 + k, 1 - k * 3]),
        add(head, [side * 8, -3 + k * 0.5, -2 - k * 3]),
        0.8,
        0.2,
        solid(SCALES_DARK),
      );
    c.decal(
      add(head, [side * 3.2, 1.6, 4.6]),
      normalize([side * 0.7, 0.2, 0.7]),
      dead ? [60, 20, 18] : [255, 214, 64],
      2,
      1,
    );
    c.decal(
      add(snout, [side * 1.6, 2.2, 5.6]),
      normalize([side * 0.3, 0.5, 0.8]),
      [40, 16, 12],
      1,
      1,
    );
  }
  // Fuego en la boca al atacar.
  if (bite[2] > 1)
    c.sphere(add(snout, [0, -2, 9]), 3.6, (s) => tone(ramp([255, 176, 64]), 0.7 + s.light * 0.3));
}
