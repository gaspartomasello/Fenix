import {
  REGEN_INTERVAL_MS,
  fullVitals,
  type Attributes,
  type EntityId,
  type Vitals,
} from '@fenix/shared';

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

  /** Recupera un punto de cada vital cuando le toca. Devuelve true si algo cambió. */
  regenerate(now: number): boolean {
    if (this.dead) return false;
    let changed = false;
    const v = { ...this.vitals };
    const tick = (key: 'hits' | 'mana' | 'stamina', max: number): void => {
      if (now < this.nextRegen[key]) return;
      this.nextRegen[key] = now + REGEN_INTERVAL_MS[key];
      if (v[key] < max) {
        v[key] += 1;
        changed = true;
      }
    };
    tick('hits', v.maxHits);
    tick('mana', v.maxMana);
    tick('stamina', v.maxStamina);
    if (changed) this.vitals = v;
    return changed;
  }

  private resetRegen(now: number): void {
    this.nextRegen.hits = now + REGEN_INTERVAL_MS.hits;
    this.nextRegen.mana = now + REGEN_INTERVAL_MS.mana;
    this.nextRegen.stamina = now + REGEN_INTERVAL_MS.stamina;
  }
}
