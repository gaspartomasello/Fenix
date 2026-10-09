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
  'magery',
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
  magery: 'Magia',
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
  magery: 'Lanzar hechizos sin que fallen.',
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
  { name: 'Magia', skills: ['magery', 'meditation', 'magic-resist', 'inscription'] },
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
  magery: 300,
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
 * Probabilidad de subir 0,1 al usar una habilidad: alta al principio y cada
 * vez más baja cerca del máximo.
 */
export function skillGainChance(tenths: number): number {
  return Math.max(0.02, 0.6 * (1 - tenths / SKILL_MAX));
}
