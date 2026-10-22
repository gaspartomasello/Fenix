import {
  ITEMS,
  type Appearance,
  type Direction,
  type EquipmentHues,
  type EquipmentLook,
  type ItemKind,
  type MountKind,
  type NpcRole,
} from '@fenix/shared';
import { GOLD, STEEL, drawHumanHead, drawMempo, drawSkullHead } from './humanoid-head';
import {
  BUILDS,
  CHARACTER_ART_HEIGHT,
  CHARACTER_ART_WIDTH,
  cameraFor,
  heldInLeftHand,
  humanoidRig,
  spriteCanvas,
  type CanvasFactory,
  type CharacterFrame,
  type Rig,
} from './humanoid-rig';
import { drawMount, mountLayout, mountedCamera } from './mount-art';
import { hexToRgb, type PixelImage, type Rgb } from './pixel-art';
import type { VolumeCanvas } from './volume';
import {
  add,
  axesAlong,
  clipping,
  cross,
  lerp,
  metal,
  noise,
  normalize,
  ramp,
  scale,
  solid,
  sub,
  tone,
  yaw,
  type Material,
  type Ramp,
  type Sample,
  type Vec3,
} from './volume';

export {
  ACTION_KINDS,
  ART_DETAIL,
  CHARACTER_ART_HEIGHT,
  CHARACTER_ART_WIDTH,
  CHARACTER_FEET_Y,
  CHARACTER_HEAD_Y,
  WALK_FRAMES,
  WALK_FRAME_COUNT,
  attackStyleFor,
  cyclePhase,
  cameraFor,
  guardFrame,
  humanoidRig,
  type ActionKind,
  type ActionStep,
  type CharacterFrame,
  type WalkStep,
} from './humanoid-rig';

/** Color del contorno de todos los sprites. */
export const OUTLINE: Rgb = [24, 17, 14];

// ── Colores ─────────────────────────────────────────────────────────

/** Colores teñidos del personaje que se está dibujando (por lugar del cuerpo). */
let dyed: EquipmentHues = {};

/** Color de un objeto puesto, si tiene (teñido, si lo tiñeron). */
function wornColor(kind: ItemKind | undefined): Rgb | null {
  if (!kind) return null;
  const slot = ITEMS[kind].slot;
  const hue = slot ? dyed[slot] : undefined;
  const color = hue ?? ITEMS[kind].color;
  return color === undefined ? null : hexToRgb(color);
}

/** Ropa de tela del torso: tiñe la camisa (las mangas y el faldón). */
const SHIRTS: ReadonlySet<ItemKind> = new Set<ItemKind>([
  'shirt',
  'fancy-shirt',
  'doublet',
  'dress',
]);
const BONE = ramp([226, 218, 196]);
/** Hueso viejo de la armadura: amarillento, con las sombras verdosas. */
const OLD_BONE = ramp([212, 200, 150]);
const BONE_GAP = ramp([40, 34, 30]);

const WOOD = ramp([118, 78, 44]);
const LEATHER_DARK = ramp([92, 60, 36]);
const LINEN = ramp([214, 206, 186]);
const DARK_STEEL = ramp([96, 102, 114]);

/** De qué está hecha cada pieza de armadura (decide cómo se ve puesta). */
type Stuff = 'leather' | 'studded' | 'ringmail' | 'chain' | 'plate' | 'bone' | 'segmented';
const STUFF: Partial<Record<ItemKind, Stuff>> = {
  'leather-armor': 'leather',
  'leather-leggings': 'leather',
  'leather-gorget': 'leather',
  'leather-sleeves': 'leather',
  'leather-gloves': 'leather',
  'studded-leather': 'studded',
  'studded-gorget': 'studded',
  'studded-sleeves': 'studded',
  'studded-gloves': 'studded',
  'studded-leggings': 'studded',
  ringmail: 'ringmail',
  'ringmail-sleeves': 'ringmail',
  'ringmail-gloves': 'ringmail',
  'ringmail-leggings': 'ringmail',
  chainmail: 'chain',
  'chain-leggings': 'chain',
  'plate-chest': 'plate',
  'female-plate': 'plate',
  'plate-legs': 'plate',
  'plate-gorget': 'plate',
  'plate-arms': 'plate',
  'plate-gloves': 'plate',
  'bone-armor': 'bone',
  'bone-leggings': 'bone',
  'bone-arms': 'bone',
  'bone-gloves': 'bone',
  'legion-arms': 'segmented',
  'templar-sleeves': 'chain',
  'templar-gauntlets': 'chain',
  'templar-chausses': 'chain',
};

/**
 * La superficie de una pieza según su material. `band` da, para cada punto,
 * una coordenada a lo largo de la pieza: ahí van las láminas de las placas,
 * las hileras de anillas, las costuras del cuero y las filas de tachas.
 */
function armorSurface(stuff: Stuff, color: Ramp, band: (p: Vec3) => number): Material {
  const wrap = (v: number, m: number): number => ((v % m) + m) % m;
  switch (stuff) {
    case 'leather':
      return (s) => tone(color, s.light, wrap(band(s.p), 2.8) < 0.3 ? -1 : 0);
    case 'studded':
      return (s) =>
        wrap(band(s.p), 2.2) < 0.7 && wrap(s.p[0] + s.p[2], 1.8) < 0.7
          ? tone(STEEL, s.light + 0.25, 1)
          : tone(color, s.light, wrap(band(s.p), 2.2) > 2 ? -1 : 0);
    case 'ringmail':
      return (s) => tone(DARK_STEEL, s.light + 0.1, Math.round(band(s.p) * 1.4) % 2 ? 1 : 0);
    case 'chain':
      return (s) =>
        tone(STEEL, s.light, (s.x + s.y * 2) % 3 === 0 ? -1 : (s.x + s.y) % 2 === 0 ? 1 : 0);
    case 'plate':
      return (s) => (wrap(band(s.p), 3) < 0.28 ? tone(DARK_STEEL, s.light) : metal(STEEL)(s));
    case 'bone':
      return (s) =>
        wrap(band(s.p), 2.6) < 0.55 ? tone(BONE_GAP, s.light) : tone(OLD_BONE, s.light);
    case 'segmented':
      // Bandas de acero superpuestas (el brazal legionario): una línea oscura entre banda y banda.
      return (s) => (wrap(band(s.p), 1.3) < 0.25 ? tone(DARK_STEEL, s.light) : metal(STEEL)(s));
  }
}

// ── Samurái, legionario y templario ─────────────────────────────────

const LACE = ramp([40, 46, 84]);
const TUNIC_RED = ramp([150, 34, 32]);
const SURCOAT = ramp([232, 226, 210]);
const CROSS_RED = ramp([168, 30, 30]);

/** Placas laqueadas en hileras (según `row`): borde dorado arriba, cordones atando las placas. */
function lacquer(color: Ramp, row: number, across: number, light: number): Rgb {
  const r = (((row % 1.5) + 1.5) % 1.5) / 1.5;
  if (r < 0.14) return tone(GOLD, light + 0.05);
  if ((((across * 0.8) % 1) + 1) % 1 < 0.13) return tone(LACE, light);
  return tone(color, light + 0.1 - r * 0.25, r < 0.3 ? 1 : 0);
}

/** ¿Está el punto dentro de una cruz de brazos que se abren hacia afuera? */
function crossPattee(x: number, y: number, reach: number): boolean {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax > reach || ay > reach) return false;
  return ax < 0.5 + ay * 0.24 || ay < 0.5 + ax * 0.24;
}

/** La superficie de una pieza puesta, con su color (o el teñido). */
function pieceSurface(kind: ItemKind, band: (p: Vec3) => number): Material | null {
  const stuff = STUFF[kind];
  if (!stuff) return null;
  return armorSurface(stuff, ramp(wornColor(kind) ?? [122, 78, 42]), band);
}

interface Palette {
  readonly skin: Ramp;
  readonly cloth: Ramp;
  readonly hair: Ramp;
  readonly pants: Ramp;
  readonly boots: Ramp;
  readonly belt: Ramp;
}

function paletteFor(appearance: Appearance, equipment: EquipmentLook): Palette {
  return {
    skin: ramp(hexToRgb(appearance.skinTone)),
    cloth: ramp(
      equipment.torso === 'robe' || (equipment.torso && SHIRTS.has(equipment.torso))
        ? (wornColor(equipment.torso) ?? [58, 42, 106])
        : hexToRgb(appearance.clothHue),
    ),
    hair: ramp(hexToRgb(appearance.hairHue)),
    pants: ramp(wornColor(equipment.legs) ?? [78, 62, 46]),
    boots: ramp(wornColor(equipment.feet) ?? [52, 38, 28]),
    belt: ramp([70, 48, 30]),
  };
}

/** Ropa de trabajo de los personajes del pueblo. */
type Outfit = 'apron' | 'robe' | 'innkeeper' | 'vest' | 'woodcutter';
const OUTFITS: Readonly<Partial<Record<NpcRole, Outfit>>> = {
  blacksmith: 'apron',
  mage: 'robe',
  innkeeper: 'innkeeper',
  banker: 'vest',
  stablemaster: 'apron',
  woodcutter: 'woodcutter',
  carpenter: 'apron',
  alchemist: 'robe',
  bowyer: 'vest',
  baker: 'apron',
  butcher: 'apron',
  jeweler: 'vest',
  farmer: 'woodcutter',
};

/** Camisa a cuadros rojos y negros del leñador. */
const PLAID_RED = ramp([170, 44, 40]);
const PLAID_DARK = ramp([52, 30, 30]);
function plaid(s: { p: Vec3; light: number }): Rgb {
  const a = Math.floor((s.p[0] + s.p[2] + 100) / 1.6) % 2;
  const b = Math.floor((s.p[1] + 100) / 1.6) % 2;
  return tone(a && b ? PLAID_DARK : a || b ? PLAID_RED : ramp([200, 70, 60]), s.light);
}

/** Todo lo que define cómo se ve el cuerpo en un frame. */
interface Figure {
  readonly rig: Rig;
  readonly palette: Palette;
  readonly equipment: EquipmentLook;
  readonly outfit: Outfit | null;
  readonly female: boolean;
  /** Pollera hasta la rodilla (mujeres sin pantalón puesto). */
  readonly skirt: boolean;
  /** Túnica hasta el suelo (la maga, o una túnica puesta). */
  readonly robed: boolean;
  /** Armadura de metal en el torso (cota de malla o peto de placas). */
  readonly metalTorso: boolean;
  /**
   * Un jugador sin nada en el torso o en las piernas: se ve la ropa interior,
   * como en UO, sencilla y tapada (un short largo; las mujeres, también una
   * musculosa). Los vecinos del pueblo siempre andan vestidos.
   */
  readonly bareTorso: boolean;
  readonly underpants: boolean;
}

