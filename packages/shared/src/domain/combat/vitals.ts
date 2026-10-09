/** Atributos base de un personaje o criatura (como en UO). */
export interface Attributes {
  readonly strength: number;
  readonly dexterity: number;
  readonly intelligence: number;
}

/** Vida, maná y energía actuales y máximos. */
export interface Vitals {
  readonly hits: number;
  readonly maxHits: number;
  readonly mana: number;
  readonly maxMana: number;
  readonly stamina: number;
  readonly maxStamina: number;
}

export const PLAYER_ATTRIBUTES: Attributes = { strength: 50, dexterity: 40, intelligence: 30 };

/** Vitales llenos según los atributos: vida = 50 + fuerza/2, energía = destreza, maná = inteligencia. */
export function fullVitals({ strength, dexterity, intelligence }: Attributes): Vitals {
  const maxHits = 50 + Math.floor(strength / 2);
  return {
    hits: maxHits,
    maxHits,
    mana: intelligence,
    maxMana: intelligence,
    stamina: dexterity,
    maxStamina: dexterity,
  };
}

/** Cada cuánto se recupera un punto fuera de combate. */
export const REGEN_INTERVAL_MS = { hits: 3000, mana: 2000, stamina: 1000 } as const;

/** Vida que devuelve la poción de curación. */
export const HEALING_POTION = [12, 22] as const;
/** Energía que devuelve la poción de vigor. */
export const REFRESH_POTION = 25;
/** Cuánto suben fuerza o destreza las pociones, y por cuánto tiempo. */
export const POTION_BOOST = { amount: 10, durationMs: 120_000 } as const;
/** Fuerza de la poción de purificación contra el veneno (0–1). */
export const CURE_POTION_POWER = 0.6;
