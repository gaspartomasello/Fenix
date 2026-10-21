/**
 * Habilidades, como en UO: suben de a 0,1 al usarlas, hasta 100 cada una y
 * con un tope total. Se guardan en décimas (0–1000) para evitar decimales.
 */
export const SKILL_KEYS = [
  'wrestling',
  'swordsmanship',
  'fencing',
  'mace-fighting',
  'archery',
  'tactics',
  'anatomy',
  'parrying',
  'healing',
  'hiding',
  'stealth',
  'detect-hidden',
  'tracking',
  'lockpicking',
  'snooping',
  'stealing',
  'magery',
  'evaluating-intelligence',
  'meditation',
  'magic-resist',
  'inscription',
  'mining',
  'lumberjacking',
  'fishing',
  'blacksmithy',
  'tailoring',
  'carpentry',
  'bowcraft',
  'alchemy',
  'cooking',
] as const;

export type SkillKey = (typeof SKILL_KEYS)[number];
export type SkillValues = Readonly<Record<SkillKey, number>>;

export const SKILL_NAMES: Readonly<Record<SkillKey, string>> = {
  wrestling: 'Lucha',
  swordsmanship: 'Espadas',
  fencing: 'Esgrima',
  'mace-fighting': 'Mazas',
  archery: 'Arquería',
  tactics: 'Tácticas',
  anatomy: 'Anatomía',
  parrying: 'Parada',
  healing: 'Primeros auxilios',
  hiding: 'Esconderse',
  stealth: 'Sigilo',
  'detect-hidden': 'Mirar',
  tracking: 'Rastrear',
  lockpicking: 'Forzar cerraduras',
  snooping: 'Fisgonear',
  stealing: 'Robar',
  magery: 'Magia',
  'evaluating-intelligence': 'Evaluar inteligencia',
  meditation: 'Meditación',
  'magic-resist': 'Resistencia mágica',
  inscription: 'Inscripción',
  mining: 'Minería',
  lumberjacking: 'Leñador',
  fishing: 'Pesca',
  blacksmithy: 'Herrería',
  tailoring: 'Sastrería',
  carpentry: 'Carpintería',
  bowcraft: 'Flechería',
  alchemy: 'Alquimia',
  cooking: 'Cocina',
};

export const SKILL_DESCRIPTIONS: Readonly<Record<SkillKey, string>> = {
  wrestling: 'Pelear con los puños.',
  swordsmanship: 'Pelear con espadas y hachas.',
  fencing: 'Pelear con dagas, estoques y lanzas.',
  'mace-fighting': 'Pelear con mazas y martillos de guerra.',
  archery: 'Disparar con arco (gasta flechas).',
  tactics: 'Hace más daño cada golpe.',
  anatomy: 'Conocer el cuerpo: más daño y mejores vendajes.',
  parrying: 'Bloquear golpes con un escudo.',
  healing: 'Vendar heridas (y curar el veneno con práctica).',
  hiding: 'Desaparecer de la vista de los demás (se usa a propósito).',
  stealth: 'Caminar escondido sin que te descubran (un paso cada 10 puntos).',
  'detect-hidden': 'Encontrar a los que están escondidos cerca (se usa a propósito).',
  tracking:
    'Seguir el rastro de animales, monstruos, personas y vecinos lejanos (se usa a propósito).',
  lockpicking: 'Abrir cofres cerrados con llave usando ganzúas.',
  snooping: 'Mirar sin permiso lo que otro lleva en la mochila (se usa a propósito).',
  stealing: 'Sacarle algo de la mochila a otro sin que se dé cuenta (se usa a propósito).',
  magery: 'Lanzar hechizos sin que fallen.',
  'evaluating-intelligence': 'Conocer la mente: los hechizos de daño pegan más fuerte.',
  meditation: 'Recuperar maná más rápido.',
  'magic-resist': 'Recibir menos daño de los hechizos y resistir maldiciones.',
  inscription: 'Escribir pergaminos de hechizos.',
  mining: 'Sacar mineral de las rocas con un pico.',
  lumberjacking: 'Talar árboles con un hacha.',
  fishing: 'Pescar en el agua con una caña.',
  blacksmithy: 'Fabricar armas y armaduras de metal en el yunque.',
  tailoring: 'Coser ropa, armaduras de cuero y vendas.',
  carpentry: 'Trabajar la madera: tablas, escudos y cañas.',
  bowcraft: 'Fabricar arcos y flechas.',
  alchemy: 'Preparar pociones con reactivos.',
  cooking: 'Cocinar comida cerca del fuego.',
};

/** Grupos de habilidades, como en la ventana de UO. */
export const SKILL_GROUPS: readonly {
  readonly name: string;
  readonly skills: readonly SkillKey[];
}[] = [
  {
    name: 'Combate',
    skills: [
      'wrestling',
      'swordsmanship',
      'fencing',
      'mace-fighting',
      'archery',
      'tactics',
      'anatomy',
      'parrying',
      'healing',
    ],
  },
  {
    name: 'Magia',
    skills: ['magery', 'evaluating-intelligence', 'meditation', 'magic-resist', 'inscription'],
  },
  { name: 'Sigilo', skills: ['hiding', 'stealth', 'detect-hidden', 'tracking'] },
  { name: 'Ladrón', skills: ['lockpicking', 'snooping', 'stealing'] },
  { name: 'Recolección', skills: ['mining', 'lumberjacking', 'fishing'] },
  {
    name: 'Oficios',
    skills: ['blacksmithy', 'tailoring', 'carpentry', 'bowcraft', 'alchemy', 'cooking'],
  },
];

/** Máximo de una habilidad y de la suma de todas (en décimas), como los 700 puntos de UO. */
export const SKILL_MAX = 1000;
export const SKILL_TOTAL_CAP = 7000;

export const STARTING_SKILLS: SkillValues = {
  wrestling: 300,
  swordsmanship: 250,
  fencing: 250,
  'mace-fighting': 200,
  archery: 200,
  tactics: 250,
  anatomy: 150,
  parrying: 150,
  healing: 200,
  hiding: 100,
  stealth: 0,
  'detect-hidden': 100,
  tracking: 100,
  lockpicking: 0,
  snooping: 0,
  stealing: 0,
  magery: 300,
  'evaluating-intelligence': 150,
  meditation: 200,
  'magic-resist': 200,
  inscription: 100,
  mining: 100,
  lumberjacking: 100,
  fishing: 100,
  blacksmithy: 100,
  tailoring: 100,
  carpentry: 100,
  bowcraft: 100,
  alchemy: 100,
  cooking: 100,
};

export function isSkillKey(value: unknown): value is SkillKey {
  return typeof value === 'string' && (SKILL_KEYS as readonly string[]).includes(value);
}

/** "31.2" a partir de décimas. */
export function formatSkill(tenths: number): string {
  return (tenths / 10).toFixed(1);
}

/**
 * Probabilidad de subir al usar una habilidad: casi segura al principio y
 * más baja cerca del máximo, pero nunca imposible (no es tan exigente como
 * el UO original: se llega a gran maestro jugando, no en meses).
 */
export function skillGainChance(tenths: number): number {
  return Math.max(SKILL_GAIN_FLOOR, 0.9 * (1 - tenths / SKILL_MAX));
}

/** La chance más baja de subir (ya cerca de 100). */
export const SKILL_GAIN_FLOOR = 0.15;

/** Cuánto sube (en décimas) cada vez: más rápido al principio. */
export function skillGainAmount(tenths: number): number {
  if (tenths < 300) return 5;
  if (tenths < 600) return 3;
  if (tenths < 850) return 2;
  return 1;
}