/** Lino claro de la ropa interior. */
const UNDERWEAR = ramp([226, 220, 204]);

// ── Personaje ───────────────────────────────────────────────────────

/**
 * Dibuja un frame del personaje mirando en `direction`, con lo que tenga
 * puesto. `role` viste a los personajes del pueblo con su ropa de oficio.
 */
export function drawCharacterFrame(
  appearance: Appearance,
  direction: Direction,
  frame: CharacterFrame,
  equipment: EquipmentLook = {},
  role: NpcRole | null = null,
  mount: MountKind | null = null,
  canvasFor: CanvasFactory = spriteCanvas,
  hues: EquipmentHues = {},
): PixelImage {
  dyed = hues;
  try {
    return drawFigure(appearance, direction, frame, equipment, role, mount, canvasFor);
  } finally {
    dyed = {};
  }
}

function drawFigure(
  appearance: Appearance,
  direction: Direction,
  frame: CharacterFrame,
  equipment: EquipmentLook,
  role: NpcRole | null,
  mount: MountKind | null,
  canvasFor: CanvasFactory,
): PixelImage {
  // Montado: lienzo más grande, la montura primero y el jinete sentado en ella.
  const layout = mount ? mountLayout(mount) : null;
  const canvas = layout
    ? spriteCanvas(layout.width, layout.height, mountedCamera(direction, mount ?? undefined))
    : canvasFor(CHARACTER_ART_WIDTH, CHARACTER_ART_HEIGHT, cameraFor(direction));
  const ride = mount ? drawMount(canvas, mount, frame) : null;
  const female = appearance.gender === 'female';
  const outfit = role ? (OUTFITS[role] ?? null) : null;
  const robed = outfit === 'robe' || equipment.torso === 'robe' || equipment.torso === 'dress';
  const leftWeapon = heldInLeftHand(equipment.rightHand);
  const figure: Figure = {
    rig: humanoidRig(
      frame,
      equipment.rightHand !== undefined && !leftWeapon,
      BUILDS[female ? 'female' : 'male'],
      ride?.seat,
    ),
    palette: paletteFor(appearance, equipment),
    equipment,
    outfit,
    female,
    skirt:
      (female && !equipment.legs && !robed && role !== null) ||
      (equipment.legs === 'skirt' && !robed),
    robed,
    metalTorso:
      equipment.torso === 'chainmail' ||
      equipment.torso === 'ringmail' ||
      equipment.torso === 'plate-chest' ||
      equipment.torso === 'female-plate' ||
      equipment.torso === 'samurai-do' ||
      equipment.torso === 'legion-cuirass' ||
      equipment.torso === 'templar-hauberk',
    bareTorso: role === null && !equipment.torso && !outfit,
    underpants: role === null && !equipment.legs && !robed,
  };

  drawLegs(canvas, figure);
  drawTorso(canvas, figure);
  drawArms(canvas, figure);
  if (equipment.neck && equipment.neck !== 'samurai-mempo')
    drawGorget(canvas, figure.rig, equipment.neck);
  const headgear = equipment.head;
  drawHumanHead(canvas, figure.rig.head, figure.rig.neck, {
    skin: figure.palette.skin,
    hair: figure.palette.hair,
    hairStyle: appearance.hairStyle ?? (female ? 'long' : 'short'),
    facialHair: female ? 'none' : (appearance.facialHair ?? 'none'),
    female,
    headgear:
      headgear === 'straw-hat' || headgear === 'feathered-hat' || headgear === 'tricorne'
        ? headgear
        : headgear === 'bandana'
          ? 'bandana'
          : headgear === 'bone-helm'
            ? 'skull'
            : headgear === 'samurai-kabuto'
              ? 'kabuto'
              : headgear === 'legion-helm'
                ? 'galea'
                : headgear === 'templar-helm'
                  ? 'great-helm'
                  : headgear === 'iron-helmet' || headgear === 'chain-coif'
                    ? 'helmet'
                    : headgear === 'plate-helm'
                      ? 'plate-helm'
                      : headgear === 'wizard-hat' || (!headgear && outfit === 'robe')
                        ? 'wizard'
                        : headgear
                          ? 'cap'
                          : null,
    capColor: ramp(wornColor(headgear) ?? [122, 78, 42]),
    hatColor:
      headgear === 'wizard-hat' ? ramp(wornColor(headgear) ?? [58, 42, 106]) : figure.palette.cloth,
  });
  if (equipment.neck === 'samurai-mempo')
    drawMempo(canvas, figure.rig.head, ramp(wornColor(equipment.neck) ?? [154, 38, 32]));
  if (equipment.cloak)
    drawCloak(canvas, figure.rig, ramp(wornColor(equipment.cloak) ?? [120, 30, 40]));
  if (equipment.leftHand) drawShield(canvas, figure.rig, equipment.leftHand);
  if (equipment.rightHand) {
    if (leftWeapon) drawBow(canvas, figure.rig);
    else drawWeapon(canvas, figure.rig, equipment.rightHand);
  }
  ride?.tack(canvas, figure.rig);
  return canvas.toImage(OUTLINE);
}

