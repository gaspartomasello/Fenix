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

/** Cuánta vida se recupera con objetos. */
export const HEALING = { potion: 20, apple: 3 } as const;
