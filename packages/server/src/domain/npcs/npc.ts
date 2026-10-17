import {
  CLOTH_HUES,
  DEFAULT_APPEARANCE,
  Direction,
  VENDORS,
  type Appearance,
  type EntityId,
  type EquipmentLook,
  type NpcRole,
  type Position,
} from '@fenix/shared';
import { Combatant } from '../combat/combatant';
import type { Mobile } from '../mobile';

/** Cómo se ve cada personaje del pueblo. */
const LOOKS: Readonly<Record<NpcRole, { appearance: Appearance; equipment: EquipmentLook }>> = {
  blacksmith: {
    appearance: {
      ...DEFAULT_APPEARANCE,
      clothHue: CLOTH_HUES[7] ?? DEFAULT_APPEARANCE.clothHue,
      facialHair: 'beard',
    },
    equipment: { torso: 'leather-armor', rightHand: 'pickaxe', feet: 'boots' },
  },
  mage: {
    appearance: {
      ...DEFAULT_APPEARANCE,
      clothHue: CLOTH_HUES[4] ?? DEFAULT_APPEARANCE.clothHue,
      hairHue: 0xd9c27e,
      gender: 'female',
      hairStyle: 'long',
    },
    equipment: { cloak: 'cloak' },
  },
  innkeeper: {
    appearance: {
      ...DEFAULT_APPEARANCE,
      clothHue: CLOTH_HUES[6] ?? DEFAULT_APPEARANCE.clothHue,
      skinTone: 0xe0ac69,
      facialHair: 'mustache',
    },
    equipment: { legs: 'trousers' },
  },
  banker: {
    appearance: {
      ...DEFAULT_APPEARANCE,
      clothHue: CLOTH_HUES[1] ?? DEFAULT_APPEARANCE.clothHue,
      hairHue: 0x8a8a8a,
      gender: 'female',
      hairStyle: 'bun',
    },
    equipment: { feet: 'boots', legs: 'trousers' },
  },
  stablemaster: {
    appearance: {
      ...DEFAULT_APPEARANCE,
      clothHue: CLOTH_HUES[2] ?? DEFAULT_APPEARANCE.clothHue,
      skinTone: 0xc68642,
      hairStyle: 'short',
      facialHair: 'mustache',
    },
    equipment: { torso: 'leather-armor', legs: 'leather-leggings', feet: 'boots' },
  },
  woodcutter: {
    appearance: {
      ...DEFAULT_APPEARANCE,
      clothHue: CLOTH_HUES[3] ?? DEFAULT_APPEARANCE.clothHue,
      skinTone: 0xd8a070,
      hairHue: 0x6b3a1e,
      facialHair: 'beard',
    },
    equipment: { rightHand: 'axe', legs: 'trousers', feet: 'boots', head: 'leather-cap' },
  },
  carpenter: {
    appearance: {
      ...DEFAULT_APPEARANCE,
      clothHue: CLOTH_HUES[5] ?? DEFAULT_APPEARANCE.clothHue,
      hairHue: 0x9a8a70,
      facialHair: 'mustache',
    },
    equipment: { rightHand: 'saw', legs: 'trousers', feet: 'boots' },
  },
  // Los vecinos cambian de aspecto (ver TOWNSFOLK); este es el de base.
  townsfolk: { appearance: DEFAULT_APPEARANCE, equipment: { legs: 'trousers' } },
  guard: {
    appearance: { ...DEFAULT_APPEARANCE, facialHair: 'mustache', hairStyle: 'short' },
    equipment: {
      torso: 'plate-chest',
      legs: 'plate-legs',
      head: 'plate-helm',
      rightHand: 'spear',
      feet: 'boots',
    },
  },
};

