import type { ItemKind } from '../items/item-catalog';
import type { EquipmentLook } from '../../protocol/messages';

/** Habilidades de pelea: cada arma usa (y sube) una. */
export type CombatSkill = 'wrestling' | 'swordsmanship' | 'fencing' | 'mace-fighting' | 'archery';

export interface Weapon {
  readonly name: string;
  /** Fuerza mínima necesaria para equiparla. */
  readonly minStrength?: number;
  readonly minDamage: number;
  readonly maxDamage: number;
  /** Tiempo entre golpes. */
  readonly swingMs: number;
  /** Habilidad que se usa (y sube) al pelear con esta arma. */
  readonly skill: CombatSkill;
  /** Alcance en tiles (1 = cuerpo a cuerpo). */
  readonly range?: number;
  /** Munición que gasta cada disparo. */
  readonly ammo?: ItemKind;
}

export const FISTS: Weapon = {
  name: 'puños',
  minDamage: 1,
  maxDamage: 4,
  swingMs: 1750,
  skill: 'wrestling',
};

const WEAPONS: Partial<Record<ItemKind, Weapon>> = {
  dagger: fencing('daga', 10, 12, 2000, 10),
  kryss: fencing('estoque', 10, 12, 2000, 10),
  spear: fencing('lanza', 13, 16, 2750, 50),
  'short-sword': {
    name: 'espada corta',
    minDamage: 5,
    maxDamage: 11,
    swingMs: 2250,
    skill: 'swordsmanship',
  },
  broadsword: {
    name: 'espada ancha',
    minStrength: 30,
    minDamage: 13,
    maxDamage: 17,
    swingMs: 3250,
    skill: 'swordsmanship',
  },
  katana: {
    name: 'katana',
    minStrength: 25,
    minDamage: 10,
    maxDamage: 14,
    swingMs: 2500,
    skill: 'swordsmanship',
  },
  axe: {
    name: 'hacha',
    minStrength: 35,
    minDamage: 14,
    maxDamage: 17,
    swingMs: 3000,
    skill: 'swordsmanship',
  },
  mace: { name: 'maza', minDamage: 6, maxDamage: 12, swingMs: 2500, skill: 'mace-fighting' },
  'war-hammer': {
    name: 'martillo de guerra',
    minDamage: 10,
    maxDamage: 20,
    swingMs: 3500,
    skill: 'mace-fighting',
  },
  longsword: {
    name: 'espada larga',
    minStrength: 35,
    minDamage: 14,
    maxDamage: 18,
    swingMs: 3500,
    skill: 'swordsmanship',
  },
  scimitar: {
    name: 'cimitarra',
    minStrength: 25,
    minDamage: 12,
    maxDamage: 16,
    swingMs: 3000,
    skill: 'swordsmanship',
  },
  'war-axe': {
    name: 'hacha de guerra',
    minDamage: 9,
    maxDamage: 18,
    swingMs: 3000,
    skill: 'swordsmanship',
  },
  halberd: {
    name: 'alabarda',
    minStrength: 95,
    minDamage: 18,
    maxDamage: 21,
    swingMs: 4000,
    skill: 'swordsmanship',
  },
  club: { name: 'garrote', minDamage: 4, maxDamage: 10, swingMs: 2250, skill: 'mace-fighting' },
  quarterstaff: {
    name: 'bastón de combate',
    minDamage: 6,
    maxDamage: 14,
    swingMs: 2500,
    skill: 'mace-fighting',
  },
  pickaxe: sword('pico', 12, 16, 3000, 50),
  bow: {
    name: 'arco',
    minDamage: 8,
    maxDamage: 16,
    swingMs: 3000,
    skill: 'archery',
    range: 10,
    ammo: 'arrow',
  },
  // Las hachas grandes son de espadas : lentas y de mucho daño.
  'double-axe': sword('hacha doble', 15, 18, 3250, 45),
  'battle-axe': sword('hacha de batalla', 16, 19, 3500, 35),
  'two-handed-axe': sword('hacha a dos manos', 16, 19, 3500, 40),
  'large-battle-axe': sword('gran hacha de batalla', 17, 20, 3750, 80),
  bardiche: sword('hacha de asta', 17, 20, 3750, 45),
  cutlass: sword('alfanje', 10, 14, 2500, 25),
  'viking-sword': sword('espada vikinga', 15, 19, 3750, 40),
  'bladed-staff': sword('bastón con hoja', 14, 17, 3000, 40),
  'butcher-knife': sword('cuchillo de carnicero', 10, 13, 2250, 5),
  cleaver: sword('cuchilla de carnicero', 10, 14, 2500, 10),
  'crescent-blade': sword('hoja de media luna', 12, 15, 2500, 55),
  scythe: sword('guadaña', 16, 19, 3500, 45),
  'skinning-knife': sword('cuchillo de desollar', 10, 13, 2250, 5),
  'executioners-axe': sword('hacha de verdugo', 15, 18, 3250, 40),
  hatchet: sword('hachuela', 13, 16, 2750, 20),
  'bladed-whip': sword('látigo con filo', 13, 17, 3250, 20),
  bokuto: sword('bokuto', 10, 12, 2000, 20),
  daisho: sword('daisho', 13, 16, 2750, 40),
  'elven-machete': sword('machete élfico', 11, 15, 2750, 20),
  'no-dachi': sword('no-dachi', 16, 19, 3500, 40),
  tachi: sword('tachi', 16, 19, 3500, 55),
  'radiant-scimitar': sword('cimitarra radiante', 10, 14, 2500, 20),
  'rune-blade': sword('hoja rúnica', 14, 17, 3000, 30),
  'the-redeemer': sword('Redentora', 20, 24, 5000, 85),
  wakizashi: sword('wakizashi', 10, 14, 2500, 20),
  'ornate-axe': sword('hacha ornamentada', 17, 20, 3750, 45),
  'war-fork': fencing('horquilla de guerra', 10, 14, 2500, 45),
  pitchfork: {
    name: 'horca de combate',
    minDamage: 13,
    maxDamage: 14,
    swingMs: 2500,
    skill: 'fencing',
  },
  sickle: { name: 'hoz', minDamage: 12, maxDamage: 16, swingMs: 3000, skill: 'swordsmanship' },
  'short-spear': fencing('lanza corta', 10, 13, 2000, 40),
  'assassin-spike': fencing('punzón de asesino', 10, 12, 2000, 15),
  'double-bladed-staff': fencing('bastón de doble filo', 11, 14, 2250, 50),
  'elven-spellblade': fencing('hoja encantada', 12, 15, 2500, 35),
  kama: fencing('kama', 10, 13, 2000, 15),
  lajatang: fencing('lajatang', 16, 19, 3500, 65),
  lance: fencing('lanza de caballería', 18, 22, 4250, 95),
  leafblade: fencing('hoja de laurel', 11, 15, 2750, 20),
  'paladin-fork': fencing('horquilla del paladín', 10, 14, 2500, 45),
  pike: fencing('pica', 14, 17, 3000, 50),
  sai: fencing('sai', 10, 13, 2000, 15),
  'spiked-whip': fencing('látigo de púas', 13, 17, 3250, 20),
  tekagi: fencing('garras tekagi', 10, 13, 2000, 10),
  'war-cleaver': fencing('cuchilla de guerra', 10, 13, 2250, 15),
  'hammer-pick': {
    name: 'pico de guerra',
    minDamage: 8,
    maxDamage: 16,
    swingMs: 2750,
    skill: 'mace-fighting',
  },
  // Mangual: tres bolas con púas en cadenas; pega fuerte y sin aviso.
  flail: { name: 'mangual', minDamage: 9, maxDamage: 18, swingMs: 3000, skill: 'mace-fighting' },
  // Las ballestas pegan más fuerte que el arco, pero se recargan más despacio.
  crossbow: {
    name: 'ballesta',
    minDamage: 10,
    maxDamage: 20,
    swingMs: 4000,
    skill: 'archery',
    range: 10,
    ammo: 'bolt',
  },
  'heavy-crossbow': {
    name: 'ballesta pesada',
    minDamage: 14,
    maxDamage: 26,
    swingMs: 5000,
    skill: 'archery',
    range: 10,
    ammo: 'bolt',
  },
};

