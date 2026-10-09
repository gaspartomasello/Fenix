import {
  ITEMS,
  type Appearance,
  type Direction,
  type EquipmentLook,
  type ItemKind,
  type MountKind,
  type NpcRole,
} from '@fenix/shared';
import { GOLD, STEEL, drawHumanHead, drawSkullHead } from './humanoid-head';
import {
  BUILDS,
  CHARACTER_ART_HEIGHT,
  CHARACTER_ART_WIDTH,
  cameraFor,
  heldInLeftHand,
  humanoidRig,
  spriteCanvas,
  type CharacterFrame,
  type Rig,
} from './humanoid-rig';
import { MOUNTED_ART_HEIGHT, MOUNTED_ART_WIDTH, drawMount, mountedCamera } from './mount-art';
import { hexToRgb, type PixelImage, type Rgb } from './pixel-art';
import type { VolumeCanvas } from './volume';
import {
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
  yaw,
  type Material,
  type Ramp,
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
  humanoidRig,
  type ActionKind,
  type ActionStep,
  type CharacterFrame,
  type WalkStep,
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
const DARK_STEEL = ramp([96, 102, 114]);

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
      equipment.torso === 'robe'
        ? (wornColor('robe') ?? [58, 42, 106])
        : hexToRgb(appearance.clothHue),
    ),
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
  stablemaster: 'apron',
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
  /** Túnica hasta el suelo (la maga, o una túnica puesta). */
  readonly robed: boolean;
  /** Armadura de metal en el torso (cota de malla o peto de placas). */
  readonly metalTorso: boolean;
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
  mount: MountKind | null = null,
): PixelImage {
  // Montado: lienzo más grande, la montura primero y el jinete sentado en ella.
  const canvas = mount
    ? spriteCanvas(MOUNTED_ART_WIDTH, MOUNTED_ART_HEIGHT, mountedCamera(direction))
    : spriteCanvas(CHARACTER_ART_WIDTH, CHARACTER_ART_HEIGHT, cameraFor(direction));
  const ride = mount ? drawMount(canvas, mount, frame) : null;
  const female = appearance.gender === 'female';
  const outfit = role ? OUTFITS[role] : null;
  const robed = outfit === 'robe' || equipment.torso === 'robe';
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
    skirt: female && !equipment.legs && !robed,
    robed,
    metalTorso: equipment.torso === 'chainmail' || equipment.torso === 'plate-chest',
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
  { rig, palette: p, female, skirt, robed, equipment }: Figure,
): void {
  const thick = female ? 0.9 : 1;
  const plate = equipment.legs === 'plate-legs';
  const leather = equipment.legs === 'leather-leggings';
  for (const side of [1, -1] as const) {
    const leg = rig.legs[side];
    // Pantalón (o piernas, bajo la pollera) hasta la caña de la bota; bota con borde claro.
    // Las grebas de placas son de metal con rodillera; las perneras, cuero con costuras.
    const legMaterial: Material = (s) => {
      // La bota llega hasta 6 px sobre el tobillo (de pie o montado).
      const bootTop = leg.ankle[1] + 6;
      if (s.p[1] < bootTop && !(plate && !equipment.feet))
        return tone(p.boots, s.light, s.p[1] > bootTop - 1 ? 1 : 0);
      if (plate) {
        const nearKnee = Math.hypot(...sub(s.p, leg.knee)) < 2.6;
        return nearKnee ? tone(STEEL, s.light + 0.2, 1) : metal(STEEL)(s);
      }
      if (leather && Math.round(s.p[1]) % 5 === 0) return tone(p.pants, s.light, -1);
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

function torsoMaterial({ rig, palette: p, equipment, outfit, female, robed }: Figure): Material {
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
    // Cinturón con hebilla.
    if (y > -0.6 && y < 1.8 && !robed) {
      if (front && Math.abs(local[0]) < 1.3) return tone(GOLD, s.light);
      return tone(p.belt, s.light);
    }
    if (armor === 'plate-chest' && y > -4) {
      // Peto de placas: láminas horizontales con borde claro y una cresta al centro.
      const band = ((y + 20) % 3.4) / 3.4;
      if (front && Math.abs(local[0]) < 0.5) return tone(STEEL, s.light + 0.25, 1);
      if (band < 0.12) return tone(STEEL, s.light - 0.25, -1);
      return metal(STEEL)(s);
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
  const { rig, palette: p, equipment, outfit, female, skirt, robed, metalTorso } = figure;
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
  // Caja torácica amplia y, arriba, el pecho que se ensancha hacia los hombros.
  canvas.ellipsoid(
    chest.at([0, 0.4, 0]),
    chest.axes,
    female ? [5.3, 6.2, 3.6] : [6.2, 6.7, 4.1],
    material,
  );
  canvas.ellipsoid(
    chest.at([0, 2.9, 0.4]),
    chest.axes,
    female ? [5.6, 3, 3.4] : [6.6, 3.3, 3.9],
    material,
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
  if (female && !metalTorso) {
    for (const side of [1, -1] as const) {
      canvas.sphere(chest.at([side * 2.1, 0.8, 2.4]), 2.2, material);
    }
  }
  // Faldón de la camisa debajo del cinturón.
  if (!robed && !skirt && !metalTorso) {
    canvas.ellipsoid(pelvis.at([0, -2.2, 0]), pelvis.axes, [5.5, 2.6, 3.7], solid(p.cloth, -1));
  }
  const torso = equipment.torso;
  if (torso && torso !== 'robe') {
    // Hombreras: más grandes en el peto de placas.
    const pad = metalTorso ? metal(STEEL) : solid(ramp(wornColor(torso) ?? [122, 78, 42]), 1);
    const big = torso === 'plate-chest' ? 1.2 : 1;
    for (const side of [1, -1] as const) {
      canvas.ellipsoid(
        add(rig.arms[side].shoulder, chest.dir([side * 0.4, 0.8, 0])),
        chest.axes,
        scale(female ? [2.8, 2.1, 2.9] : [3.2, 2.4, 3.3], big),
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
  { rig, palette: p, outfit, female, metalTorso }: Figure,
): void {
  const sleeve: Material = metalTorso
    ? metal(STEEL)
    : outfit === 'vest'
      ? solid(LINEN)
      : solid(p.cloth);
  // Herrero y tabernero trabajan con las mangas arremangadas.
  const bareForearms = outfit === 'apron' || outfit === 'innkeeper';
  const thin = female ? 0.85 : 1;
  for (const side of [1, -1] as const) {
    const arm = rig.arms[side];
    canvas.limb(arm.shoulder, arm.elbow, 2.75 * thin, 2.1 * thin, sleeve);
    canvas.limb(arm.elbow, arm.hand, 2.1 * thin, 1.8 * thin, bareForearms ? solid(p.skin) : sleeve);
    canvas.sphere(arm.hand, 1.8 * thin, solid(p.skin));
  }
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

  const up = normalize(cross(side, dir));
  if (kind === 'spear') {
    // Asta larga que sale por detrás de la mano y punta en forma de hoja.
    canvas.limb(along(-9), along(18), 0.6, 0.6, solid(WOOD));
    const tip = along(18);
    canvas.polygon(
      [tip, add(along(20), scale(side, 1.3)), along(24), add(along(20), scale(side, -1.3))],
      metal(STEEL),
    );
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

  const blades: Partial<Record<ItemKind, { length: number; width: number; guard: number }>> = {
    dagger: { length: 6, width: 0.85, guard: 2.4 },
    kryss: { length: 11, width: 0.6, guard: 1.8 },
    broadsword: { length: 15, width: 1.15, guard: 3 },
    katana: { length: 14, width: 0.7, guard: 0 },
  };
  const { length, width, guard } = blades[kind] ?? { length: 13, width: 0.85, guard: 2.4 };
  const katana = kind === 'katana';
  canvas.limb(along(katana ? -3.6 : -2), along(1.2), 0.8, 0.8, grip);
  if (!katana) canvas.sphere(along(-2.4), 0.9, metal(GOLD));
  if (katana) {
    // Guarda redonda y hoja apenas curva.
    canvas.ellipsoid(along(1.5), axesAlong(dir), [1.8, 0.35, 1.8], metal(GOLD));
    const mid = add(along(2 + length / 2), scale(up, 0.6));
    canvas.limb(along(2), mid, width, width * 0.8, metal(STEEL));
    canvas.limb(mid, add(along(2 + length), scale(up, 1.6)), width * 0.8, 0.25, metal(STEEL));
    return;
  }
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

const BONE = ramp([226, 218, 196]);

/** Esqueleto: huesos finos, costillas con huecos, calavera y una espada. */
export function drawSkeletonFrame(direction: Direction, frame: CharacterFrame): PixelImage {
  const canvas = spriteCanvas(CHARACTER_ART_WIDTH, CHARACTER_ART_HEIGHT, cameraFor(direction));
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