function drawLegs(
  canvas: VolumeCanvas,
  { rig, palette: p, female, skirt, robed, equipment, underpants }: Figure,
): void {
  const thick = female ? 0.9 : 1;
  const plate = equipment.legs === 'plate-legs';
  const bone = equipment.legs === 'bone-leggings';
  const leather = equipment.legs === 'leather-leggings';
  const shorts = equipment.legs === 'short-pants';
  const haidate = equipment.legs === 'samurai-haidate';
  const legionLegs = equipment.legs === 'legion-greaves';
  const suneate = equipment.feet === 'samurai-suneate';
  const lacquerColor = ramp(wornColor(equipment.feet ?? equipment.legs) ?? [154, 38, 32]);
  const hakama = ramp([52, 56, 80]);
  // Perneras tachonadas, de anillas o de malla: el material de la pieza, en hileras.
  const legPiece =
    equipment.legs && !plate && !bone && !leather && !haidate && !legionLegs
      ? STUFF[equipment.legs]
      : undefined;
  const mailLegs =
    legPiece && equipment.legs ? pieceSurface(equipment.legs, (q) => q[1] * 0.9) : null;
  // Alto del calzado sobre el tobillo: sandalias y zapatos bajos, botas altas hasta la rodilla.
  const feet = equipment.feet;
  const shoeHeight =
    feet === 'sandals' ? 0.6 : feet === 'shoes' ? 1.6 : feet === 'thigh-boots' ? 0 : 6;
  for (const side of [1, -1] as const) {
    const leg = rig.legs[side];
    // Pantalón (o piernas, bajo la pollera) hasta la caña de la bota; bota con borde claro.
    // Las grebas de placas son de metal con rodillera; las perneras, cuero con costuras.
    const legMaterial: Material = (s) => {
      // La bota llega hasta 6 px sobre el tobillo (de pie o montado).
      const bootTop =
        feet === 'thigh-boots'
          ? leg.knee[1] + 1.5
          : suneate
            ? leg.knee[1] + 0.4
            : leg.ankle[1] + shoeHeight;
      // Canilleras samuráis: tablillas laqueadas unidas por tiras de malla.
      if (suneate && s.p[1] < bootTop && s.p[1] > leg.ankle[1] + 0.8) {
        const local = sub(s.p, lerp(leg.knee, leg.ankle, 0.5));
        const stripe = (((Math.atan2(local[0], local[2]) * (4 / Math.PI)) % 1) + 1) % 1;
        if (stripe < 0.2) return tone(STEEL, s.light, (s.x + s.y) % 2 ? 1 : -1);
        return tone(lacquerColor, s.light + 0.1, s.p[1] > bootTop - 0.8 ? 1 : 0);
      }
      if (suneate && s.p[1] < bootTop) return tone(LACE, s.light);
      if (s.p[1] < bootTop && !(plate && !equipment.feet))
        return tone(p.boots, s.light, s.p[1] > bootTop - 1 ? 1 : 0);
      // Sandalias: tiras sobre el pie descalzo.
      if (feet === 'sandals' && s.p[1] < leg.ankle[1] + 2) return tone(p.skin, s.light);
      if (shorts && s.p[1] < leg.knee[1] - 0.5) return tone(p.skin, s.light);
      if (legionLegs) {
        // Muslo descubierto y greba de acero de la rodilla al tobillo.
        if (s.p[1] < leg.knee[1] + 0.8) return metal(STEEL)(s);
        return tone(p.skin, s.light);
      }
      if (haidate) return tone(hakama, s.light, Math.sin(s.p[0] * 1.3) > 0.7 ? -1 : 0);
      // Ropa interior: un short de lino hasta la mitad del muslo; abajo, la pierna.
      if (underpants)
        return s.p[1] > lerp(leg.knee, leg.hip, 0.45)[1]
          ? tone(UNDERWEAR, s.light, s.p[1] < lerp(leg.knee, leg.hip, 0.5)[1] ? -1 : 0)
          : tone(p.skin, s.light);
      if (bone) {
        // Placas de hueso atadas, con la rodilla de calavera.
        // Muslo de placas atadas con tiras; la canillera, una sola pieza con borde.
        const nearKnee = Math.hypot(...sub(s.p, leg.knee)) < 2.6;
        if (nearKnee) return tone(OLD_BONE, s.light + 0.1, 1);
        if (s.p[1] < leg.knee[1])
          return Math.abs(s.p[1] - (leg.knee[1] + leg.ankle[1]) / 2) < 0.4
            ? tone(LEATHER_DARK, s.light)
            : tone(OLD_BONE, s.light);
        return Math.round(s.p[1]) % 3 === 0 ? tone(LEATHER_DARK, s.light) : tone(OLD_BONE, s.light);
      }
      if (plate) {
        const nearKnee = Math.hypot(...sub(s.p, leg.knee)) < 2.6;
        return nearKnee ? tone(STEEL, s.light + 0.2, 1) : metal(STEEL)(s);
      }
      if (mailLegs) return mailLegs(s);
      if (leather && Math.round(s.p[1]) % 5 === 0) return tone(p.pants, s.light, -1);
      return tone(skirt ? p.skin : p.pants, s.light, skirt ? -1 : 0);
    };
    canvas.limb(leg.hip, leg.knee, 3.3 * thick, 2.7 * thick, legMaterial);
    canvas.limb(leg.knee, leg.ankle, 2.7 * thick, 2.2 * thick, legMaterial);
    if (plate) {
      // Rodillera de placas con su ala y el empeine de la greba.
      const forward = normalize(sub(leg.toe, leg.ankle));
      canvas.sphere(add(leg.knee, scale(forward, 1.2)), 2.2 * thick, metal(STEEL));
      canvas.ellipsoid(
        add(leg.knee, scale(forward, 0.4)),
        axesAlong(forward),
        [2.9 * thick, 1.6, 0.8],
        (s) => tone(STEEL, s.light + 0.15, 1),
      );
    }
    if (bone) {
      // Rodillera de hueso abombada, con una púa hacia adelante.
      const forward = normalize(sub(leg.toe, leg.ankle));
      const cap = add(leg.knee, scale(forward, 1.6));
      canvas.sphere(cap, 2 * thick, solid(OLD_BONE));
      canvas.limb(
        cap,
        add(add(cap, scale(forward, 2.6)), [0, 1, 0]),
        0.7,
        0.15,
        solid(OLD_BONE, 1),
      );
    }
    if (legionLegs || equipment.legs === 'templar-chausses') {
      // Rodillera abombada (de la greba legionaria o sobre las calzas de malla).
      const forward = normalize(sub(leg.toe, leg.ankle));
      canvas.sphere(add(leg.knee, scale(forward, 1.1)), 2 * thick, metal(STEEL));
    }
    if (haidate) {
      // Faldar: un panel de placas chicas cosidas sobre tela, delante de cada muslo.
      const forward = normalize(sub(leg.toe, leg.ankle));
      const up = normalize(sub(leg.hip, leg.knee));
      const center = add(lerp(leg.hip, leg.knee, 0.42), add(scale(forward, 3.1), scale(up, 0.6)));
      canvas.box(center, axesAlong(forward, up), [3.1 * thick, 4.4, 0.35], (q) => {
        const gx = ((((q.p[0] + q.p[2]) * 1.1) % 1) + 1) % 1;
        const gy = (((q.p[1] * 1.1) % 1) + 1) % 1;
        if (gx < 0.16 || gy < 0.16) return tone(LACE, q.light);
        return tone(lacquerColor, q.light + 0.1 - gy * 0.2, gy < 0.4 ? 1 : 0);
      });
    }
    canvas.ellipsoid(
      lerp(leg.ankle, leg.toe, 0.55),
      axesAlong(sub(leg.toe, leg.ankle)),
      [2.3 * thick, 1.7, 3.5 * thick],
      suneate ? solid(LACE) : solid(p.boots),
    );
  }
  if (legionLegs && !robed) {
    // Faldón de tiras de cuero rojo con remaches de bronce en la punta.
    for (let i = 0; i < 13; i++) {
      const a = -Math.PI * 0.95 + (i / 12) * Math.PI * 1.9;
      const from = rig.pelvis.at([Math.sin(a) * 6.4, -0.4, Math.cos(a) * 5.2]);
      const to = rig.pelvis.at([Math.sin(a) * 7.6, -6.6, Math.cos(a) * 6.6]);
      canvas.limb(from, to, 0.9, 0.8, (q) =>
        q.p[1] < to[1] + 0.9 ? tone(GOLD, q.light) : tone(TUNIC_RED, q.light, i % 2 ? -1 : 0),
      );
    }
  }
  if (equipment.torso === 'templar-hauberk' && !robed && !rig.seated) {
    // Faldón de la sobreveste: tela blanca hasta la rodilla, abierta adelante.
    const top = rig.pelvis.origin[1] - 1;
    const bottom = Math.min(rig.legs[1].knee[1], rig.legs[-1].knee[1]) - 1;
    const knees = lerp(rig.legs[1].knee, rig.legs[-1].knee, 0.5);
    const kneeGap = Math.abs(rig.legs[1].knee[2] - rig.legs[-1].knee[2]);
    const step = canvas.detail > 1 ? 0.35 : 1;
    const cloth = clipping((q) => {
      const local = rig.pelvis.local(q.p);
      // La abertura del frente, entre las piernas.
      if (local[2] > 3 && Math.abs(local[0]) < 0.9 && q.p[1] < top - 2) return null;
      return tone(SURCOAT, q.light, Math.sin(q.p[0] * 0.9) > 0.6 ? -1 : 0);
    });
    for (let y = top; y >= bottom; y -= step) {
      const t = (top - y) / Math.max(1, top - bottom);
      const center: Vec3 = [
        rig.pelvis.origin[0] + (knees[0] - rig.pelvis.origin[0]) * t,
        y,
        rig.pelvis.origin[2] + (knees[2] - rig.pelvis.origin[2]) * t - 0.3 * t,
      ];
      canvas.ellipsoid(
        center,
        rig.pelvis.axes,
        [5.8 + t * 1.6, 1.4, 4.5 + t * (1.2 + kneeGap * 0.55)],
        cloth,
        canvas.detail > 1 ? 0.92 : 0,
      );
    }
  }
  if (plate && !robed) {
    // Escarcelas: tres láminas de placa que cuelgan del cinturón sobre los muslos.
    for (const [i, dy] of [-1.2, -2.8, -4.4].entries())
      canvas.ellipsoid(
        rig.pelvis.at([0, dy, 0.2]),
        rig.pelvis.axes,
        [5.4 + i * 0.35, 1.05, 4.1 + i * 0.3],
        (s) => tone(STEEL, s.light + 0.1, s.p[1] < rig.pelvis.at([0, dy - 0.7, 0])[1] ? -1 : 1),
      );
  }
  if (robed || skirt) {
    // Túnica hasta el suelo, o pollera hasta la rodilla: discos que se ensanchan.
    // Montado, la tela cae hasta las rodillas sobre el lomo.
    const bottom = rig.seated
      ? Math.min(rig.legs[1].knee[1], rig.legs[-1].knee[1]) - 2
      : robed
        ? 2
        : rig.legs[1].knee[1] - 1;
    const top = rig.pelvis.origin[1] + 1;
    const flare = robed ? 3.2 : 2.2;
    const skirtCloth = equipment.legs === 'skirt' && !robed ? p.pants : p.cloth;
    const fabric: Material = (s) =>
      tone(skirtCloth, s.light, Math.sin(s.p[0] * 0.9) > 0.6 ? -1 : 0);
    // La tela sigue a las rodillas: se corre y se abre cuando las piernas se separan.
    const knees = lerp(rig.legs[1].knee, rig.legs[-1].knee, 0.5);
    const kneeGap = Math.abs(rig.legs[1].knee[2] - rig.legs[-1].knee[2]);
    // En la ventana de personaje, discos más juntos: la tela cae lisa, sin escalones.
    const step = canvas.detail > 1 ? 0.35 : 1;
    for (let y = top; y >= bottom; y -= step) {
      const t = (top - y) / Math.max(1, top - bottom);
      const follow = Math.min(1, t * 1.4);
      const center: Vec3 = [
        rig.pelvis.origin[0] + (knees[0] - rig.pelvis.origin[0]) * follow,
        y,
        rig.pelvis.origin[2] + (knees[2] - rig.pelvis.origin[2]) * follow - 0.3 * t,
      ];
      canvas.ellipsoid(
        center,
        rig.pelvis.axes,
        [5.6 + t * flare, 1.4, 4.4 + t * (flare * 0.75 + kneeGap * 0.55)],
        fabric,
        canvas.detail > 1 ? 0.92 : 0,
      );
    }
  }
}

