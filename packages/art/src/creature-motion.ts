import { cyclePhase, type CharacterFrame } from './humanoid-rig';
import { noise, tone, type Material, type Ramp, type Vec3 } from './volume';

/**
 * Patas en diagonal: delantera derecha con trasera izquierda y al revés.
 * Devuelve cuánto avanza cada pata (en px) según el frame, con un ciclo
 * continuo (más cuadros, movimiento más suave).
 */
export function gait(
  frame: CharacterFrame,
  stride: number,
): { pairA: number; pairB: number; lift: number } {
  const cycle = cyclePhase(frame);
  if (!cycle) return { pairA: 0, pairB: 0, lift: 0 };
  const angle = cycle.phase * Math.PI * 2;
  const pairA = stride * Math.cos(angle);
  return { pairA, pairB: -pairA, lift: Math.abs(Math.sin(angle)) };
}

/** Mordida: en el golpe la cabeza se estira hacia adelante y abajo. */
export function biteOffset(frame: CharacterFrame, reach: number): Vec3 {
  if (typeof frame !== 'string') return [0, 0, 0];
  if (/^(slash|thrust|punch)-1$/.test(frame)) return [0, -reach * 0.5, reach];
  if (/^(slash|thrust|punch)-0$/.test(frame)) return [0, reach * 0.2, -reach * 0.3];
  return [0, 0, 0];
}

/** Pelaje: vientre más claro, lomo más oscuro y algo de textura. */
export function fur(colors: Ramp, belly: Ramp, saddleFrom: number): Material {
  return (s) => {
    if (s.n[1] < -0.35) return tone(belly, s.light);
    const speckle =
      noise(Math.floor(s.p[0] * 1.5), Math.floor(s.p[1] * 1.5), Math.floor(s.p[2])) > 0.78;
    const saddle = s.p[1] > saddleFrom && s.n[1] > 0.5;
    return tone(colors, s.light, (speckle ? -1 : 0) + (saddle ? -1 : 0));
  };
}
