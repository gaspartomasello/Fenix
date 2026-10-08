import {
  REGEN_INTERVAL_MS,
  fullVitals,
  type Attributes,
  type EntityId,
  type Vitals,
} from '@fenix/shared';

export interface RegenResult {
  readonly hits: boolean;
  readonly mana: boolean;
  readonly stamina: boolean;
}

/**
 * Estado de combate de un personaje o criatura: vida, maná, energía, a quién
 * ataca y cuándo puede volver a golpear. Las reglas de daño viven en `combat.ts`.
 */
export class Combatant {
  readonly attributes: Attributes;
  private vitals: Vitals;
  targetId: EntityId | null = null;
  nextSwingAt = 0;
  private dead = false;
  private readonly nextRegen = { hits: 0, mana: 0, stamina: 0 };

  constructor(attributes: Attributes, maxHits?: number) {
    this.attributes = attributes;
    const full = fullVitals(attributes);
    this.vitals = maxHits === undefined ? full : { ...full, hits: maxHits, maxHits };
  }

  get current(): Vitals {
    return this.vitals;
  }

  get isDead(): boolean {
    return this.dead;
  }

  /** Vida como fracción (0–1). */
  get health(): number {
    return this.dead ? 0 : this.vitals.hits / this.vitals.maxHits;
  }

  /** Aplica daño. Devuelve true si este golpe lo mató. */
  takeDamage(amount: number): boolean {
    if (this.dead) return false;
    const hits = Math.max(0, this.vitals.hits - amount);
    this.vitals = { ...this.vitals, hits };
    if (hits === 0) {
      this.dead = true;
      this.targetId = null;
      return true;
    }
    return false;
  }

  heal(amount: number): void {
    if (this.dead) return;
    this.vitals = {
      ...this.vitals,
      hits: Math.min(this.vitals.maxHits, this.vitals.hits + amount),
    };
  }

  restoreStamina(amount: number): void {
    this.vitals = {
      ...this.vitals,
      stamina: Math.min(this.vitals.maxStamina, this.vitals.stamina + amount),
    };
  }

  spendStamina(amount: number): void {
    this.vitals = { ...this.vitals, stamina: Math.max(0, this.vitals.stamina - amount) };
  }

  /** Vuelve a la vida con una fracción de la vida máxima. */
  resurrect(fraction: number, now: number): void {
    this.dead = false;
    this.targetId = null;
    this.vitals = { ...this.vitals, hits: Math.max(1, Math.round(this.vitals.maxHits * fraction)) };
    this.resetRegen(now);
  }

  /** Vuelve a los vitales guardados (acotados a los máximos). */
  restore(saved: { hits: number; mana: number; stamina: number }, dead: boolean): void {
    const fit = (value: number, max: number): number =>
      Math.min(max, Math.max(0, Math.round(value)));
    this.vitals = {
      ...this.vitals,
      hits: dead ? 0 : Math.max(1, fit(saved.hits, this.vitals.maxHits)),
      mana: fit(saved.mana, this.vitals.maxMana),
      stamina: fit(saved.stamina, this.vitals.maxStamina),
    };
    this.dead = dead;
  }

  spendMana(amount: number): void {
    this.vitals = { ...this.vitals, mana: Math.max(0, this.vitals.mana - amount) };
  }

  /**
   * Recupera un punto de cada vital cuando le toca. `manaIntervalMs` permite
   * acelerar el maná (Meditación). Devuelve qué vitales cambiaron.
   */
  regenerate(now: number, manaIntervalMs: number = REGEN_INTERVAL_MS.mana): RegenResult {
    const result = { hits: false, mana: false, stamina: false };
    if (this.dead) return result;
    const v = { ...this.vitals };
    const tick = (key: 'hits' | 'mana' | 'stamina', max: number, interval: number): void => {
      if (now < this.nextRegen[key]) return;
      this.nextRegen[key] = now + interval;
      if (v[key] < max) {
        v[key] += 1;
        result[key] = true;
      }
    };
    tick('hits', v.maxHits, REGEN_INTERVAL_MS.hits);
    tick('mana', v.maxMana, manaIntervalMs);
    tick('stamina', v.maxStamina, REGEN_INTERVAL_MS.stamina);
    if (result.hits || result.mana || result.stamina) this.vitals = v;
    return result;
  }

  private resetRegen(now: number): void {
    this.nextRegen.hits = now + REGEN_INTERVAL_MS.hits;
    this.nextRegen.mana = now + REGEN_INTERVAL_MS.mana;
    this.nextRegen.stamina = now + REGEN_INTERVAL_MS.stamina;
  }
}
