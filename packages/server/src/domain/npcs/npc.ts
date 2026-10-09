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
    appearance: { ...DEFAULT_APPEARANCE, clothHue: CLOTH_HUES[7], facialHair: 'beard' },
    equipment: { torso: 'leather-armor', rightHand: 'pickaxe', feet: 'boots' },
  },
  mage: {
    appearance: {
      ...DEFAULT_APPEARANCE,
      clothHue: CLOTH_HUES[4],
      hairHue: 0xd9c27e,
      gender: 'female',
      hairStyle: 'long',
    },
    equipment: { cloak: 'cloak' },
  },
  innkeeper: {
    appearance: {
      ...DEFAULT_APPEARANCE,
      clothHue: CLOTH_HUES[6],
      skinTone: 0xe0ac69,
      facialHair: 'mustache',
    },
    equipment: { legs: 'trousers' },
  },
  banker: {
    appearance: {
      ...DEFAULT_APPEARANCE,
      clothHue: CLOTH_HUES[1],
      hairHue: 0x8a8a8a,
      gender: 'female',
      hairStyle: 'bun',
    },
    equipment: { feet: 'boots', legs: 'trousers' },
  },
};

/** Personaje del pueblo: no pelea, no se mueve y atiende a quien se acerca. */
export class Npc implements Mobile {
  readonly body = 'human' as const;
  readonly name: string;
  readonly direction = Direction.South;
  readonly combat = new Combatant({ strength: 100, dexterity: 100, intelligence: 0 });
  readonly appearance: Appearance;
  readonly equipment: EquipmentLook;

  constructor(
    readonly id: EntityId,
    readonly role: NpcRole,
    readonly position: Position,
  ) {
    this.name = VENDORS[role].name;
    this.appearance = LOOKS[role].appearance;
    this.equipment = LOOKS[role].equipment;
  }
}
