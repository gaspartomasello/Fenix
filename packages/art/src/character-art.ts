import {
  ITEMS,
  type Appearance,
  type Direction,
  type EquipmentLook,
  type ItemKind,
  type NpcRole,
} from '@fenix/shared';
import { GOLD, STEEL, drawHumanHead, drawSkullHead } from './humanoid-head';
import {
  BUILDS,
  CHARACTER_ART_HEIGHT,
  CHARACTER_ART_WIDTH,
  cameraFor,
  humanoidRig,
  type Basis,
  type CharacterFrame,
  type Rig,
} from './humanoid-rig';
import { hexToRgb, type PixelImage, type Rgb } from './pixel-art';
import {
  VolumeCanvas,
  add,
  axesAlong,
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
  type Material,
  type Ramp,
  type Vec3,
} from './volume';

export {
  ACTION_KINDS,
  CHARACTER_ART_HEIGHT,
  CHARACTER_ART_WIDTH,
  CHARACTER_FEET_Y,
  CHARACTER_HEAD_Y,
  WALK_FRAMES,
  attackStyleFor,
  cameraFor,
  humanoidRig,
  type ActionKind,
  type ActionStep,
  type CharacterFrame,
} from './humanoid-rig';

/** Color del contorno de todos los sprites. */
export const OUTLINE: Rgb = [24, 17, 14];

// ── Colores ─────────────────────────────────────────────────────────

/** Color de un objeto puesto, si tiene. */
function wornColor(kind: ItemKind | undefined): Rgb | null {
  const color = kind ? ITEMS[kind].color : undefined;
  return color === undefined ? null : hexToRgb(color);
}

const WOOD = ramp([118, 78, 44]);
const LEATHER_DARK = ramp([92, 60, 36]);
const LINEN = ramp([214, 206, 186]);

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
    cloth: ramp(hexToRgb(appearance.clothHue)),
    hair: ramp(hexToRgb(appearance.hairHue)),
    pants: ramp(wornColor(equipment.legs) ?? [78, 62, 46]),
    boots: ramp(wornColor(equipment.feet) ?? [52, 38, 28]),
    belt: ramp([70, 48, 30]),
  };
}

/** Ropa de trabajo de los personajes del pueblo. */
type Outfit = 'apron' | 'robe' | 'innkeeper' | 'vest';
const OUTFITS: Readonly<Record<NpcRole, Outfit>> = {
  blacksmith: 'apron',
  mage: 'robe',
  innkeeper: 'innkeeper',
  banker: 'vest',
};

/** Todo lo que define cómo se ve el cuerpo en un frame. */
interface Figure {
  readonly rig: Rig;
  readonly palette: Palette;
  readonly equipment: EquipmentLook;
  readonly outfit: Outfit | null;
  readonly female: boolean;
  /** Pollera hasta la rodilla (mujeres sin pantalón puesto). */
  readonly skirt: boolean;
}

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
): PixelImage {
  const canvas = new VolumeCanvas(CHARACTER_ART_WIDTH, CHARACTER_ART_HEIGHT, cameraFor(direction));
  const female = appearance.gender === 'female';
  const outfit = role ? OUTFITS[role] : null;
  const figure: Figure = {
    rig: humanoidRig(frame, equipment.rightHand !== undefined, BUILDS[female ? 'female' : 'male']),
    palette: paletteFor(appearance, equipment),
    equipment,
    outfit,
    female,
    skirt: female && !equipment.legs && outfit !== 'robe',
  };

  drawLegs(canvas, figure);
  drawTorso(canvas, figure);
  drawArms(canvas, figure);
  const headgear = equipment.head;
  drawHumanHead(canvas, figure.rig.head, figure.rig.neck, {
    skin: figure.palette.skin,
    hair: figure.palette.hair,
    hairStyle: appearance.hairStyle ?? (female ? 'long' : 'short'),
    facialHair: female ? 'none' : (appearance.facialHair ?? 'none'),
    female,
    headgear:
      headgear === 'iron-helmet'
        ? 'helmet'
        : headgear
          ? 'cap'
          : outfit === 'robe'
            ? 'wizard'
            : null,
    capColor: ramp(wornColor(headgear) ?? [122, 78, 42]),
    hatColor: figure.palette.cloth,
  });
  if (equipment.cloak)
    drawCloak(canvas, figure.rig, ramp(wornColor(equipment.cloak) ?? [120, 30, 40]));
  if (equipment.leftHand) drawShield(canvas, figure.rig, equipment.leftHand);
  if (equipment.rightHand) drawWeapon(canvas, figure.rig, equipment.rightHand);
  return canvas.toImage(OUTLINE);
}

