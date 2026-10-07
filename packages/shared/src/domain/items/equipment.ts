/** Lugares del cuerpo donde se equipa un objeto (las "capas" de UO). */
export const EQUIPMENT_SLOTS = [
  'head',
  'cloak',
  'torso',
  'rightHand',
  'leftHand',
  'legs',
  'feet',
] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

export const SLOT_LABELS: Readonly<Record<EquipmentSlot, string>> = {
  head: 'Cabeza',
  cloak: 'Capa',
  torso: 'Torso',
  rightHand: 'Mano derecha',
  leftHand: 'Mano izquierda',
  legs: 'Piernas',
  feet: 'Pies',
};

export function isEquipmentSlot(value: unknown): value is EquipmentSlot {
  return typeof value === 'string' && (EQUIPMENT_SLOTS as readonly string[]).includes(value);
}