function torsoMaterial({
  rig,
  palette: p,
  equipment,
  outfit,
  female,
  robed,
  bareTorso,
  underpants,
}: Figure): Material {
  const armor = equipment.torso;
  const leather =
    armor === 'leather-armor' || armor === 'studded-leather'
      ? ramp(wornColor(armor) ?? [122, 78, 42])
      : null;
  const studded = armor === 'studded-leather';
  const chest = rig.chest;
  const beltY = rig.pelvis.origin[1];
  return (s) => {
    const local = chest.local(s.p);
    const n = chest.localDir(s.n);
    const y = s.p[1] - beltY;
    const front = n[2] > 0.35;
    // Sin pantalón, la cintura del short; sin camisa, el pecho (o la musculosa).
    if (underpants && y < 1.8) return tone(UNDERWEAR, s.light, y > 0.9 ? -1 : 0);
    if (bareTorso && y < 1.8) {
      // Con pantalón y sin camisa: el cinturón y, debajo, el pantalón.
      if (y > -0.6) return tone(p.belt, s.light);
      return tone(p.pants, s.light);
    }
    if (bareTorso) {
      if (!female) return tone(p.skin, s.light);
      // Musculosa de lino: cubre del pecho a la cintura, con tiras anchas sobre los hombros.
      const strap = Math.abs(Math.abs(local[0]) - 2.4) < 1.1;
      return local[1] < 3.4 || strap ? tone(UNDERWEAR, s.light) : tone(p.skin, s.light);
    }
    // Cinturón con hebilla.
    if (y > -0.6 && y < 1.8 && !robed) {
      if (front && Math.abs(local[0]) < 1.3) return tone(GOLD, s.light);
      return tone(p.belt, s.light);
    }
    if ((armor === 'plate-chest' || armor === 'female-plate') && y > -4) {
      // Peto de placas: el pecho de una sola pieza con una cresta al centro y,
      // abajo, la faja de láminas sobre el vientre.
      if (front && Math.abs(local[0]) < 0.5 && y > 3.5) return tone(STEEL, s.light + 0.25, 1);
      if (y < 4 && ((y + 20) % 1.7) / 1.7 < 0.2) return tone(STEEL, s.light - 0.25, -1);
      return metal(STEEL)(s);
    }
    if (armor === 'samurai-do' && y > -4) {
      // Coraza samurái: hileras de placas laqueadas atadas con cordones.
      return lacquer(ramp(wornColor(armor) ?? [154, 38, 32]), y + 0.4, local[0], s.light);
    }
    if (armor === 'legion-cuirass' && y > -4) {
      // Coraza legionaria: bandas de acero alrededor del cuerpo y bisagras de bronce al frente.
      const band = (((y + 20) % 1.6) + 1.6) % 1.6;
      if (front && Math.abs(local[0]) < 0.55 && band > 0.4 && band < 1) return tone(GOLD, s.light);
      if (local[1] > 3.2 && Math.abs(Math.abs(local[0]) - 2.6) < 0.35) return tone(GOLD, s.light);
      return band < 0.28 ? tone(DARK_STEEL, s.light) : metal(STEEL)(s);
    }
    if (armor === 'templar-hauberk' && y > -4) {
      // Sobreveste blanca adelante y atrás (con la cruz roja en el pecho); a los costados, la malla.
      if (Math.abs(n[2]) > 0.3 || Math.abs(local[0]) < 3.6) {
        if (front && crossPattee(local[0], local[1] - 0.8, 3.4)) return tone(CROSS_RED, s.light);
        return tone(
          SURCOAT,
          s.light,
          noise(Math.floor(local[0]), Math.floor(y / 2)) > 0.9 ? -1 : 0,
        );
      }
      return tone(STEEL, s.light, (s.x + s.y * 2) % 3 === 0 ? -1 : (s.x + s.y) % 2 === 0 ? 1 : 0);
    }
    if (armor === 'bone-armor' && y > -4) {
      // Costillar: costillas que bajan en curva desde el esternón, con huecos
      // oscuros entre una y otra; atrás, el espinazo sobre cuero.
      if (front && Math.abs(local[0]) < 0.7) return tone(OLD_BONE, s.light + 0.15, 1);
      if (!front && n[2] < -0.35 && Math.abs(local[0]) < 0.8) return tone(OLD_BONE, s.light, 1);
      const rib = ((y + Math.abs(local[0]) * 0.45 + 20) % 2.2) / 2.2;
      if (rib < 0.58) return tone(OLD_BONE, s.light, rib < 0.12 ? 1 : 0);
      return tone(front ? BONE_GAP : LEATHER_DARK, s.light);
    }
    if (armor === 'ringmail' && y > -4) {
      // Anillas cosidas en hileras sobre cuero.
      return tone(DARK_STEEL, s.light + 0.1, Math.round(y * 1.2) % 2 ? 1 : 0);
    }
    if (armor === 'chainmail' && y > -4) {
      // Malla: anillos alternados.
      const ring = (s.x + s.y * 2) % 3 === 0 ? -1 : (s.x + s.y) % 2 === 0 ? 1 : 0;
      return tone(STEEL, s.light, ring);
    }
    if (leather && y > 0) {
      // Pechera: costuras horizontales y remaches.
      if (
        studded &&
        (Math.round(local[0] * 0.8) + Math.round(y * 0.8)) % 3 === 0 &&
        (s.x + s.y) % 2 === 0
      )
        return tone(STEEL, s.light + 0.2, 1);
      if (Math.abs(((y + 0.5) % 4.5) - 0.5) < 0.45) return tone(leather, s.light, -1);
      if (front && Math.abs(Math.abs(local[0]) - 3) < 0.5 && Math.round(y) % 3 === 0)
        return tone(GOLD, s.light, 1);
      return tone(leather, s.light);
    }
    if (outfit === 'woodcutter' && y > 0) {
      // Tiradores oscuros sobre la camisa a cuadros.
      if (Math.abs(Math.abs(local[0]) - 2.4) < 0.55) return tone(LEATHER_DARK, s.light);
      return plaid(s);
    }
    if (outfit === 'vest' && y > 0) {
      // Chaleco oscuro abierto sobre camisa blanca, con botones dorados.
      if (front && Math.abs(local[0]) < 1.6) {
        return Math.abs(local[0]) < 0.5 && Math.round(y) % 3 === 0
          ? tone(GOLD, s.light, 1)
          : tone(LINEN, s.light);
      }
      return tone(ramp([46, 40, 58]), s.light);
    }
    // Camisa con escote (en V, o redondo y más amplio en las mujeres).
    const neckline = female
      ? local[1] > 3.6 && Math.hypot(local[0], (local[1] - 6.2) * 1.4) < 3
      : local[1] > 2.5 && Math.abs(local[0]) < (local[1] - 2) * 0.7;
    if (front && neckline) return tone(p.skin, s.light, -1);
    return tone(
      p.cloth,
      s.light,
      noise(Math.floor(local[0] / 2), Math.floor(y / 3)) > 0.82 ? -1 : 0,
    );
  };
}

function drawTorso(canvas: VolumeCanvas, figure: Figure): void {
  const {
    rig,
    palette: p,
    equipment,
    outfit,
    female,
    skirt,
    robed,
    metalTorso,
    bareTorso,
  } = figure;
  const material = torsoMaterial(figure);
  const pelvis = rig.pelvis;
  const chest = rig.chest;
  // Cadera, cintura y pecho; en las mujeres, cadera más ancha, cintura fina y busto.
  // De cerca, la luz no cambia de golpe entre una parte y otra (el torso se ve de una pieza).
  const smooth = canvas.detail > 1 ? 0.7 : 0;
  canvas.ellipsoid(
    pelvis.at([0, 0.5, 0]),
    pelvis.axes,
    female ? [5.8, 4, 3.8] : [5.3, 3.8, 3.5],
    material,
    smooth,
  );
  canvas.ellipsoid(
    lerp(pelvis.at([0, 4.5, 0.1]), chest.at([0, -5, 0]), 0.3),
    chest.axes,
    female ? [4, 3.4, 2.9] : [4.9, 3.6, 3.2],
    material,
    smooth,
  );
  // Caja torácica amplia y, arriba, el pecho que se ensancha hacia los hombros.
  canvas.ellipsoid(
    chest.at([0, 0.4, 0]),
    chest.axes,
    female ? [5.3, 6.2, 3.6] : [6.2, 6.7, 4.1],
    material,
    smooth,
  );
  canvas.ellipsoid(
    chest.at([0, 2.9, 0.4]),
    chest.axes,
    female ? [5.6, 3, 3.4] : [6.6, 3.3, 3.9],
    material,
    smooth,
  );
  // Trapecios: la pendiente del cuello a cada hombro, sobre las clavículas.
  const shoulderSpan = Math.abs(rig.arms[1].shoulder[0] - rig.arms[-1].shoulder[0]) / 2;
  for (const side of [1, -1] as const) {
    canvas.limb(
      chest.at([side * 1.3, 6.1, -0.7]),
      chest.at([side * (shoulderSpan - 1.3), 4.5, -0.4]),
      female ? 1.9 : 2.3,
      female ? 2.2 : 2.6,
      material,
    );
  }
  // El peto de mujer tiene el busto forjado en la placa.
  if ((female && !metalTorso) || equipment.torso === 'female-plate') {
    if (canvas.detail > 1)
      // De cerca, una sola forma ancha y suave sobre el pecho, sin marcar nada.
      canvas.ellipsoid(chest.at([0, 0.7, 1.6]), chest.axes, [4.3, 2.3, 2.1], material, 0.5);
    else
      for (const side of [1, -1] as const)
        canvas.sphere(chest.at([side * 2.1, 0.8, 2.4]), 2.2, material);
  }
  // Faldón de la camisa debajo del cinturón.
  if (!robed && !skirt && !metalTorso && !bareTorso) {
    // De cerca (ventana de personaje), un ruedo que rodea la cadera.
    if (canvas.detail > 1)
      canvas.ellipsoid(pelvis.at([0, -0.4, 0]), pelvis.axes, [5.7, 1.1, 4.1], solid(p.cloth));
    else
      canvas.ellipsoid(pelvis.at([0, -2.2, 0]), pelvis.axes, [5.5, 2.6, 3.7], solid(p.cloth, -1));
  }
  const torso = equipment.torso;
  const armStuff = STUFF[equipment.arms ?? 'gold'];
  const plateArms = armStuff === 'plate' || armStuff === 'segmented';
  // Hombreras para las armaduras (la ropa de tela no tiene).
  if ((torso && torso !== 'robe' && !SHIRTS.has(torso)) || plateArms) {
    // Hombreras: más grandes en el peto de placas.
    const bone = torso === 'bone-armor';
    const pad =
      torso === 'samurai-do'
        ? solid(ramp(wornColor(torso) ?? [154, 38, 32]), 1)
        : torso === 'templar-hauberk' && !plateArms
          ? (q: Sample) =>
              tone(STEEL, q.light, (q.x + q.y * 2) % 3 === 0 ? -1 : (q.x + q.y) % 2 ? 1 : 0)
          : metalTorso || plateArms
            ? metal(STEEL)
            : bone
              ? solid(OLD_BONE)
              : solid(ramp(wornColor(torso ?? 'gold') ?? [122, 78, 42]), 1);
    const big =
      torso === 'plate-chest' || torso === 'female-plate' || plateArms ? 1.2 : bone ? 1.15 : 1;
    for (const side of [1, -1] as const) {
      const top = add(rig.arms[side].shoulder, chest.dir([side * 0.4, 0.8, 0]));
      canvas.ellipsoid(
        top,
        chest.axes,
        scale(female ? [2.8, 2.1, 2.9] : [3.2, 2.4, 3.3], big),
        pad,
      );
      // La hombrera de hueso tiene púas curvas hacia arriba y afuera.
      if (bone)
        for (const [dx, dz] of [
          [0.2, 0.9],
          [0.8, -0.1],
          [0.3, -1],
        ] as const)
          canvas.limb(
            add(top, chest.dir([side * dx * 2.6, 2, dz * 2.2])),
            add(top, chest.dir([side * (dx * 2.6 + 2.2), 5.2, dz * 3])),
            0.75,
            0.15,
            solid(OLD_BONE, 1),
          );
    }
    if (torso === 'samurai-do' && !robed) {
      // Faldón de la coraza: tres hileras de placas en seis paneles alrededor de la cadera.
      const color = ramp(wornColor(torso) ?? [154, 38, 32]);
      for (const [i, dy] of [-1.4, -3.1, -4.8].entries())
        canvas.ellipsoid(
          rig.pelvis.at([0, dy, 0.1]),
          rig.pelvis.axes,
          [5.6 + i * 0.45, 1.05, 4.3 + i * 0.4],
          clipping((q) => {
            const local = rig.pelvis.local(q.p);
            const a = Math.atan2(local[0], local[2]) / ((Math.PI * 2) / 6) + 0.5;
            if (Math.abs((((a % 1) + 1) % 1) - 0.5) > 0.44) return null;
            return lacquer(color, q.p[1] - rig.pelvis.origin[1] + 0.5 - i * 0.2, local[0], q.light);
          }),
        );
    }
    if (torso === 'legion-cuirass' && !robed) {
      // La túnica roja asoma bajo la coraza.
      canvas.ellipsoid(rig.pelvis.at([0, -2.4, 0]), rig.pelvis.axes, [5.8, 2.6, 4.3], (q) =>
        tone(TUNIC_RED, q.light, Math.sin(q.p[0] * 1.4) > 0.6 ? -1 : 0),
      );
    }
    if (bone) {
      // Faldón de tiras de cuero rojo oscuro que cuelga del cinturón.
      const strap = ramp([118, 40, 34]);
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI * 0.85 + (i / 8) * Math.PI * 1.7;
        const from = rig.pelvis.at([Math.sin(a) * 5.2, -0.6, Math.cos(a) * 3.9]);
        const to = rig.pelvis.at([Math.sin(a) * 5.8, -6, Math.cos(a) * 4.5]);
        canvas.limb(from, to, 0.95, 0.85, (s) =>
          tone(i % 2 ? strap : LEATHER_DARK, s.light, s.p[1] < to[1] + 0.8 ? 1 : 0),
        );
      }
    }
  }
  if (outfit === 'apron') {
    canvas.polygon(
      [
        chest.at([-4.4, 3.5, 4.1]),
        chest.at([4.4, 3.5, 4.1]),
        pelvis.at([5.6, -12, 5.4]),
        pelvis.at([-5.6, -12, 5.4]),
      ],
      (s) => tone(LEATHER_DARK, s.light + 0.15),
    );
  }
  if (outfit === 'innkeeper') {
    canvas.polygon(
      [
        pelvis.at([-4.9, 1.5, 3.9]),
        pelvis.at([4.9, 1.5, 3.9]),
        pelvis.at([5.4, -11, 4.9]),
        pelvis.at([-5.4, -11, 4.9]),
      ],
      (s) => tone(LINEN, s.light + 0.2, Math.round(s.p[0] * 0.7) % 3 === 0 ? -1 : 0),
    );
  }
}