function drawLegs(canvas: VolumeCanvas, { rig, palette: p, outfit, female, skirt }: Figure): void {
  const thick = female ? 0.9 : 1;
  for (const side of [1, -1] as const) {
    const leg = rig.legs[side];
    // Pantalón (o piernas, bajo la pollera) hasta la caña de la bota; bota con borde claro.
    const legMaterial: Material = (s) => {
      if (s.p[1] < 9) return tone(p.boots, s.light, s.p[1] > 8 ? 1 : 0);
      return tone(skirt ? p.skin : p.pants, s.light, skirt ? -1 : 0);
    };
    canvas.limb(leg.hip, leg.knee, 3.3 * thick, 2.7 * thick, legMaterial);
    canvas.limb(leg.knee, leg.ankle, 2.7 * thick, 2.2 * thick, legMaterial);
    canvas.ellipsoid(
      lerp(leg.ankle, leg.toe, 0.55),
      axesAlong(sub(leg.toe, leg.ankle)),
      [2.3 * thick, 1.7, 3.5 * thick],
      solid(p.boots),
    );
  }
  if (outfit === 'robe' || skirt) {
    // Túnica hasta el suelo, o pollera hasta la rodilla: discos que se ensanchan.
    const bottom = outfit === 'robe' ? 2 : rig.legs[1].knee[1] - 1;
    const top = rig.pelvis.origin[1] + 1;
    const flare = outfit === 'robe' ? 3.2 : 2.2;
    const fabric: Material = (s) => tone(p.cloth, s.light, Math.sin(s.p[0] * 0.9) > 0.6 ? -1 : 0);
    // La tela sigue a las rodillas: se corre y se abre cuando las piernas se separan.
    const knees = lerp(rig.legs[1].knee, rig.legs[-1].knee, 0.5);
    const kneeGap = Math.abs(rig.legs[1].knee[2] - rig.legs[-1].knee[2]);
    for (let y = top; y >= bottom; y -= 1) {
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
      );
    }
  }
}