function fencing(
  name: string,
  minDamage: number,
  maxDamage: number,
  swingMs: number,
  minStrength: number,
): Weapon {
  return { name, minDamage, maxDamage, swingMs, minStrength, skill: 'fencing' };
}

function sword(
  name: string,
  minDamage: number,
  maxDamage: number,
  swingMs: number,
  minStrength?: number,
): Weapon {
  return {
    name,
    minDamage,
    maxDamage,
    swingMs,
    ...(minStrength === undefined ? {} : { minStrength }),
    skill: 'swordsmanship',
  };
}

/** Protección de cada pieza de armadura. */
const ARMOR_RATING: Partial<Record<ItemKind, number>> = {
  'leather-cap': 2,
  'iron-helmet': 5,
  'plate-helm': 7,
  'wizard-hat': 1,
  'leather-armor': 6,
  'studded-leather': 8,
  chainmail: 12,
  'plate-chest': 16,
  robe: 1,
  'leather-leggings': 3,
  'plate-legs': 7,
  'wooden-shield': 6,
  buckler: 5,
  'metal-shield': 9,
  'kite-shield': 10,
  'heater-shield': 12,
  'female-plate': 16,
  'chain-coif': 4,
  ringmail: 10,
  'bone-helm': 4,
  'bone-armor': 10,
  'bone-leggings': 5,
  'tribal-mask': 2,
  doublet: 2,
  vest: 1,
  tunic: 1,
  'hooded-robe': 1,
  'tattered-robe': 1,
  'fur-cape': 2,
  'thigh-boots': 2,
  boots: 1,
  cloak: 1,
  // Piezas sueltas: el juego completo de placas suma según el diseño del juego (la mayor parte, el peto).
  'leather-gorget': 1,
  'studded-gorget': 2,
  'plate-gorget': 3,
  'leather-sleeves': 2,
  'studded-sleeves': 3,
  'ringmail-sleeves': 4,
  'bone-arms': 4,
  'plate-arms': 5,
  'leather-gloves': 1,
  'studded-gloves': 2,
  'ringmail-gloves': 3,
  'bone-gloves': 3,
  'plate-gloves': 4,
  'studded-leggings': 4,
  'ringmail-leggings': 5,
  'chain-leggings': 6,
  // Juegos de la etapa 59: cerca de lo que suma el juego completo de placas (42).
  'legion-shield': 13,
  'templar-shield': 12,
  'samurai-kabuto': 6,
  'samurai-mempo': 3,
  'samurai-do': 16,
  'samurai-sode': 5,
  'samurai-haidate': 6,
  'samurai-suneate': 4,
  'legion-helm': 7,
  'legion-cuirass': 18,
  'legion-arms': 6,
  'legion-greaves': 9,
  'templar-helm': 7,
  'templar-hauberk': 16,
  'templar-sleeves': 5,
  'templar-gauntlets': 4,
  'templar-chausses': 7,
};

