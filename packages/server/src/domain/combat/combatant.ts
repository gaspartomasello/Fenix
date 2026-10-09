import {
  POISON_TICK_MS,
  REGEN_INTERVAL_MS,
  fullVitals,
  poisonDamage,
  type AttributeKey,
  type Attributes,
  type EffectKind,
  type EffectSnapshot,
  type EntityId,
  type Vitals,
} from '@fenix/shared';

export interface RegenResult {
  readonly hits: boolean;
  readonly mana: boolean;
  readonly stamina: boolean;
}

/** Un efecto activo: cuánto vale, cuándo termina y (veneno) quién lo causó. */
interface ActiveEffect {
  readonly amount: number;
  readonly endsAt: number;
  readonly sourceId: EntityId | null;
  nextTickAt: number;
}

/** Lo que pasó con los efectos en un tick. */
export interface EffectTick {
  /** Cambió la lista de efectos (alguno terminó). */
  readonly changed: boolean;
  /** Daño del veneno en este tick (0 si no hubo). */
  readonly poisonDamage: number;
  readonly killed: boolean;
  /** Quién envenenó, si murió por el veneno. */
  readonly poisonerId: EntityId | null;
}

/**
 * Estado de combate de un personaje o criatura: vida, maná, energía, a quién
 * ataca, cuándo puede volver a golpear y los efectos activos (hechizos,
 * pociones, veneno). Las reglas de daño viven en `combat.ts`.
 */
export class Combatant {
  private base: Attributes;
  private vitals: Vitals;
  targetId: EntityId | null = null;
  nextSwingAt = 0;
  private dead = false;
  private readonly nextRegen = { hits: 0, mana: 0, stamina: 0 };
  private readonly effects = new Map<EffectKind, ActiveEffect>();

  constructor(
    attributes: Attributes,
    /** Vida máxima fija (criaturas); si no, sale de la fuerza. */
    private readonly fixedMaxHits?: number,
  ) {
    this.base = attributes;
    this.vitals = this.maxima();
  }

  get current(): Vitals {
    return this.vitals;
  }

  /** Atributos con los cambios de los efectos activos. */
  get attributes(): Attributes {
    const value = (key: AttributeKey): number =>
      Math.max(1, this.base[key] + (this.effects.get(key)?.amount ?? 0));
    return {
      strength: value('strength'),
      dexterity: value('dexterity'),
      intelligence: this.base.intelligence === 0 ? 0 : value('intelligence'),
    };
  }

  /** Atributos propios, sin los efectos. */
  get baseAttributes(): Attributes {
    return this.base;
  }

  /** Reemplaza los atributos propios (personajes de prueba) y recalcula los máximos. */
  setBaseAttributes(attributes: Attributes): void {
    this.base = attributes;
    this.refreshMaxima();
  }

  /** Sube un punto un atributo propio (entrenamiento) y recalcula los máximos. */
  raiseAttribute(key: AttributeKey): void {
    this.base = { ...this.base, [key]: this.base[key] + 1 };
    this.refreshMaxima();
  }

  get isDead(): boolean {
    return this.dead;
  }

  get isParalyzed(): boolean {
    return this.effects.has('paralyzed');
  }

  /** Vida como fracción (0–1). */
  get health(): number {
    return this.dead ? 0 : this.vitals.hits / this.vitals.maxHits;
  }

