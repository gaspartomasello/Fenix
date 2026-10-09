/**
 * Habilidades, como en UO: suben de a 0,1 al usarlas, hasta 100 cada una y
 * con un tope total. Se guardan en décimas (0–1000) para evitar decimales.
 */
export const SKILL_KEYS = [
  'wrestling',
  'swordsmanship',
  'fencing',
  'tactics',
  'parrying',
  'magery',
  'meditation',
  'mining',
  'lumberjacking',
  'blacksmithy',
] as const;

export type SkillKey = (typeof SKILL_KEYS)[number];
export type SkillValues = Readonly<Record<SkillKey, number>>;

export const SKILL_NAMES: Readonly<Record<SkillKey, string>> = {
  wrestling: 'Lucha',
  swordsmanship: 'Espadas',
  fencing: 'Esgrima',
  tactics: 'Tácticas',
  parrying: 'Parada',
  magery: 'Magia',
  meditation: 'Meditación',
  mining: 'Minería',
  lumberjacking: 'Leñador',
  blacksmithy: 'Herrería',
};

export const SKILL_DESCRIPTIONS: Readonly<Record<SkillKey, string>> = {
  wrestling: 'Pelear con los puños.',
  swordsmanship: 'Pelear con espadas y hachas.',
  fencing: 'Pelear con dagas.',
  tactics: 'Hace más daño cada golpe.',
  parrying: 'Bloquear golpes con un escudo.',
  magery: 'Lanzar hechizos sin que fallen.',
  meditation: 'Recuperar maná más rápido.',
  mining: 'Sacar mineral de las rocas con un pico.',
  lumberjacking: 'Talar árboles con un hacha.',
  blacksmithy: 'Fabricar armas y armaduras en el yunque.',
};

/** Máximo de una habilidad y de la suma de todas (en décimas). */
export const SKILL_MAX = 1000;
export const SKILL_TOTAL_CAP = 5000;

export const STARTING_SKILLS: SkillValues = {
  wrestling: 300,
  swordsmanship: 250,
  fencing: 250,
  tactics: 250,
  parrying: 150,
  magery: 300,
  meditation: 200,
  mining: 100,
  lumberjacking: 100,
  blacksmithy: 100,
};

export function isSkillKey(value: unknown): value is SkillKey {
  return typeof value === 'string' && (SKILL_KEYS as readonly string[]).includes(value);
}

/** "31.2" a partir de décimas. */
export function formatSkill(tenths: number): string {
  return (tenths / 10).toFixed(1);
}

/**
 * Probabilidad de subir 0,1 al usar una habilidad: alta al principio y cada
 * vez más baja cerca del máximo.
 */
export function skillGainChance(tenths: number): number {
  return Math.max(0.02, 0.6 * (1 - tenths / SKILL_MAX));
}
