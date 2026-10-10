import type { ItemKind } from '../items/item-catalog';
import type { Weapon } from '../combat/weapons';
import type { SpellKey } from '../magic/spell-catalog';
import { MOUNTS, MOUNT_KINDS, type MountKind } from '../mounts/mount-catalog';

export const CREATURE_KINDS = [
  'rat',
  'wolf',
  'skeleton',
  // De la isla y de la mazmorra
  'giant-spider',
  'orc',
  'troll',
  'skeleton-mage',
  'lich',
  'dragon',
  // Invocaciones del octavo círculo
  'energy-vortex',
  'air-elemental',
  'earth-elemental',
  'fire-elemental',
  'water-elemental',
  'daemon',
  // Monturas, sueltas siguiendo a su dueño
  ...MOUNT_KINDS,
] as const;
export type CreatureKind = (typeof CREATURE_KINDS)[number];

export interface LootEntry {
  readonly kind: ItemKind;
  /** Probabilidad de que aparezca (0–1). */
  readonly chance: number;
  readonly amount?: readonly [number, number];
}

export interface CreatureDefinition {
  readonly kind: CreatureKind;
  readonly name: string;
  readonly article: 'un' | 'una';
  readonly maxHits: number;
  readonly strength: number;
  readonly dexterity: number;
  readonly armor: number;
  /** Habilidad de pelea, en décimas. */
  readonly skill: number;
  readonly weapon: Weapon;
  /** Tiempo para avanzar un tile. */
  readonly moveMs: number;
  /** A qué distancia ve a un jugador y lo ataca. */
  readonly aggroRange: number;
  readonly loot: readonly LootEntry[];
  /** Cuerpo con forma de persona: usa los gestos de los personajes (golpes, caminar). */
  readonly humanoid: boolean;
  /** Solo aparece invocada con un hechizo (no hay salvajes). */
  readonly summoned: boolean;
  /** Comportamientos especiales (si no hay, pelea cuerpo a cuerpo). */
  readonly abilities?: CreatureAbilities;
}

/** Lo que hace una criatura además de pegar. */
export interface CreatureAbilities {
  /** Sus golpes pueden envenenar. */
  readonly poison?: { readonly chance: number; readonly level: number };
  /** Lanza hechizos: se queda a distancia y los tira cada tanto. */
  readonly spells?: {
    readonly attack: readonly SpellKey[];
    /** Hechizo para curarse cuando le queda poca vida. */
    readonly heal?: SpellKey;
    /** Magia con la que los lanza (en décimas). */
    readonly magery: number;
    readonly cooldownMs: number;
    /** Distancia a la que prefiere pelear. */
    readonly range: number;
  };
  /** Escupe fuego: daña al objetivo y a quienes estén pegados a él. */
  readonly breath?: {
    readonly power: readonly [number, number];
    readonly cooldownMs: number;
    readonly range: number;
  };
  /** Vida que recupera por segundo, aun peleando. */
  readonly regeneration?: number;
  /** Huye cuando le queda esta fracción de vida o menos. */
  readonly fleeAt?: number;
  /** Resistencia mágica (en décimas); si no, la mitad de su habilidad. */
  readonly magicResist?: number;
}