function drawArms(canvas: VolumeCanvas, figure: Figure): void {
  const { rig, palette: p, outfit, female, equipment, bareTorso } = figure;
  const torso = equipment.torso;
  const boneArmor = torso === 'bone-armor';
  // Las cotas de malla y de anillas tienen media manga; el peto de placas, no.
  const mailTorso = torso === 'chainmail' || torso === 'ringmail';
  const cloth: Material = bareTorso
    ? solid(p.skin)
    : boneArmor
      ? (s) => tone(LEATHER_DARK, s.light)
      : outfit === 'vest'
        ? solid(LINEN)
        : outfit === 'woodcutter'
          ? plaid
          : solid(p.cloth);
  // Herrero y tabernero trabajan con las mangas arremangadas.
  const bareForearms = outfit === 'apron' || outfit === 'innkeeper' || outfit === 'woodcutter';
  const thin = female ? 0.85 : 1;
  const sleeves = equipment.arms;
  const sleeveStuff = sleeves ? STUFF[sleeves] : undefined;
  for (const side of [1, -1] as const) {
    const arm = rig.arms[side];
    const along = (q: Vec3): number => Math.hypot(...sub(q, arm.shoulder));
    // Bajo las hombreras samuráis, mangas de tela azul oscuro con placas chicas cosidas.
    const kote: Material = (q) =>
      Math.round(along(q.p) * 1.2) % 3 === 0
        ? tone(ramp(wornColor(sleeves) ?? [154, 38, 32]), q.light)
        : tone(LACE, q.light);
    const piece = sleeves === 'samurai-sode' ? kote : sleeves ? pieceSurface(sleeves, along) : null;
    const mail = mailTorso && torso ? pieceSurface(torso, along) : null;
    const upper = piece ?? mail ?? cloth;
    const lower = piece ?? (bareForearms ? solid(p.skin) : cloth);
    const bulk =
      sleeveStuff === 'plate' || sleeveStuff === 'segmented'
        ? 1.12
        : sleeveStuff || sleeves === 'samurai-sode'
          ? 1.05
          : 1;
    canvas.limb(arm.shoulder, arm.elbow, 2.75 * thin * bulk, 2.1 * thin * bulk, upper);
    canvas.limb(arm.elbow, arm.hand, 2.1 * thin * bulk, 1.8 * thin * bulk, lower);
    const back = normalize(sub(arm.elbow, arm.hand));
    if (sleeveStuff === 'plate') {
      // Codera abombada con su ala y la canillera del antebrazo con borde.
      canvas.sphere(arm.elbow, 2.3 * thin, metal(STEEL));
      canvas.ellipsoid(
        add(arm.elbow, scale(back, 0.6)),
        axesAlong(back),
        [2.6 * thin, 2.6 * thin, 0.8],
        (s) => tone(STEEL, s.light + 0.1, 1),
      );
      canvas.limb(lerp(arm.elbow, arm.hand, 0.82), arm.hand, 2.25 * thin, 2.1 * thin, (s) =>
        tone(STEEL, s.light + 0.15, 1),
      );
    } else if (sleeves === 'samurai-sode') {
      // Hombrera samurái: una plancha grande de hileras laqueadas colgando del hombro.
      const down = normalize(sub(arm.elbow, arm.shoulder));
      const outward = rig.chest.dir([side, 0, 0.15]);
      const color = ramp(wornColor(sleeves) ?? [154, 38, 32]);
      const center = add(add(arm.shoulder, scale(down, 2.6)), scale(outward, 2.5));
      canvas.box(center, axesAlong(outward, scale(down, -1)), [2.9 * thin, 3.6, 0.45], (q) =>
        lacquer(color, q.p[1] - center[1] + 4, q.p[0] + q.p[2], q.light),
      );
    } else if (sleeveStuff === 'segmented') {
      // Brazal legionario: la hombrera de bandas y el guardabrazo del antebrazo.
      canvas.limb(lerp(arm.elbow, arm.hand, 0.3), arm.hand, 2.3 * thin, 2.05 * thin, (q) =>
        Math.round((q.p[1] - arm.hand[1]) * 1.4) % 3 === 0 ? tone(GOLD, q.light) : metal(STEEL)(q),
      );
    } else if (sleeveStuff === 'bone') {
      // Brazales de hueso con bandas y una púa en el codo.
      const bracer: Material = (s) =>
        Math.round((s.p[1] - arm.hand[1]) * 1.1) % 3 === 0
          ? tone(BONE_GAP, s.light)
          : tone(OLD_BONE, s.light);
      canvas.limb(lerp(arm.elbow, arm.hand, 0.2), arm.hand, 2.4 * thin, 2.1 * thin, bracer);
      canvas.sphere(arm.elbow, 1.9 * thin, solid(OLD_BONE));
      canvas.limb(arm.elbow, add(arm.elbow, scale(back, 3)), 0.8, 0.15, solid(OLD_BONE, 1));
    }
    drawHand(canvas, figure, side, thin);
  }
}

/**
 * La mano: en el mundo, una bola (a ese tamaño no se distingue más); en la
 * ventana de personaje, palma, cuatro dedos y pulgar, cerrada si empuña
 * algo. Con guantes, del material del guante; los guanteletes de placas
 * llevan puño acampanado y nudillera.
 */
function drawHand(canvas: VolumeCanvas, figure: Figure, side: 1 | -1, thin: number): void {
  const { rig, palette: p, equipment } = figure;
  const arm = rig.arms[side];
  const gloves = equipment.hands;
  const stuff = gloves ? STUFF[gloves] : undefined;
  const forward = normalize(sub(arm.hand, arm.elbow));
  const along = (q: Vec3): number => Math.hypot(...sub(q, arm.elbow)) * 2.2;
  const skin = gloves ? (pieceSurface(gloves, along) ?? solid(p.skin)) : solid(p.skin);
  if (stuff === 'plate' || stuff === 'bone') {
    // Puño acampanado del guantelete, sobre la muñeca.
    canvas.limb(
      sub(arm.hand, scale(forward, 1.8)),
      sub(arm.hand, scale(forward, 0.4)),
      1.9 * thin,
      2.3 * thin,
      stuff === 'plate' ? metal(STEEL) : solid(OLD_BONE),
    );
  } else if (gloves) {
    canvas.limb(
      sub(arm.hand, scale(forward, 1.6)),
      sub(arm.hand, scale(forward, 0.5)),
      1.95 * thin,
      2.05 * thin,
      skin,
    );
  }
  if (canvas.detail === 1) {
    canvas.sphere(arm.hand, (stuff === 'plate' ? 1.95 : 1.8) * thin, skin);
    return;
  }
  const holding =
    (side === 1 && equipment.rightHand !== undefined && !heldInLeftHand(equipment.rightHand)) ||
    (side === -1 && equipment.leftHand !== undefined);
  const lateral = rig.chest.dir([1, 0, 0]);
  const across = normalize(
    sub(
      lateral,
      scale(forward, lateral[0] * forward[0] + lateral[1] * forward[1] + lateral[2] * forward[2]),
    ),
  );
  const palm = add(arm.hand, scale(forward, 0.4));
  canvas.ellipsoid(palm, axesAlong(forward), [1.45 * thin, 0.85 * thin, 1.25 * thin], skin);
  if (holding) {
    // Puño cerrado alrededor del mango.
    canvas.ellipsoid(
      add(palm, scale(forward, 1)),
      axesAlong(forward),
      [1.5 * thin, 1.1 * thin, 1 * thin],
      skin,
    );
  } else {
    // Dedos sueltos que caen apenas curvos.
    for (const k of [-0.95, -0.32, 0.32, 0.95]) {
      const base = add(add(palm, scale(forward, 1)), scale(across, k * 0.62 * thin));
      const length = (k === -0.95 || k === 0.95 ? 1.5 : 1.85) * thin;
      canvas.limb(
        base,
        add(add(base, scale(forward, length)), [0, -0.15, 0]),
        0.42 * thin,
        0.33 * thin,
        skin,
      );
    }
  }
  // Pulgar, del lado de adentro (hacia el cuerpo).
  const inward = scale(across, -side);
  const thumb = add(arm.hand, scale(inward, 1.1 * thin));
  canvas.limb(
    thumb,
    add(add(thumb, scale(forward, 1.3 * thin)), scale(inward, 0.5)),
    0.5 * thin,
    0.36 * thin,
    skin,
  );
  if (stuff === 'plate')
    canvas.limb(
      add(palm, scale(across, -1.2 * thin)),
      add(palm, scale(across, 1.2 * thin)),
      0.5 * thin,
      0.5 * thin,
      (s) => tone(STEEL, s.light + 0.2, 1),
    );
}

