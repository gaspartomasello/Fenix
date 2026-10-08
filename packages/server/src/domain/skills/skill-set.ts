import {
  SKILL_KEYS,
  SKILL_MAX,
  SKILL_TOTAL_CAP,
  skillGainChance,
  type SkillKey,
  type SkillValues,
} from '@fenix/shared';

/** Habilidades de un jugador, que suben de a 0,1 al usarlas (con tope total). */
export class SkillSet {
  private readonly values: Record<SkillKey, number>;

  /** `onUse`: cada vez que se usa una habilidad (para entrenar atributos). */
  constructor(
    initial: SkillValues,
    private readonly onUse?: (key: SkillKey, random: () => number) => void,
  ) {
    this.values = { ...initial };
  }

  get(key: SkillKey): number {
    return this.values[key];
  }

  get total(): number {
    return SKILL_KEYS.reduce((sum, key) => sum + this.values[key], 0);
  }

  snapshot(): SkillValues {
    return { ...this.values };
  }

  /** Fija una habilidad (entre 0 y el máximo), para administradores y pruebas. */
  set(key: SkillKey, value: number): void {
    this.values[key] = Math.max(0, Math.min(SKILL_MAX, Math.round(value)));
  }

  /** Intenta subir una habilidad por haberla usado. Devuelve true si subió. */
  tryGain(key: SkillKey, random: () => number): boolean {
    this.onUse?.(key, random);
    const value = this.values[key];
    if (value >= SKILL_MAX || this.total >= SKILL_TOTAL_CAP) return false;
    if (random() >= skillGainChance(value)) return false;
    this.values[key] = value + 1;
    return true;
  }
}