/** Aspectos de los vecinos: cada uno sale de uno de estos, según su nombre. */
const TOWNSFOLK: readonly { appearance: Appearance; equipment: EquipmentLook }[] = [
  {
    appearance: {
      ...DEFAULT_APPEARANCE,
      clothHue: CLOTH_HUES[2] ?? DEFAULT_APPEARANCE.clothHue,
      gender: 'female',
      hairStyle: 'long',
      hairHue: 0x6b3a1e,
    },
    equipment: { legs: 'trousers', feet: 'boots' },
  },
  {
    appearance: {
      ...DEFAULT_APPEARANCE,
      clothHue: CLOTH_HUES[5] ?? DEFAULT_APPEARANCE.clothHue,
      skinTone: 0xc68642,
      facialHair: 'beard',
    },
    equipment: { legs: 'trousers', feet: 'boots' },
  },
  {
    appearance: {
      ...DEFAULT_APPEARANCE,
      clothHue: CLOTH_HUES[0] ?? DEFAULT_APPEARANCE.clothHue,
      gender: 'female',
      hairStyle: 'bun',
      hairHue: 0xd9c27e,
    },
    equipment: { legs: 'trousers', feet: 'boots' },
  },
  {
    appearance: {
      ...DEFAULT_APPEARANCE,
      clothHue: CLOTH_HUES[3] ?? DEFAULT_APPEARANCE.clothHue,
      hairHue: 0x2a1c14,
      hairStyle: 'short',
    },
    equipment: { legs: 'trousers', feet: 'boots', head: 'leather-cap' },
  },
  {
    appearance: {
      ...DEFAULT_APPEARANCE,
      clothHue: CLOTH_HUES[6] ?? DEFAULT_APPEARANCE.clothHue,
      skinTone: 0xe0ac69,
      hairHue: 0x8a8a8a,
    },
    equipment: { legs: 'trousers', feet: 'boots' },
  },
  {
    appearance: {
      ...DEFAULT_APPEARANCE,
      clothHue: CLOTH_HUES[1] ?? DEFAULT_APPEARANCE.clothHue,
      gender: 'female',
      hairStyle: 'ponytail',
      skinTone: 0x8d5524,
    },
    equipment: { legs: 'trousers', feet: 'boots' },
  },
];

/** Hasta dónde se aleja de su lugar al caminar (los que no comercian). */
const WANDER: Readonly<Partial<Record<NpcRole, number>>> = { townsfolk: 7, guard: 3 };

/**
 * Personaje del pueblo: no pelea y atiende (o charla) a quien se acerca.
 * Los comerciantes se quedan en su puesto; los vecinos y los guardias
 * caminan cerca de su lugar (ver `TownLife`).
 */
export class Npc implements Mobile {
  readonly body = 'human' as const;
  readonly name: string;
  direction: Direction = Direction.South;
  readonly combat = new Combatant({ strength: 100, dexterity: 100, intelligence: 0 });
  readonly appearance: Appearance;
  readonly equipment: EquipmentLook;
  /** Donde vive: camina alrededor de acá. */
  readonly home: Position;
  /** Cuántos tiles se aleja al caminar (0: no camina). */
  readonly wander: number;
  /** Aviso de que cambió de lugar (el mundo lo reubica en su índice). */
  moved: (() => void) | null = null;
  /** Cuándo da el próximo paso. */
  nextMoveAt = 0;
  /** A dónde va caminando. */
  goal: Position | null = null;
  private _position: Position;

  constructor(
    readonly id: EntityId,
    readonly role: NpcRole,
    position: Position,
    name?: string,
  ) {
    this.name = name ?? VENDORS[role].name;
    this.home = position;
    this._position = position;
    this.wander = WANDER[role] ?? 0;
    const look =
      role === 'townsfolk'
        ? (TOWNSFOLK[hashName(this.name) % TOWNSFOLK.length] ?? LOOKS[role])
        : LOOKS[role];
    this.appearance = look.appearance;
    this.equipment = look.equipment;
  }

  get position(): Position {
    return this._position;
  }

  set position(position: Position) {
    this._position = position;
    this.moved?.();
  }
}

function hashName(name: string): number {
  let h = 7;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