  /** Aplica daño. Devuelve true si este golpe lo mató. Un golpe corta la parálisis. */
  takeDamage(amount: number): boolean {
    if (this.dead) return false;
    if (amount > 0) this.effects.delete('paralyzed');
    const hits = Math.max(0, this.vitals.hits - amount);
    this.vitals = { ...this.vitals, hits };
    if (hits === 0) {
      this.dead = true;
      this.targetId = null;
      this.effects.clear();
      this.refreshMaxima();
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

  restoreMana(amount: number): void {
    this.vitals = {
      ...this.vitals,
      mana: Math.min(this.vitals.maxMana, this.vitals.mana + amount),
    };
  }

  /** Gasta maná; devuelve cuánto se gastó de verdad. */
  spendMana(amount: number): number {
    const spent = Math.min(amount, this.vitals.mana);
    this.vitals = { ...this.vitals, mana: this.vitals.mana - spent };
    return spent;
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

  // ── Efectos ────────────────────────────────────────────────────────

  /**
   * Pone (o renueva) un efecto. Un efecto del mismo tipo reemplaza al
   * anterior: un hechizo de Fuerza tapa una Debilidad, como en UO.
   */
  applyEffect(
    kind: EffectKind,
    amount: number,
    durationMs: number,
    now: number,
    sourceId: EntityId | null = null,
  ): void {
    if (this.dead) return;
    this.effects.set(kind, {
      amount,
      endsAt: now + durationMs,
      sourceId,
      nextTickAt: now + POISON_TICK_MS,
    });
    this.refreshMaxima();
  }

  removeEffect(kind: EffectKind): boolean {
    const had = this.effects.delete(kind);
    if (had) this.refreshMaxima();
    return had;
  }

  effect(kind: EffectKind): { amount: number } | undefined {
    const active = this.effects.get(kind);
    return active ? { amount: active.amount } : undefined;
  }

  effectsSnapshot(now: number): EffectSnapshot[] {
    return [...this.effects].map(([kind, e]) => ({
      kind,
      amount: e.amount,
      remainingMs: Math.max(0, e.endsAt - now),
    }));
  }

  /** Hace correr los efectos: termina los vencidos y aplica el veneno. */
  tickEffects(now: number, random: () => number): EffectTick {
    let changed = false;
    let damage = 0;
    let killed = false;
    let poisonerId: EntityId | null = null;
    for (const [kind, effect] of [...this.effects]) {
      if (kind === 'poison' && now >= effect.nextTickAt && !this.dead) {
        effect.nextTickAt = now + POISON_TICK_MS;
        const hit = poisonDamage(effect.amount, random);
        damage += hit;
        poisonerId = effect.sourceId;
        // El veneno no corta la parálisis.
        const hits = Math.max(0, this.vitals.hits - hit);
        this.vitals = { ...this.vitals, hits };
        if (hits === 0) {
          this.dead = true;
          this.targetId = null;
          this.effects.clear();
          killed = true;
          changed = true;
          break;
        }
      }
      if (now >= effect.endsAt) {
        this.effects.delete(kind);
        changed = true;
      }
    }
    if (changed) this.refreshMaxima();
    return { changed, poisonDamage: damage, killed, poisonerId: killed ? poisonerId : null };
  }

  /**
   * Recupera un punto de cada vital cuando le toca. `manaIntervalMs` permite
   * acelerar el maná (Meditación). El veneno no deja recuperar vida.
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
    if (!this.effects.has('poison')) tick('hits', v.maxHits, REGEN_INTERVAL_MS.hits);
    tick('mana', v.maxMana, manaIntervalMs);
    tick('stamina', v.maxStamina, REGEN_INTERVAL_MS.stamina);
    if (result.hits || result.mana || result.stamina) this.vitals = v;
    return result;
  }

  /** Máximos según los atributos actuales. */
  private maxima(): Vitals {
    const full = fullVitals(this.attributes);
    return this.fixedMaxHits === undefined
      ? full
      : { ...full, hits: this.fixedMaxHits, maxHits: this.fixedMaxHits };
  }

  /** Recalcula los máximos tras un cambio de atributos, sin pasarse de ellos. */
  private refreshMaxima(): void {
    const max = this.maxima();
    const v = this.vitals;
    this.vitals = {
      hits: Math.min(v.hits, max.maxHits),
      maxHits: max.maxHits,
      mana: Math.min(v.mana, max.maxMana),
      maxMana: max.maxMana,
      stamina: Math.min(v.stamina, max.maxStamina),
      maxStamina: max.maxStamina,
    };
  }

  private resetRegen(now: number): void {
    this.nextRegen.hits = now + REGEN_INTERVAL_MS.hits;
    this.nextRegen.mana = now + REGEN_INTERVAL_MS.mana;
    this.nextRegen.stamina = now + REGEN_INTERVAL_MS.stamina;
  }
}