/** Armadura de metal: no deja meditar . */
const METAL_ARMOR: ReadonlySet<ItemKind> = new Set<ItemKind>([
  'plate-gorget',
  'ringmail-sleeves',
  'plate-arms',
  'ringmail-gloves',
  'plate-gloves',
  'ringmail-leggings',
  'chain-leggings',
  'iron-helmet',
  'plate-helm',
  'chainmail',
  'ringmail',
  'chain-coif',
  'metal-shield',
  'kite-shield',
  'heater-shield',
  'female-plate',
  'plate-chest',
  'plate-legs',
  'legion-shield',
  'templar-shield',
  'samurai-kabuto',
  'samurai-mempo',
  'samurai-do',
  'samurai-sode',
  'samurai-haidate',
  'samurai-suneate',
  'legion-helm',
  'legion-cuirass',
  'legion-arms',
  'legion-greaves',
  'templar-helm',
  'templar-hauberk',
  'templar-sleeves',
  'templar-gauntlets',
  'templar-chausses',
]);

export function weaponOf(look: EquipmentLook): Weapon {
  const kind = look.rightHand;
  return (kind && WEAPONS[kind]) ?? FISTS;
}

export function weaponByKind(kind: ItemKind): Weapon | undefined {
  return WEAPONS[kind];
}

export function armorOf(look: EquipmentLook): number {
  return Object.values(look).reduce((sum, kind) => sum + (ARMOR_RATING[kind] ?? 0), 0);
}

export function armorRating(kind: ItemKind): number {
  return ARMOR_RATING[kind] ?? 0;
}

/** ¿Lleva puesta alguna pieza de metal? */
export function wearsMetalArmor(look: EquipmentLook): boolean {
  return Object.values(look).some((kind) => METAL_ARMOR.has(kind));
}