export const CREATURES: Readonly<Record<CreatureKind, CreatureDefinition>> = {
  rat: {
    kind: 'rat',
    name: 'rata gigante',
    article: 'una',
    maxHits: 14,
    strength: 10,
    dexterity: 30,
    armor: 0,
    skill: 250,
    weapon: { name: 'mordida', minDamage: 1, maxDamage: 3, swingMs: 1800, skill: 'wrestling' },
    moveMs: 450,
    aggroRange: 4,
    humanoid: false,
    summoned: false,
    loot: [
      { kind: 'gold', chance: 0.9, amount: [2, 8] },
      { kind: 'apple', chance: 0.2, amount: [1, 2] },
      { kind: 'garlic', chance: 0.25, amount: [1, 3] },
      { kind: 'raw-ribs', chance: 0.4, amount: [1, 1] },
      { kind: 'hides', chance: 0.3, amount: [1, 1] },
    ],
  },
  wolf: {
    kind: 'wolf',
    name: 'lobo gris',
    article: 'un',
    maxHits: 32,
    strength: 30,
    dexterity: 45,
    armor: 4,
    skill: 450,
    weapon: { name: 'mordida', minDamage: 3, maxDamage: 8, swingMs: 2000, skill: 'wrestling' },
    moveMs: 340,
    aggroRange: 7,
    humanoid: false,
    summoned: false,
    loot: [
      { kind: 'gold', chance: 1, amount: [6, 18] },
      { kind: 'leather-cap', chance: 0.1 },
      { kind: 'leather-armor', chance: 0.08 },
      { kind: 'ginseng', chance: 0.3, amount: [1, 3] },
      { kind: 'spiders-silk', chance: 0.2, amount: [1, 2] },
      { kind: 'hides', chance: 0.9, amount: [2, 4] },
      { kind: 'raw-ribs', chance: 0.7, amount: [1, 2] },
    ],
  },
  skeleton: {
    kind: 'skeleton',
    name: 'esqueleto',
    article: 'un',
    maxHits: 45,
    strength: 40,
    dexterity: 35,
    armor: 10,
    skill: 550,
    weapon: {
      name: 'espada oxidada',
      minDamage: 4,
      maxDamage: 10,
      swingMs: 2400,
      skill: 'swordsmanship',
    },
    moveMs: 480,
    aggroRange: 8,
    humanoid: true,
    summoned: false,
    loot: [
      { kind: 'gold', chance: 1, amount: [15, 40] },
      { kind: 'healing-potion', chance: 0.3 },
      { kind: 'short-sword', chance: 0.1 },
      { kind: 'iron-helmet', chance: 0.08 },
      { kind: 'chainmail', chance: 0.05 },
      { kind: 'wooden-shield', chance: 0.1 },
      { kind: 'black-pearl', chance: 0.4, amount: [1, 4] },
      { kind: 'sulfurous-ash', chance: 0.4, amount: [2, 5] },
      { kind: 'nightshade', chance: 0.4, amount: [1, 3] },
      { kind: 'blood-moss', chance: 0.3, amount: [1, 3] },
      { kind: 'blank-scroll', chance: 0.3, amount: [1, 3] },
      { kind: 'mace', chance: 0.08 },
      { kind: 'broadsword', chance: 0.05 },
      { kind: 'scroll-fireball', chance: 0.06 },
      { kind: 'scroll-poison', chance: 0.06 },
    ],
  },
  'giant-spider': {
    kind: 'giant-spider',
    name: 'araña gigante',
    article: 'una',
    maxHits: 40,
    strength: 40,
    dexterity: 70,
    armor: 8,
    skill: 500,
    weapon: { name: 'picadura', minDamage: 3, maxDamage: 8, swingMs: 1700, skill: 'wrestling' },
    moveMs: 320,
    aggroRange: 7,
    humanoid: false,
    summoned: false,
    abilities: { poison: { chance: 0.35, level: 1 } },
    loot: [
      { kind: 'gold', chance: 0.8, amount: [8, 20] },
      { kind: 'spiders-silk', chance: 0.9, amount: [3, 8] },
      { kind: 'nightshade', chance: 0.4, amount: [1, 3] },
    ],
  },
  orc: {
    kind: 'orc',
    name: 'orco',
    article: 'un',
    maxHits: 60,
    strength: 60,
    dexterity: 40,
    armor: 14,
    skill: 550,
    weapon: { name: 'garrote', minDamage: 5, maxDamage: 12, swingMs: 2300, skill: 'mace-fighting' },
    moveMs: 400,
    aggroRange: 8,
    humanoid: true,
    summoned: false,
    abilities: { fleeAt: 0.2 },
    loot: [
      { kind: 'gold', chance: 1, amount: [20, 50] },
      { kind: 'mace', chance: 0.12 },
      { kind: 'leather-armor', chance: 0.1 },
      { kind: 'studded-leather', chance: 0.05 },
      { kind: 'hides', chance: 0.5, amount: [1, 3] },
      { kind: 'raw-ribs', chance: 0.4, amount: [1, 2] },
    ],
  },
  troll: {
    kind: 'troll',
    name: 'troll',
    article: 'un',
    maxHits: 120,
    strength: 110,
    dexterity: 40,
    armor: 20,
    skill: 650,
    weapon: { name: 'puñetazo', minDamage: 10, maxDamage: 20, swingMs: 2800, skill: 'wrestling' },
    moveMs: 460,
    aggroRange: 8,
    humanoid: true,
    summoned: false,
    abilities: { regeneration: 1.5 },
    loot: [
      { kind: 'gold', chance: 1, amount: [50, 120] },
      { kind: 'war-hammer', chance: 0.08 },
      { kind: 'plate-helm', chance: 0.05 },
      { kind: 'hides', chance: 0.7, amount: [2, 5] },
    ],
  },
  'skeleton-mage': {
    kind: 'skeleton-mage',
    name: 'mago esquelético',
    article: 'un',
    maxHits: 50,
    strength: 30,
    dexterity: 40,
    armor: 8,
    skill: 400,
    weapon: { name: 'bastón', minDamage: 2, maxDamage: 6, swingMs: 2400, skill: 'mace-fighting' },
    moveMs: 460,
    aggroRange: 9,
    humanoid: true,
    summoned: false,
    abilities: {
      spells: {
        attack: ['magic-arrow', 'harm', 'fireball'],
        magery: 600,
        cooldownMs: 3200,
        range: 5,
      },
      magicResist: 600,
    },
    loot: [
      { kind: 'gold', chance: 1, amount: [30, 70] },
      { kind: 'black-pearl', chance: 0.6, amount: [2, 6] },
      { kind: 'sulfurous-ash', chance: 0.6, amount: [2, 6] },
      { kind: 'blank-scroll', chance: 0.5, amount: [1, 4] },
      { kind: 'scroll-fireball', chance: 0.12 },
      { kind: 'scroll-lightning', chance: 0.08 },
      { kind: 'wizard-hat', chance: 0.08 },
    ],
  },
  lich: {
    kind: 'lich',
    name: 'liche',
    article: 'un',
    maxHits: 160,
    strength: 60,
    dexterity: 60,
    armor: 20,
    skill: 650,
    weapon: {
      name: 'toque helado',
      minDamage: 8,
      maxDamage: 16,
      swingMs: 2400,
      skill: 'wrestling',
    },
    moveMs: 440,
    aggroRange: 10,
    humanoid: true,
    summoned: false,
    abilities: {
      spells: {
        attack: ['lightning', 'poison', 'paralyze', 'mana-drain', 'energy-bolt'],
        heal: 'greater-heal',
        magery: 900,
        cooldownMs: 2800,
        range: 6,
      },
      magicResist: 850,
    },
    loot: [
      { kind: 'gold', chance: 1, amount: [150, 320] },
      { kind: 'nightshade', chance: 0.8, amount: [4, 10] },
      { kind: 'blood-moss', chance: 0.8, amount: [4, 10] },
      { kind: 'mandrake-root', chance: 0.6, amount: [3, 8] },
      { kind: 'robe', chance: 0.2 },
      { kind: 'scroll-energy-bolt', chance: 0.15 },
      { kind: 'scroll-paralyze', chance: 0.15 },
      { kind: 'scroll-flamestrike', chance: 0.06 },
    ],
  },
  dragon: {
    kind: 'dragon',
    name: 'dragón rojo',
    article: 'un',
    maxHits: 600,
    strength: 200,
    dexterity: 80,
    armor: 40,
    skill: 900,
    weapon: { name: 'garras', minDamage: 18, maxDamage: 32, swingMs: 2600, skill: 'wrestling' },
    moveMs: 420,
    aggroRange: 12,
    humanoid: false,
    summoned: false,
    abilities: {
      breath: { power: [28, 46], cooldownMs: 7000, range: 6 },
      regeneration: 0.5,
      magicResist: 900,
    },
    loot: [
      { kind: 'gold', chance: 1, amount: [2000, 4000] },
      { kind: 'gold', chance: 1, amount: [1000, 3000] },
      { kind: 'plate-chest', chance: 0.4 },
      { kind: 'plate-legs', chance: 0.4 },
      { kind: 'katana', chance: 0.3 },
      { kind: 'black-pearl', chance: 1, amount: [10, 25] },
      { kind: 'sulfurous-ash', chance: 1, amount: [10, 25] },
      { kind: 'scroll-summon-daemon', chance: 0.25 },
      { kind: 'scroll-earthquake', chance: 0.25 },
      { kind: 'hides', chance: 1, amount: [10, 20] },
    ],
  },
  'energy-vortex': summon('energy-vortex', 'vórtice de energía', {
    maxHits: 60,
    strength: 100,
    dexterity: 100,
    armor: 10,
    skill: 800,
    weapon: { name: 'descarga', minDamage: 10, maxDamage: 18, swingMs: 2000, skill: 'wrestling' },
    moveMs: 250,
    humanoid: false,
  }),
  'air-elemental': summon('air-elemental', 'elemental de aire', {
    maxHits: 70,
    strength: 60,
    dexterity: 90,
    armor: 12,
    skill: 750,
    weapon: { name: 'ráfaga', minDamage: 8, maxDamage: 14, swingMs: 1800, skill: 'wrestling' },
    moveMs: 300,
    humanoid: true,
  }),
  'earth-elemental': summon('earth-elemental', 'elemental de tierra', {
    maxHits: 120,
    strength: 120,
    dexterity: 40,
    armor: 26,
    skill: 650,
    weapon: {
      name: 'puño de piedra',
      minDamage: 10,
      maxDamage: 18,
      swingMs: 2600,
      skill: 'wrestling',
    },
    moveMs: 460,
    humanoid: true,
  }),
  'fire-elemental': summon('fire-elemental', 'elemental de fuego', {
    maxHits: 80,
    strength: 80,
    dexterity: 70,
    armor: 10,
    skill: 700,
    weapon: { name: 'llamarada', minDamage: 10, maxDamage: 17, swingMs: 2200, skill: 'wrestling' },
    moveMs: 320,
    humanoid: true,
  }),
  'water-elemental': summon('water-elemental', 'elemental de agua', {
    maxHits: 95,
    strength: 90,
    dexterity: 60,
    armor: 16,
    skill: 650,
    weapon: {
      name: 'golpe de agua',
      minDamage: 8,
      maxDamage: 15,
      swingMs: 2200,
      skill: 'wrestling',
    },
    moveMs: 380,
    humanoid: true,
  }),
  daemon: summon('daemon', 'demonio', {
    maxHits: 150,
    strength: 140,
    dexterity: 70,
    armor: 30,
    skill: 850,
    weapon: { name: 'garras', minDamage: 14, maxDamage: 24, swingMs: 2400, skill: 'wrestling' },
    moveMs: 360,
    humanoid: true,
  }),
  ...mounts(),
};