/** Gola: de placas, anillos superpuestos sobre el cuello y los hombros; de cuero, un cuello alto. */
function drawGorget(canvas: VolumeCanvas, rig: Rig, kind: ItemKind): void {
  const stuff = STUFF[kind];
  const chest = rig.chest;
  const neckY = rig.neck[1];
  const surface = pieceSurface(kind, (q) => (neckY - q[1]) * 1.4) ?? solid(ramp([122, 78, 42]));
  if (stuff === 'plate') {
    for (const [dy, rx, rz] of [
      [-1.2, 5.6, 4.2],
      [0, 4.6, 3.6],
      [1.1, 3.6, 3],
    ] as const)
      canvas.ellipsoid(
        add(rig.neck, chest.dir([0, dy - 0.4, 0.2])),
        chest.axes,
        [rx, 0.75, rz],
        (s) => tone(STEEL, s.light + (dy > 0 ? 0.2 : 0.05), 1),
      );
    return;
  }
  canvas.ellipsoid(add(rig.neck, chest.dir([0, -0.2, 0.3])), chest.axes, [3.4, 1.8, 3.1], surface);
  canvas.ellipsoid(add(rig.neck, chest.dir([0, -1.6, 0.4])), chest.axes, [5, 0.9, 3.8], surface);
}

// ── Equipo ──────────────────────────────────────────────────────────

/**
 * Capa: una tela curva que cuelga de los hombros y envuelve la espalda por
 * fuera del cuerpo. En cada fila se aleja lo necesario para que las piernas
 * (y el torso inclinado) nunca la atraviesen, vuela hacia atrás según el
 * movimiento y ondea distinto en cada paso.
 */
function drawCloak(canvas: VolumeCanvas, rig: Rig, cloak: Ramp): void {
  const chest = rig.chest;
  const top = rig.arms[1].shoulder[1] + 0.8;
  // De pie llega casi al suelo; montado, cae sobre la grupa.
  const bottom = rig.seated ? rig.pelvis.origin[1] - 8 : 7;
  const rows = 12;
  const cols = 10;
  const reach = 1.45;

  // Lo que la capa tiene que esquivar: puntos de las piernas con su grosor.
  const obstacles: { p: Vec3; r: number }[] = [];
  for (const side of [1, -1] as const) {
    const leg = rig.legs[side];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      obstacles.push({ p: lerp(leg.hip, leg.knee, t), r: 3.6 });
      obstacles.push({ p: lerp(leg.knee, leg.ankle, t), r: 3.1 });
    }
    obstacles.push({ p: leg.toe, r: 2.4 });
  }

  const ring: Vec3[][] = [];
  let lastDepth = 0;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const y = top + (bottom - top) * t;
    const turn = chest.turn * (1 - t);
    const halfWidth = 7.9 + t * 2.4;
    const center = lerp(chest.origin, rig.pelvis.origin, Math.min(1, t * 1.6));
    // Profundidad: la de la espalda arriba, más el vuelo, y lo que pidan las piernas a esa altura.
    let depth = 4.6 + t * 1.2 + rig.sway * t * t;
    for (const { p, r } of obstacles) {
      if (Math.abs(p[1] - y) > r) continue;
      const across = Math.min(0.95, Math.abs(p[0] - center[0]) / halfWidth);
      depth = Math.max(depth, (-(p[2] - center[2]) + r + 0.8) / Math.sqrt(1 - across * across));
    }
    // Una tela no se mete hacia adentro de golpe al bajar.
    depth = Math.max(depth, lastDepth * 0.9);
    lastDepth = depth;
    const points: Vec3[] = [];
    for (let col = 0; col <= cols; col++) {
      const angle = -reach + (2 * reach * col) / cols;
      const wave = Math.sin(angle * 3 + rig.phase * 1.7) * 0.5 * t * (1 + rig.sway * 0.3);
      const local = yaw([Math.sin(angle) * halfWidth, 0, -Math.cos(angle) * (depth + wave)], turn);
      points.push([center[0] + local[0], y, center[2] + local[2]]);
    }
    ring.push(points);
  }

  const folds: Material = (s) => {
    const around = Math.atan2(s.p[0] - chest.origin[0], -(s.p[2] - chest.origin[2]));
    return tone(cloak, s.light * 0.95, Math.sin(around * 7) > 0.55 ? -1 : 0);
  };
  for (let row = 0; row < rows; row++) {
    const upper = ring[row];
    const lower = ring[row + 1];
    if (!upper || !lower) continue;
    for (let col = 0; col < cols; col++) {
      const a = upper[col];
      const b = upper[col + 1];
      const c = lower[col + 1];
      const d = lower[col];
      if (a && b && c && d) canvas.polygon([a, b, c, d], folds);
    }
  }
  // Esclavina sobre los hombros y broche.
  const shoulderY = top - chest.origin[1];
  canvas.ellipsoid(chest.at([0, shoulderY - 1.2, -0.6]), chest.axes, [8.2, 2.6, 4.9], solid(cloak));
  canvas.sphere(chest.at([0, shoulderY - 2.2, 4.1]), 1, metal(GOLD));
}

/**
 * Escudo en la mano izquierda. Los grandes (como los de justa) cubren del
 * pecho a la rodilla: se dibujan al costado, por delante del cuerpo.
 */
function drawShield(canvas: VolumeCanvas, rig: Rig, kind: ItemKind): void {
  const hand = rig.arms[-1].hand;
  if (kind === 'torch' || kind === 'lantern') return drawLight(canvas, rig, kind);
  // Los grandes miran casi al frente, como en la ventana de personaje de UO.
  const facing = normalize(rig.chest.dir(kind === 'buckler' ? [-0.8, 0, 0.6] : [-0.4, 0, 0.92]));
  const axes = axesAlong(facing);
  const up = axes[1];
  const across = axes[0];
  const color = ramp(wornColor(kind) ?? [138, 42, 42]);
  if (kind === 'buckler') {
    // Rodela chica y abombada.
    const middle = add(hand, rig.chest.dir([-1.4, 1.6, 1.2]));
    canvas.ellipsoid(middle, axes, [4.2, 4.2, 1.1], metal(STEEL));
    canvas.sphere(add(middle, scale(facing, 0.9)), 1.3, metal(STEEL));
    return;
  }
  // Los grandes van algo más afuera y más abajo que la mano, para cubrir hasta la rodilla.
  const middle = add(hand, rig.chest.dir([-3, 0.6, 2.6]));
  const at = (h: number, w: number, bulge = 0): Vec3 =>
    add(middle, add(add(scale(up, h), scale(across, w)), scale(facing, bulge)));
  const local = (q: Vec3): [number, number] => {
    const d = sub(q, middle);
    return [
      d[0] * across[0] + d[1] * across[1] + d[2] * across[2],
      d[0] * up[0] + d[1] * up[1] + d[2] * up[2],
    ];
  };
  if (kind === 'metal-shield' || kind === 'wooden-shield') {
    // Escudo redondo grande (de madera con tablas, o de acero con la cruz dorada).
    const wooden = kind === 'wooden-shield';
    const radii: Vec3 = wooden ? [8, 8.6, 1] : [8, 11, 1];
    canvas.ellipsoid(middle, axes, radii, (q) => {
      const [w, h] = local(q.p);
      const edge = Math.hypot(w / radii[0], h / radii[1]);
      if (edge > 0.88) return tone(STEEL, q.light);
      if (wooden) {
        if (edge < 0.24) return metal(GOLD)(q);
        return tone(color, q.light, Math.floor((w + 20) * 0.45) % 2 === 0 ? 0 : -1);
      }
      if (Math.abs(w) < 0.5 || Math.abs(h - 1.5) < 0.5) return tone(GOLD, q.light);
      return metal(STEEL)(q);
    });
    return;
  }
  if (kind === 'legion-shield') {
    // Escudo legionario: un rectángulo alto que se curva alrededor del cuerpo.
    const width = 7;
    const top = 10;
    const bottom = 13.5;
    const curve = (w: number): number => -((w / width) ** 2) * 2.4;
    const material: Material = (q) => {
      const [w, h] = local(q.p);
      if (Math.abs(w) > width - 0.6 || h > top - 0.6 || h < -bottom + 0.6)
        return tone(GOLD, q.light);
      const r = Math.hypot(w * 0.85, h);
      const wing = Math.abs(r - 3.6) < 0.35 && Math.abs(h) > 1;
      if (Math.abs(h) < 0.4 || wing) return tone(GOLD, q.light);
      return tone(color, q.light);
    };
    const strips = 8;
    for (let i = 0; i < strips; i++) {
      const a = -width + (2 * width * i) / strips;
      const b = -width + (2 * width * (i + 1)) / strips;
      canvas.polygon(
        [
          at(top, a, curve(a)),
          at(top, b, curve(b)),
          at(-bottom, b, curve(b)),
          at(-bottom, a, curve(a)),
        ],
        material,
      );
    }
    canvas.sphere(add(middle, scale(facing, 0.6)), 1.8, (q) =>
      Math.hypot(...local(q.p)) > 1.4 ? tone(GOLD, q.light) : metal(STEEL)(q),
    );
    return;
  }
  // Escudos de punta abajo: el de cometa largo y angosto, el heráldico y el templario.
  const kite = kind === 'kite-shield';
  const templar = kind === 'templar-shield';
  const width = kite ? 7 : 8;
  const top = 9;
  const bottom = kite ? 16.5 : 14.5;
  const half = (h: number): number =>
    h > 0 ? width : width * Math.cos((-h / bottom) * (Math.PI / 2)) ** (kite ? 1 : 0.8);
  // El contorno empieza en la punta: el abanico de triángulos queda adentro.
  const rim: Vec3[] = [at(-bottom, 0)];
  for (let i = 11; i >= 0; i--) {
    const h = top - (i * (top + bottom)) / 12;
    rim.push(at(h, half(h)));
  }
  for (let i = 0; i <= 11; i++) {
    const h = top - (i * (top + bottom)) / 12;
    rim.push(at(h, -half(h)));
  }
  canvas.polygon(rim, (q) => {
    const [w, h] = local(q.p);
    if (h > top - 0.8 || Math.abs(w) > half(h) - 0.8) return tone(STEEL, q.light);
    if (templar)
      return crossPattee(w, h - 1, 5.4) ? tone(CROSS_RED, q.light) : tone(color, q.light);
    if (kite) return Math.abs(w) < 0.6 ? tone(GOLD, q.light) : tone(color, q.light - 0.1);
    return w > 0 === h > 0 ? tone(color, q.light - 0.1) : tone(DARK_STEEL, q.light + 0.1);
  });
  if (kite) canvas.sphere(add(middle, scale(facing, 0.6)), 1.1, metal(GOLD));
}

