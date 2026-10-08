import {
  CRIMINAL_MS,
  FAME_MAX,
  KARMA_MAX,
  MURDER_DECAY_MS,
  clamp,
  notorietyOf,
  type Notoriety,
} from '@fenix/shared';

/** Fama, karma y marcas de crimen de un jugador. */
export class Reputation {
  fame = 0;
  karma = 0;
  murders = 0;
  criminalUntil = 0;
  /** Cuándo se olvida la próxima muerte de un inocente. */
  murderDecayAt = 0;
  private current: Notoriety = 'innocent';

  get notoriety(): Notoriety {
    return this.current;
  }

  /** Recalcula la reputación con el paso del tiempo. Devuelve true si cambió. */
  refresh(now: number): boolean {
    if (this.murders > 0 && now >= this.murderDecayAt) {
      this.murders -= 1;
      this.murderDecayAt = now + MURDER_DECAY_MS;
    }
    const next = notorietyOf(this.murders, this.criminalUntil, now);
    if (next === this.current) return false;
    this.current = next;
    return true;
  }

  /** Atacar a un inocente marca como criminal por un rato. */
  markCriminal(now: number): boolean {
    this.criminalUntil = now + CRIMINAL_MS;
    return this.refresh(now);
  }

  /** Matar a un inocente suma una muerte, que se olvida con el tiempo. */
  addMurder(now: number): boolean {
    if (this.murders === 0) this.murderDecayAt = now + MURDER_DECAY_MS;
    this.murders += 1;
    this.karma = clamp(this.karma - 500, KARMA_MAX);
    return this.refresh(now);
  }

  award(fame: number, karma: number): void {
    this.fame = clamp(this.fame + fame, FAME_MAX);
    this.karma = clamp(this.karma + karma, KARMA_MAX);
  }
}
