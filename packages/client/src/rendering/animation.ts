import { WALK_FRAME_COUNT, type ActionStep, type CharacterFrame, type WalkStep } from '@fenix/art';

/**
 * Qué cuadro de animación mostrar en cada momento: caminar o correr, el
 * gesto de cada arma, lanzar un hechizo y los gestos de reposo. Son reglas
 * puras (sin dibujo) para poder probarlas.
 */

export type AttackStyle = 'slash' | 'thrust' | 'punch' | 'shoot';

/** Pasos de cada golpe: preparación más larga, golpe corto y seguida. */
const ATTACK_STEPS: Readonly<Record<AttackStyle, readonly ActionStep[]>> = {
  slash: [0, 0, 1, 2, 2],
  thrust: [0, 0, 1, 1, 2],
  punch: [0, 1, 1, 2],
  // Arco: tensar, sostener y soltar.
  shoot: [0, 1, 1, 1, 2],
};

export function attackFrame(style: AttackStyle, progress: number): CharacterFrame {
  const steps = ATTACK_STEPS[style];
  const step = steps[Math.min(steps.length - 1, Math.floor(progress * steps.length))] ?? 0;
  return `${style}-${step}`;
}

/** Lanzar un hechizo: las manos suben y bajan mientras dura. */
export const CAST_STEP_MS = 280;
export function castFrame(elapsed: number): CharacterFrame {
  return Math.floor(elapsed / CAST_STEP_MS) % 2 === 0 ? 'cast-0' : 'cast-1';
}

/**
 * Cada paso recorre medio ciclo (la mitad de los cuadros); pasos pares e
 * impares alternan la pierna.
 */
export function stepFrame(stepCount: number, progress: number, running: boolean): CharacterFrame {
  const perStep = WALK_FRAME_COUNT / 2;
  const half = stepCount % 2 === 0 ? 0 : perStep;
  const within = Math.min(perStep - 1, Math.floor(Math.max(0, progress) * perStep));
  const step = (half + within) as WalkStep;
  return running ? `run-${step}` : step;
}

type FidgetKind = 'shrug' | 'stance';

/** Secuencia de cada gesto: entra, se sostiene y vuelve. Lado 0 o 2 (uno u otro). */
const FIDGETS: Readonly<Record<FidgetKind, { steps: readonly (0 | 1)[]; duration: number }>> = {
  shrug: { steps: [0, 1, 1, 1, 0], duration: 1800 },
  stance: { steps: [0, 1, 1, 1, 1, 1, 1, 0], duration: 3400 },
};

/** Espera antes del primer gesto y entre gestos (ms): cada tanto, nunca seguidos. */
const FIRST_DELAY = { min: 3000, spread: 9000 };
const NEXT_DELAY = { min: 9000, spread: 11000 };
/** Después de moverse o pelear, al menos esto quieto antes de un gesto. */
const SETTLE_MS = 4000;

/**
 * Gestos de reposo de un personaje: cada tanto gira los hombros o pasa el
 * peso a una pierna. Alterna entre gestos y lados para que no se repita.
 */
export class Fidgets {
  private nextAt: number;
  private current: { kind: FidgetKind; side: 0 | 2; startedAt: number } | null = null;
  private last: FidgetKind | null = null;

  constructor(
    now: number,
    private readonly random: () => number = Math.random,
  ) {
    this.nextAt = now + FIRST_DELAY.min + this.random() * FIRST_DELAY.spread;
  }

  /** Cuadro del gesto si está quieto y le toca; null si no hay gesto. */
  frame(now: number, idle: boolean): CharacterFrame | null {
    if (!idle) {
      this.current = null;
      this.nextAt = Math.max(this.nextAt, now + SETTLE_MS);
      return null;
    }
    if (!this.current && now >= this.nextAt) {
      const kind: FidgetKind =
        this.last === null
          ? this.random() < 0.5
            ? 'shrug'
            : 'stance'
          : this.random() < 0.75
            ? this.last === 'shrug'
              ? 'stance'
              : 'shrug'
            : this.last;
      this.current = { kind, side: this.random() < 0.5 ? 0 : 2, startedAt: now };
      this.last = kind;
    }
    const current = this.current;
    if (!current) return null;
    const { steps, duration } = FIDGETS[current.kind];
    const t = (now - current.startedAt) / duration;
    if (t >= 1) {
      this.current = null;
      this.nextAt = now + NEXT_DELAY.min + this.random() * NEXT_DELAY.spread;
      return null;
    }
    const step = (steps[Math.floor(t * steps.length)] ?? 0) + current.side;
    return `${current.kind}-${step as ActionStep}`;
  }
}