/** Antorcha encendida o farol, en la mano izquierda. */
function drawLight(canvas: VolumeCanvas, rig: Rig, kind: ItemKind): void {
  const hand = rig.arms[-1].hand;
  const up = rig.chest.dir([0.1, 1, 0.5]);
  if (kind === 'torch') {
    const top = add(hand, scale(up, 7));
    canvas.limb(add(hand, scale(up, -2)), top, 0.6, 0.8, solid(WOOD));
    canvas.sphere(add(top, scale(up, 1)), 1.4, solid(ramp([60, 40, 28])));
    canvas.sphere(add(top, scale(up, 2.6)), 2.2, (s) =>
      tone(ramp([255, 190, 70]), 0.7 + s.light * 0.3),
    );
    canvas.sphere(add(top, scale(up, 4.4)), 1.3, (s) =>
      tone(ramp([255, 236, 150]), 0.8 + s.light * 0.2),
    );
    return;
  }
  // Farol colgando de la mano.
  const body = add(hand, [0, -3.4, 0]);
  canvas.limb(hand, add(body, [0, 2, 0]), 0.25, 0.25, metal(DARK_STEEL));
  canvas.ellipsoid(body, axesAlong([0, 1, 0]), [1.6, 2.2, 1.6], (s) =>
    Math.abs(s.p[1] - body[1]) > 1.6
      ? tone(DARK_STEEL, s.light)
      : tone(ramp([255, 214, 120]), 0.75 + s.light * 0.25),
  );
}

/** Hachas grandes en la mano: largo del mango y tamaño de la hoja. */
const HEAVY_AXES: Partial<
  Record<ItemKind, { haft: number; reach: number; height: number; double: boolean }>
> = {
  'double-axe': { haft: 12, reach: 3.8, height: 2.8, double: true },
  'battle-axe': { haft: 13, reach: 4.6, height: 3.6, double: false },
  'two-handed-axe': { haft: 17, reach: 4.8, height: 3.8, double: false },
  'large-battle-axe': { haft: 17, reach: 4.8, height: 4, double: true },
};

function drawWeapon(canvas: VolumeCanvas, rig: Rig, kind: ItemKind): void {
  const { hand, weaponDir: dir } = rig.arms[1];
  const across = cross(dir, [0, 1, 0]);
  const side = Math.hypot(...across) < 0.2 ? rig.chest.dir([1, 0, 0]) : normalize(across);
  const along = (k: number): Vec3 => add(hand, scale(dir, k));
  const grip = solid(ramp([84, 56, 34]));

  const heavyAxe = HEAVY_AXES[kind];
  if (heavyAxe) {
    // Hachas de guerra: mango (largo en las de dos manos) y una o dos hojas.
    const { haft, reach, height, double } = heavyAxe;
    canvas.limb(along(haft > 14 ? -6 : -3), along(haft), 0.75, 0.75, solid(WOOD));
    const up = normalize(cross(side, dir));
    const head = along(haft - 1.5);
    for (const k of double ? [1, -1] : [1])
      canvas.polygon(
        [
          add(head, scale(up, 2.2)),
          add(add(head, scale(side, reach * k)), scale(up, height)),
          add(add(head, scale(side, reach * k)), scale(up, -height)),
          add(head, scale(up, -2.2)),
        ],
        metal(STEEL),
      );
    // La hacha de batalla lleva un pico corto atrás.
    if (kind === 'battle-axe')
      canvas.limb(head, add(head, scale(side, -3)), 0.8, 0.2, metal(DARK_STEEL));
    return;
  }
  if (kind === 'bardiche') {
    // Asta larga con una hoja alargada atada a lo largo.
    canvas.limb(along(-9), along(18), 0.6, 0.6, solid(WOOD));
    canvas.polygon(
      [along(10), along(17.5), add(along(19), scale(side, 3.2)), add(along(12), scale(side, 3.8))],
      metal(STEEL),
    );
    return;
  }
  if (kind === 'war-fork' || kind === 'short-spear') {
    const fork = kind === 'war-fork';
    const end = fork ? 16 : 12;
    canvas.limb(along(fork ? -8 : -5), along(end), 0.6, 0.6, solid(WOOD));
    if (fork) {
      // Dos púas paralelas sobre un travesaño.
      canvas.limb(
        add(along(end), scale(side, -1.4)),
        add(along(end), scale(side, 1.4)),
        0.5,
        0.5,
        metal(DARK_STEEL),
      );
      for (const k of [1, -1])
        canvas.limb(
          add(along(end), scale(side, 1.2 * k)),
          add(along(end + 5), scale(side, 1.2 * k)),
          0.45,
          0.15,
          metal(STEEL),
        );
    } else {
      canvas.polygon(
        [
          along(end),
          add(along(end + 1.6), scale(side, 1.2)),
          along(end + 5),
          add(along(end + 1.6), scale(side, -1.2)),
        ],
        metal(STEEL),
      );
    }
    return;
  }
  if (kind === 'hammer-pick') {
    // Martillo de un lado y pico curvo del otro.
    canvas.limb(along(-3), along(12), 0.7, 0.7, solid(WOOD));
    const head = along(12.4);
    const up = normalize(cross(side, dir));
    canvas.limb(
      add(head, scale(side, -0.6)),
      add(head, scale(side, 2.6)),
      1.5,
      1.5,
      metal(DARK_STEEL),
    );
    canvas.limb(
      add(head, scale(side, -0.6)),
      add(add(head, scale(side, -4.4)), scale(up, -1.4)),
      1,
      0.15,
      metal(STEEL),
    );
    return;
  }
  if (kind === 'crossbow' || kind === 'heavy-crossbow') {
    // Caja de madera apuntando adelante, arco de acero cruzado y cuerda.
    const size = kind === 'heavy-crossbow' ? 1.25 : 1;
    canvas.limb(along(-4), along(9 * size), 0.9, 0.8, solid(WOOD));
    const prod = along(8 * size);
    const back = along(5 * size);
    for (const k of [1, -1]) {
      const tip = add(add(prod, scale(side, 5 * size * k)), scale(dir, -1.6 * size));
      canvas.limb(prod, tip, 0.6, 0.4, metal(STEEL));
      canvas.limb(tip, back, 0.15, 0.15, solid(ramp([226, 220, 200])));
    }
    canvas.limb(along(0.5), along(-1.5), 0.3, 0.3, metal(DARK_STEEL));
    return;
  }

  if (kind === 'axe' || kind === 'pickaxe' || kind === 'war-axe') {
    canvas.limb(along(-3), along(12), 0.75, 0.75, solid(WOOD));
    const up = normalize(cross(side, dir));
    if (kind === 'war-axe') {
      // Hoja doble, una a cada lado del mango.
      const head = along(10.5);
      for (const k of [1, -1])
        canvas.polygon(
          [
            add(head, scale(side, 0.5 * k)),
            add(head, scale(up, 2.4)),
            add(add(head, scale(side, 4 * k)), scale(up, 3.2)),
            add(add(head, scale(side, 4 * k)), scale(up, -3.2)),
            add(head, scale(up, -2.4)),
          ],
          metal(STEEL),
        );
    } else if (kind === 'axe') {
      const head = along(10.5);
      canvas.polygon(
        [
          add(head, scale(side, 0.5)),
          add(head, scale(up, 2.6)),
          add(add(head, scale(side, 4.4)), scale(up, 3.4)),
          add(add(head, scale(side, 4.4)), scale(up, -2.6)),
          add(head, scale(up, -1.8)),
        ],
        metal(STEEL),
      );
    } else {
      const head = along(11.5);
      canvas.limb(add(head, scale(side, -4.2)), add(head, scale(up, 1.2)), 0.5, 0.9, metal(STEEL));
      canvas.limb(add(head, scale(up, 1.2)), add(head, scale(side, 4.2)), 0.9, 0.5, metal(STEEL));
    }
    return;
  }

  const up = normalize(cross(side, dir));
  if (kind === 'spear' || kind === 'halberd') {
    // Asta larga que sale por detrás de la mano y punta en forma de hoja.
    canvas.limb(along(-10), along(22), 0.6, 0.6, solid(WOOD));
    const tip = along(22);
    canvas.polygon(
      [tip, add(along(24), scale(side, 1.3)), along(28), add(along(24), scale(side, -1.3))],
      metal(STEEL),
    );
    // La alabarda suma una hoja de hacha bajo la punta y un gancho atrás.
    if (kind === 'halberd') {
      canvas.polygon(
        [
          along(17.5),
          along(22),
          add(along(22.6), scale(side, 4.4)),
          add(along(17), scale(side, 4)),
        ],
        metal(STEEL),
      );
      canvas.polygon([along(19), along(21), add(along(19.6), scale(side, -2.4))], metal(STEEL));
    }
    return;
  }
  if (kind === 'quarterstaff') {
    canvas.limb(along(-14), along(14), 0.65, 0.65, solid(WOOD));
    return;
  }
  if (kind === 'club') {
    canvas.limb(along(-2), along(10), 0.7, 1.6, solid(WOOD));
    return;
  }
  if (kind === 'mace' || kind === 'war-hammer') {
    const hammer = kind === 'war-hammer';
    const length = hammer ? 15 : 9;
    canvas.limb(along(hammer ? -5 : -2), along(length), 0.7, 0.7, hammer ? solid(WOOD) : grip);
    const head = along(length + 0.6);
    if (hammer) {
      canvas.limb(
        add(head, scale(side, -3)),
        add(head, scale(side, 2.4)),
        1.8,
        1.8,
        metal(DARK_STEEL),
      );
      canvas.limb(add(head, scale(side, 2.4)), add(head, scale(side, 4)), 1.2, 0.6, metal(STEEL));
    } else {
      canvas.sphere(head, 2.1, metal(DARK_STEEL));
      for (const d of [side, scale(side, -1), up, scale(up, -1), dir]) {
        canvas.limb(add(head, scale(d, 1.6)), add(head, scale(d, 3)), 0.6, 0.15, metal(STEEL));
      }
    }
    return;
  }

  if (kind === 'flail') {
    // Mango con zunchos y tres cadenas que cuelgan (o vuelan con el golpe) hasta las bolas con púas.
    canvas.limb(along(-2.5), along(7), 0.7, 0.75, solid(WOOD));
    for (const k of [-1.6, 3.2, 6.6])
      canvas.limb(along(k - 0.4), along(k + 0.4), 0.9, 0.9, metal(DARK_STEEL));
    const top = along(7.6);
    const fall = normalize(add(scale(dir, 0.7), [0, -1, 0]));
    for (const [k, spread] of [
      [1, -1.3],
      [1.15, 0],
      [0.9, 1.3],
    ] as const) {
      const ball = add(add(top, scale(fall, 4.6 * k)), scale(side, spread));
      for (let i = 0; i < 4; i++)
        canvas.sphere(lerp(top, ball, (i + 0.5) / 4.6), 0.38, metal(STEEL));
      canvas.sphere(ball, 1.05, metal(DARK_STEEL));
      for (const d of [side, scale(side, -1), up, scale(up, -1), fall])
        canvas.limb(add(ball, scale(d, 0.8)), add(ball, scale(d, 1.8)), 0.4, 0.1, metal(STEEL));
    }
    return;
  }

  const blades: Partial<Record<ItemKind, { length: number; width: number; guard: number }>> = {
    dagger: { length: 6, width: 0.85, guard: 2.4 },
    kryss: { length: 11, width: 0.6, guard: 1.8 },
    broadsword: { length: 15, width: 1.15, guard: 3 },
    katana: { length: 14, width: 0.7, guard: 0 },
    longsword: { length: 17, width: 1, guard: 3 },
    scimitar: { length: 13, width: 1.1, guard: 2.2 },
    cutlass: { length: 10, width: 1.3, guard: 1.6 },
    'viking-sword': { length: 13, width: 1.25, guard: 2.2 },
  };
  const { length, width, guard } = blades[kind] ?? { length: 13, width: 0.85, guard: 2.4 };
  const katana = kind === 'katana';
  if (kind === 'scimitar' || kind === 'cutlass') {
    // Hoja curva que se ensancha antes de la punta.
    canvas.limb(along(-2), along(1.2), 0.8, 0.8, grip);
    canvas.limb(
      add(along(1.6), scale(side, -guard)),
      add(along(1.6), scale(side, guard)),
      0.6,
      0.6,
      metal(GOLD),
    );
    const mid = add(along(2 + length * 0.6), scale(up, 1));
    canvas.limb(along(2), mid, width * 0.8, width * 1.2, metal(STEEL));
    canvas.limb(mid, add(along(2 + length), scale(up, 3)), width * 1.2, 0.25, metal(STEEL));
    return;
  }
  if (katana) return drawKatana(canvas, along, dir, up);
  canvas.limb(along(-2), along(1.2), 0.8, 0.8, grip);
  canvas.sphere(along(-2.4), 0.9, metal(GOLD));
  canvas.limb(
    add(along(1.6), scale(side, -guard)),
    add(along(1.6), scale(side, guard)),
    0.6,
    0.6,
    metal(GOLD),
  );
  canvas.limb(along(2), along(2 + length), width, 0.35, metal(STEEL));
}