function torsoMaterial({ rig, palette: p, equipment, outfit, female }: Figure): Material {
  const armor = equipment.torso;
  const leather = armor === 'leather-armor' ? ramp(wornColor(armor) ?? [122, 78, 42]) : null;
  const chest = rig.chest;
  const beltY = rig.pelvis.origin[1];
  return (s) => {
    const local = chest.local(s.p);
    const n = chest.localDir(s.n);
    const y = s.p[1] - beltY;
    const front = n[2] > 0.35;
    // Cinturón con hebilla.
    if (y > -0.6 && y < 1.8 && outfit !== 'robe') {
      if (front && Math.abs(local[0]) < 1.3) return tone(GOLD, s.light);
      return tone(p.belt, s.light);
    }
    if (armor === 'chainmail' && y > -4) {
      // Malla: anillos alternados.
      const ring = (s.x + s.y * 2) % 3 === 0 ? -1 : (s.x + s.y) % 2 === 0 ? 1 : 0;
      return tone(STEEL, s.light, ring);
    }
    if (leather && y > 0) {
      // Pechera: costuras horizontales y remaches.
      if (Math.abs(((y + 0.5) % 4.5) - 0.5) < 0.45) return tone(leather, s.light, -1);
      if (front && Math.abs(Math.abs(local[0]) - 3) < 0.5 && Math.round(y) % 3 === 0)
        return tone(GOLD, s.light, 1);
      return tone(leather, s.light);
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
  const { rig, palette: p, equipment, outfit, female, skirt } = figure;
  const material = torsoMaterial(figure);
  const pelvis = rig.pelvis;
  const chest = rig.chest;
  // Cadera, cintura y pecho; en las mujeres, cadera más ancha, cintura fina y busto.
  canvas.ellipsoid(
    pelvis.at([0, 0.5, 0]),
    pelvis.axes,
    female ? [5.8, 4, 3.8] : [5.3, 3.8, 3.5],
    material,
  );
  canvas.ellipsoid(
    lerp(pelvis.at([0, 4.5, 0.1]), chest.at([0, -5, 0]), 0.3),
    chest.axes,
    female ? [4, 3.4, 2.9] : [4.9, 3.6, 3.2],
    material,
  );
  canvas.ellipsoid(chest.origin, chest.axes, female ? [5.4, 6, 3.5] : [5.9, 6.3, 3.8], material);
  if (female && equipment.torso !== 'chainmail') {
    for (const side of [1, -1] as const) {
      canvas.sphere(chest.at([side * 2.1, 0.8, 2.4]), 2.2, material);
    }
  }
  // Faldón de la camisa debajo del cinturón.
  if (outfit !== 'robe' && !skirt && equipment.torso !== 'chainmail') {
    canvas.ellipsoid(pelvis.at([0, -2.2, 0]), pelvis.axes, [5.5, 2.6, 3.7], solid(p.cloth, -1));
  }
  if (equipment.torso === 'leather-armor' || equipment.torso === 'chainmail') {
    // Hombreras.
    const pad =
      equipment.torso === 'chainmail'
        ? metal(STEEL)
        : solid(ramp(wornColor(equipment.torso) ?? [122, 78, 42]), 1);
    for (const side of [1, -1] as const) {
      canvas.ellipsoid(
        add(rig.arms[side].shoulder, chest.dir([side * 0.4, 0.8, 0])),
        chest.axes,
        female ? [2.8, 2.1, 2.9] : [3.2, 2.4, 3.3],
        pad,
      );
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

function drawArms(
  canvas: VolumeCanvas,
  { rig, palette: p, equipment, outfit, female }: Figure,
): void {
  const chainmail = equipment.torso === 'chainmail';
  const sleeve: Material = chainmail
    ? metal(STEEL)
    : outfit === 'vest'
      ? solid(LINEN)
      : solid(p.cloth);
  // Herrero y tabernero trabajan con las mangas arremangadas.
  const bareForearms = outfit === 'apron' || outfit === 'innkeeper';
  const thin = female ? 0.85 : 1;
  for (const side of [1, -1] as const) {
    const arm = rig.arms[side];
    canvas.limb(arm.shoulder, arm.elbow, 2.5 * thin, 2.1 * thin, sleeve);
    canvas.limb(arm.elbow, arm.hand, 2.1 * thin, 1.8 * thin, bareForearms ? solid(p.skin) : sleeve);
    canvas.sphere(arm.hand, 1.8 * thin, solid(p.skin));
  }
}

// ── Equipo ──────────────────────────────────────────────────────────

function drawCloak(canvas: VolumeCanvas, rig: Rig, cloak: Ramp): void {
  const chest: Basis = rig.chest;
  const sway = rig.sway;
  const folds: Material = (s) => tone(cloak, s.light * 0.9, Math.sin(s.p[0] * 1.3) > 0.55 ? -1 : 0);
  const shoulderY = rig.arms[1].shoulder[1] - chest.origin[1] + 1;
  canvas.polygon(
    [
      chest.at([-7.4, shoulderY, -2.8]),
      chest.at([7.4, shoulderY, -2.8]),
      [9.6, 9, -6 - sway],
      [-9.6, 9, -6 - sway],
    ],
    folds,
  );
  // Esclavina sobre los hombros y broche.
  canvas.ellipsoid(chest.at([0, shoulderY - 0.6, -0.4]), chest.axes, [8.2, 2.5, 4.6], solid(cloak));
  canvas.sphere(chest.at([0, shoulderY - 1.6, 4.1]), 1, metal(GOLD));
}

function drawShield(canvas: VolumeCanvas, rig: Rig, kind: ItemKind): void {
  const hand = rig.arms[-1].hand;
  const center = add(hand, rig.chest.dir([-1.6, 3, 1.2]));
  const facing = normalize(rig.chest.dir([-0.8, 0, 0.6]));
  const wood = ramp(wornColor(kind) ?? [138, 90, 46]);
  canvas.ellipsoid(center, axesAlong(facing), [5.4, 6, 0.9], (s) => {
    const d = Math.hypot(...sub(s.p, center));
    if (d > 4.7) return tone(STEEL, s.light);
    if (d < 1.4) return metal(GOLD)(s);
    const plank = Math.floor((s.p[1] - center[1]) * 0.55) % 2 === 0 ? 0 : -1;
    return tone(wood, s.light, plank);
  });
}

function drawWeapon(canvas: VolumeCanvas, rig: Rig, kind: ItemKind): void {
  const { hand, weaponDir: dir } = rig.arms[1];
  const across = cross(dir, [0, 1, 0]);
  const side = Math.hypot(...across) < 0.2 ? rig.chest.dir([1, 0, 0]) : normalize(across);
  const along = (k: number): Vec3 => add(hand, scale(dir, k));
  const grip = solid(ramp([84, 56, 34]));

  if (kind === 'axe' || kind === 'pickaxe') {
    canvas.limb(along(-3), along(12), 0.75, 0.75, solid(WOOD));
    const up = normalize(cross(side, dir));
    if (kind === 'axe') {
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

  const length = kind === 'dagger' ? 6 : 13;
  canvas.limb(along(-2), along(1.2), 0.8, 0.8, grip);
  canvas.sphere(along(-2.4), 0.9, metal(GOLD));
  canvas.limb(
    add(along(1.6), scale(side, -2.4)),
    add(along(1.6), scale(side, 2.4)),
    0.6,
    0.6,
    metal(GOLD),
  );
  canvas.limb(along(2), along(2 + length), 0.85, 0.35, metal(STEEL));
}

// ── Esqueleto (la criatura) ─────────────────────────────────────────

const BONE = ramp([226, 218, 196]);

/** Esqueleto: huesos finos, costillas con huecos, calavera y una espada. */
export function drawSkeletonFrame(direction: Direction, frame: CharacterFrame): PixelImage {
  const canvas = new VolumeCanvas(CHARACTER_ART_WIDTH, CHARACTER_ART_HEIGHT, cameraFor(direction));
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
  canvas.ellipsoid(chest.origin, chest.axes, [5.8, 5.6, 3.6], (s) => {
    const y = chest.local(s.p)[1];
    const x = chest.local(s.p)[0];
    return ((y + 20) % 2.6 < 1.25 || Math.abs(x) < 0.8) && y > -4.5 ? tone(BONE, s.light) : null;
  });
  canvas.ellipsoid(chest.at([0, 4.6, 0]), chest.axes, [6.8, 1.2, 2.6], bone);
  canvas.limb(rig.neck, rig.head.at([0, -3, 0]), 1.1, 1, bone);
  drawSkullHead(canvas, rig.head, BONE);

  drawWeapon(canvas, rig, 'short-sword');
  return canvas.toImage(OUTLINE);
}