/**
 * Las monturas sueltas: siguen a su dueño a paso de persona, lo defienden y
 * atacan a quien él ataque. Las criaturas y otros jugadores pueden matarlas.
 */
function mounts(): Record<MountKind, CreatureDefinition> {
  // Cómo pelea cada especie: el caballo y la llama patean, el lagarto muerde.
  const fight = {
    horse: { name: 'coces', minDamage: 4, maxDamage: 9, swingMs: 2600, skill: 'wrestling' },
    llama: { name: 'coces', minDamage: 2, maxDamage: 6, swingMs: 2400, skill: 'wrestling' },
    runner: { name: 'mordida', minDamage: 5, maxDamage: 11, swingMs: 2400, skill: 'wrestling' },
  } as const satisfies Record<string, Weapon>;
  const entries = MOUNT_KINDS.map((kind): [MountKind, CreatureDefinition] => [
    kind,
    {
      kind,
      name: MOUNTS[kind].name,
      article: MOUNTS[kind].article,
      maxHits: MOUNTS[kind].species === 'llama' ? 45 : MOUNTS[kind].species === 'runner' ? 80 : 70,
      strength: 60,
      dexterity: 50,
      armor: MOUNTS[kind].species === 'runner' ? 12 : 6,
      skill: 450,
      weapon: fight[MOUNTS[kind].species],
      moveMs: 200,
      aggroRange: 0,
      loot: [],
      humanoid: false,
      summoned: true,
    },
  ]);
  return Object.fromEntries(entries) as Record<MountKind, CreatureDefinition>;
}

/** Criatura que solo existe invocada: pelea para su dueño y no deja botín. */
function summon(
  kind: CreatureKind,
  name: string,
  stats: Omit<CreatureDefinition, 'kind' | 'name' | 'article' | 'aggroRange' | 'loot' | 'summoned'>,
): CreatureDefinition {
  return { kind, name, article: 'un', aggroRange: 10, loot: [], summoned: true, ...stats };
}

export function isCreatureKind(value: unknown): value is CreatureKind {
  return typeof value === 'string' && (CREATURE_KINDS as readonly string[]).includes(value);
}

/** Forma del cuerpo de un mobile: humano o una criatura. */
export type Body = 'human' | CreatureKind;

/** Tiempo para avanzar un tile según el cuerpo y el modo de movimiento. */
export function bodyMoveMs(body: Body, humanMs: number): number {
  return body === 'human' ? humanMs : CREATURES[body].moveMs;
}
