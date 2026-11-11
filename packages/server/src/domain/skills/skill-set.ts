import {
  SKILL_KEYS,
  SKILL_MAX,
  SKILL_TOTAL_CAP,
  skillGainAmount,
  skillGainChance,
  type SkillKey,
  type SkillValues,
  type SkillDirection,
  type SkillDirections,
} from '@fenix/shared/skills/skill-catalog';

/** Habilidades de un jugador, que suben de a 0,1 al usarlas (con tope total). */
export class SkillSet {
  private readonly values: Record<SkillKey, number>;
  private readonly directions: Partial<Record<SkillKey, SkillDirection>>;

  /** `onUse`: cada vez que se usa una habilidad (para entrenar atributos). */
  constructor(
    initial: SkillValues,
    private readonly onUse?: (key: SkillKey, random: () => number) => void,
    initialDirections: SkillDirections = {},
  ) {
    this.values = { ...initial };
    this.directions = { ...initialDirections };
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

  directionsSnapshot(): SkillDirections {
    return { ...this.directions };
  }

  direction(key: SkillKey): SkillDirection {
    return this.directions[key] ?? 'up';
  }

  setDirection(key: SkillKey, direction: SkillDirection): void {
    this.directions[key] = direction;
  }

  /** Fija una habilidad (entre 0 y el máximo), para administradores y pruebas. */
  set(key: SkillKey, value: number): void {
    this.values[key] = Math.max(0, Math.min(SKILL_MAX, Math.round(value)));
  }

  /** Intenta subir una habilidad por haberla usado. Devuelve true si subió. */
  /** `boost` multiplica cuánto sube (para las habilidades que se usan poco y despacio). */
  tryGain(key: SkillKey, random: () => number, boost = 1): boolean {
    this.onUse?.(key, random);
    const value = this.values[key];
    if (this.direction(key) !== 'up' || value >= SKILL_MAX) return false;
    const free = Math.max(0, SKILL_TOTAL_CAP - this.total);
    const donors = SKILL_KEYS.filter((other) => other !== key && this.direction(other) === 'down');
    const available = donors.reduce((sum, other) => sum + this.values[other], 0);
    const amount = Math.min(skillGainAmount(value) * boost, SKILL_MAX - value, free + available);
    if (amount <= 0 || random() >= skillGainChance(value)) return false;
    let needed = Math.max(0, amount - free);
    for (const donor of donors) {
      const taken = Math.min(needed, this.values[donor]);
      this.values[donor] -= taken;
      needed -= taken;
      if (needed === 0) break;
    }
    this.values[key] = value + amount;
    return true;
  }
}
