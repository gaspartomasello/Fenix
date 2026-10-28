import { DEFAULT_APPEARANCE, type Appearance } from '@fenix/shared/character/appearance';
import type { CreatureKind } from '@fenix/shared/creatures/creature-catalog';
import type { Direction } from '@fenix/shared/geometry/direction';
import type { MountKind } from '@fenix/shared/mounts/mount-catalog';
import type { EquipmentLook } from '@fenix/shared/protocol/messages';
import { drawCharacterFrame, type CharacterFrame } from './character-art';
import { spriteCanvas, type CanvasFactory } from './humanoid-rig';
import type { PixelImage } from './pixel-art';

/** Humanos hostiles: personas como los jugadores, con su ropa y sus armas. */
const HUMAN_FOES: Readonly<
  Partial<
    Record<CreatureKind, { appearance: Appearance; equipment: EquipmentLook; mount?: MountKind }>
  >
> = {
  // Bárbaro del norte: pelo largo rubio, barba, pecho de cuero y hacha de guerra.
  barbarian: {
    appearance: {
      ...DEFAULT_APPEARANCE,
      skinTone: 0xe0ac69,
      hairHue: 0xd9c27e,
      hairStyle: 'long',
      facialHair: 'beard',
      clothHue: 0x7a5a2e,
    },
    equipment: {
      torso: 'leather-armor',
      legs: 'leather-leggings',
      feet: 'boots',
      rightHand: 'war-axe',
      leftHand: 'wooden-shield',
    },
  },
  // Pirata: pañuelo en la cabeza, camisa roja, bigote y cimitarra.
  pirate: {
    appearance: {
      ...DEFAULT_APPEARANCE,
      skinTone: 0xc68642,
      hairHue: 0x2b1d0e,
      hairStyle: 'ponytail',
      facialHair: 'mustache',
      clothHue: 0x8b2e2e,
    },
    equipment: {
      head: 'leather-cap',
      torso: 'fancy-shirt',
      legs: 'trousers',
      feet: 'boots',
      rightHand: 'scimitar',
    },
  },
  // Corsario: capa negra, cota de anillas y espada larga; el más peligroso del mar.
  corsair: {
    appearance: {
      ...DEFAULT_APPEARANCE,
      skinTone: 0xe0ac69,
      hairHue: 0x2b1d0e,
      hairStyle: 'short',
      facialHair: 'beard',
      clothHue: 0x4a4a4a,
    },
    equipment: {
      torso: 'ringmail',
      cloak: 'cloak',
      legs: 'trousers',
      feet: 'boots',
      rightHand: 'longsword',
      leftHand: 'buckler',
    },
  },
  // Bandolero de los caminos: capucha de malla, pechera tachonada y daga.
  brigand: {
    appearance: {
      ...DEFAULT_APPEARANCE,
      skinTone: 0xf1c27d,
      hairHue: 0x6b4423,
      facialHair: 'mustache',
      clothHue: 0x2e7a3e,
    },
    equipment: {
      torso: 'studded-leather',
      head: 'chain-coif',
      legs: 'trousers',
      feet: 'boots',
      rightHand: 'dagger',
    },
  },
  // Las tribus de la selva: piel curtida, el torso pintado al aire, taparrabos,
  // máscara de madera con penacho y lanza.
  'tribal-warrior': {
    appearance: {
      ...DEFAULT_APPEARANCE,
      skinTone: 0xa86b3c,
      hairHue: 0x14100c,
      hairStyle: 'long',
      facialHair: 'none',
      clothHue: 0x9a5a2a,
    },
    equipment: {
      head: 'tribal-mask',
      legs: 'short-pants',
      feet: 'sandals',
      rightHand: 'spear',
      leftHand: 'wooden-shield',
    },
  },
  'tribal-rider': {
    appearance: {
      ...DEFAULT_APPEARANCE,
      skinTone: 0x8d5524,
      hairHue: 0x14100c,
      hairStyle: 'ponytail',
      facialHair: 'none',
      clothHue: 0x2f7a6a,
    },
    equipment: {
      head: 'tribal-mask',
      legs: 'short-pants',
      feet: 'sandals',
      rightHand: 'spear',
    },
    mount: 'runner',
  },
  'tribal-shaman': {
    appearance: {
      ...DEFAULT_APPEARANCE,
      skinTone: 0xa86b3c,
      hairHue: 0xd8d0c0,
      hairStyle: 'long',
      facialHair: 'none',
      clothHue: 0x7a4a22,
    },
    equipment: {
      head: 'tribal-mask',
      torso: 'robe',
      feet: 'sandals',
      rightHand: 'quarterstaff',
    },
  },
};

/** La montura de un humano hostil que anda montado (el jinete tribal), o null. */
export function humanFoeMount(kind: CreatureKind): MountKind | null {
  return HUMAN_FOES[kind]?.mount ?? null;
}

export function isHumanFoe(kind: CreatureKind): boolean {
  return HUMAN_FOES[kind] !== undefined;
}

export function drawHumanFoeFrame(
  kind: CreatureKind,
  direction: Direction,
  frame: CharacterFrame,
  canvasFor: CanvasFactory = spriteCanvas,
): PixelImage {
  const look = HUMAN_FOES[kind] ?? HUMAN_FOES.pirate;
  return drawCharacterFrame(
    look?.appearance ?? DEFAULT_APPEARANCE,
    direction,
    frame,
    look?.equipment ?? {},
    null,
    // Muerto, queda tirado sin la montura.
    frame === 'dead' ? null : (look?.mount ?? null),
    canvasFor,
  );
}