/**
 * Katana en la mano: el mango largo envuelto en rombos, la guarda de hierro
 * con borde dorado y la hoja curva hacia el lomo, con el filo templado claro.
 */
function drawKatana(canvas: VolumeCanvas, along: (k: number) => Vec3, dir: Vec3, up: Vec3): void {
  const side = normalize(cross(dir, up));
  canvas.limb(along(-4.6), along(0.6), 0.8, 0.78, (q) => {
    const a = sub(q.p, along(0));
    const u = a[0] * dir[0] + a[1] * dir[1] + a[2] * dir[2];
    const v =
      a[0] * side[0] +
      a[1] * side[1] +
      a[2] * side[2] +
      (a[0] * up[0] + a[1] * up[1] + a[2] * up[2]);
    const x = ((((u + v) * 0.9) % 1) + 1) % 1;
    const y = ((((u - v) * 0.9) % 1) + 1) % 1;
    return x > 0.3 && x < 0.7 && y > 0.3 && y < 0.7
      ? tone(LINEN, q.light)
      : tone(ramp([40, 40, 60]), q.light);
  });
  canvas.ellipsoid(along(-4.8), axesAlong(dir), [0.9, 0.5, 0.9], metal(DARK_STEEL));
  canvas.ellipsoid(along(0.9), axesAlong(dir), [2, 0.35, 2], (q) =>
    Math.hypot(...sub(q.p, along(0.9))) > 1.6 ? tone(GOLD, q.light) : tone(DARK_STEEL, q.light),
  );
  canvas.limb(along(1.2), along(2), 0.75, 0.7, metal(GOLD));
  const length = 15;
  const sag = 1.4;
  const center = (t: number): Vec3 => add(along(2 + length * t), scale(up, sag * t * t));
  const width = (t: number): number => 1.05 - 0.3 * t;
  const blade: Material = (q) => {
    const rel = sub(q.p, along(2));
    const t = Math.max(
      0,
      Math.min(1, (rel[0] * dir[0] + rel[1] * dir[1] + rel[2] * dir[2]) / length),
    );
    const d = sub(q.p, center(t));
    const across = (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / width(t);
    if (across < -0.4 + 0.08 * Math.sin(t * 40)) return tone(ramp([226, 230, 236]), q.light + 0.15);
    return across > 0.15 ? tone(DARK_STEEL, q.light) : metal(STEEL)(q);
  };
  for (let i = 0; i < 10; i++) {
    const a = i / 10;
    const b = (i + 1) / 10;
    const edge = (t: number): number => {
      const k = t < 0.88 ? 0 : (t - 0.88) / 0.12;
      return -0.72 * width(t) * (1 - k * k) + 0.25 * width(t) * k * k;
    };
    canvas.polygon(
      [
        add(center(a), scale(up, 0.28 * width(a))),
        add(center(b), scale(up, 0.28 * width(b))),
        add(center(b), scale(up, edge(b))),
        add(center(a), scale(up, edge(a))),
      ],
      blade,
    );
  }
}

/**
 * Arco en la mano izquierda: colgando junto a la pierna o, al disparar,
 * de pie al frente con la cuerda tensa hasta la mano derecha.
 */
function drawBow(canvas: VolumeCanvas, rig: Rig): void {
  const { hand, weaponDir } = rig.arms[-1];
  const forward = rig.chest.dir([0, 0, 1]);
  const lateral = rig.chest.dir([1, 0, 0]);
  const hanging = Math.abs(weaponDir[1]) > 0.7;
  const axis = hanging ? normalize(weaponDir) : normalize(cross(weaponDir, lateral));
  const toward = sub(
    forward,
    scale(axis, forward[0] * axis[0] + forward[1] * axis[1] + forward[2] * axis[2]),
  );
  const bulge = Math.hypot(...toward) < 0.1 ? weaponDir : normalize(toward);
  const point = (t: number): Vec3 =>
    add(add(hand, scale(axis, t * 9)), scale(bulge, 2.6 * (1 - t * t)));
  const wood = solid(ramp([110, 70, 38]));
  for (let i = 0; i < 8; i++) {
    const a = -1 + i / 4;
    const b = -1 + (i + 1) / 4;
    canvas.limb(
      point(a),
      point(b),
      0.6,
      0.6,
      i === 3 || i === 4 ? solid(ramp([70, 46, 28])) : wood,
    );
  }
  const string = solid(ramp([226, 220, 200]));
  const top = point(-1);
  const bottom = point(1);
  if (rig.drawing) {
    const pull = rig.arms[1].hand;
    canvas.limb(top, pull, 0.2, 0.2, string);
    canvas.limb(pull, bottom, 0.2, 0.2, string);
    // La flecha apoyada, de la cuerda al arco.
    canvas.limb(pull, add(hand, scale(normalize(sub(hand, pull)), 3)), 0.3, 0.3, solid(WOOD));
  } else {
    canvas.limb(top, bottom, 0.2, 0.2, string);
  }
}

// ── Esqueleto (la criatura) ─────────────────────────────────────────

/** Esqueleto: huesos finos, costillas con huecos, calavera y una espada. */
export function drawSkeletonFrame(
  direction: Direction,
  frame: CharacterFrame,
  canvasFor: CanvasFactory = spriteCanvas,
): PixelImage {
  const canvas = canvasFor(CHARACTER_ART_WIDTH, CHARACTER_ART_HEIGHT, cameraFor(direction));
  const rig = humanoidRig(frame, true);
  const bone = solid(BONE);

  for (const side of [1, -1] as const) {
    const leg = rig.legs[side];
    canvas.limb(leg.hip, leg.knee, 1.3, 1.1, bone);
    canvas.sphere(leg.knee, 1.6, bone);
    canvas.limb(leg.knee, leg.ankle, 1.1, 1, bone);
    canvas.ellipsoid(
      lerp(leg.ankle, leg.toe, 0.5),
      axesAlong(sub(leg.toe, leg.ankle)),
      [1.6, 1, 3],
      bone,
    );
    const arm = rig.arms[side];
    canvas.limb(arm.shoulder, arm.elbow, 1.1, 1, bone);
    canvas.sphere(arm.elbow, 1.3, bone);
    canvas.limb(arm.elbow, arm.hand, 1, 0.9, bone);
    canvas.sphere(arm.hand, 1.4, bone);
    canvas.sphere(arm.shoulder, 1.8, bone);
  }
  // Pelvis, columna y costillas (bandas con huecos).
  const chest = rig.chest;
  canvas.ellipsoid(rig.pelvis.origin, rig.pelvis.axes, [4.6, 2.4, 2.8], bone);
  canvas.limb(rig.pelvis.origin, rig.neck, 1.2, 1.1, solid(BONE, -1));
  canvas.ellipsoid(
    chest.origin,
    chest.axes,
    [5.8, 5.6, 3.6],
    clipping((s) => {
      const y = chest.local(s.p)[1];
      const x = chest.local(s.p)[0];
      return ((y + 20) % 2.6 < 1.25 || Math.abs(x) < 0.8) && y > -4.5 ? tone(BONE, s.light) : null;
    }),
  );
  canvas.ellipsoid(chest.at([0, 4.6, 0]), chest.axes, [6.8, 1.2, 2.6], bone);
  canvas.limb(rig.neck, rig.head.at([0, -3, 0]), 1.1, 1, bone);
  drawSkullHead(canvas, rig.head, BONE);

  drawWeapon(canvas, rig, 'short-sword');
  return canvas.toImage(OUTLINE);
}
