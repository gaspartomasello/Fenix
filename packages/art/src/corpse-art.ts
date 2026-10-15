import { isMountKind, type CreatureKind, type Direction } from '@fenix/shared';
import { drawCreatureFrame } from './creature-art';
import type { PixelImage } from './pixel-art';
import { VolumeCanvas, add, pitch, roll, type Projection, type Vec3 } from './volume';

/**
 * Cuerpos muertos: cada criatura queda tirada en el piso con su propio
 * modelo, el mismo de cuando estaba viva, girado entero. Los que andan en
 * dos patas caen de espaldas, los de cuatro de costado, la araña queda
 * panza arriba y el dragón se desploma sobre la panza, con las alas caídas.
 * Como se gira el modelo (no la imagen), la luz, las sombras y el contorno
 * siguen siendo los del mundo; lo que queda bajo el suelo no se pinta.
 */

/** Cómo cae cada cuerpo: de espaldas (gira hacia atrás) o de costado (gira de lado). */
type Fall = 'back' | 'side';

interface CorpsePose {
  readonly fall: Fall;
  /** Cuánto gira al caer (radianes; π/2 = acostado del todo, π = patas arriba). */
  readonly angle: number;
  /** Altura (en el modelo) del centro del cuerpo: sobre ese punto gira al caer. */
  readonly center: number;
  /** Qué tan alto queda ese centro una vez en el piso (medio grosor del cuerpo). */
  readonly rest: number;
}

/** Lienzo del cuerpo y dónde queda el punto del suelo (el centro del tile). */
export interface CorpseLayout {
  readonly width: number;
  readonly height: number;
  readonly groundX: number;
  readonly groundY: number;
}

const HUMANOID_LAYOUT: CorpseLayout = { width: 96, height: 64, groundX: 48, groundY: 40 };
const BEAST_LAYOUT: CorpseLayout = { width: 80, height: 56, groundX: 40, groundY: 36 };
const MOUNT_LAYOUT: CorpseLayout = { width: 136, height: 88, groundX: 68, groundY: 54 };
const DRAGON_LAYOUT: CorpseLayout = { width: 168, height: 112, groundX: 84, groundY: 68 };

const BACK = Math.PI / 2;
const SIDE = Math.PI / 2;

const POSES: Readonly<Partial<Record<CreatureKind, CorpsePose>>> = {
  rat: { fall: 'side', angle: SIDE, center: 5, rest: 2.6 },
  wolf: { fall: 'side', angle: SIDE, center: 12, rest: 3.6 },
  skeleton: { fall: 'back', angle: BACK, center: 30, rest: 2.6 },
  'giant-spider': { fall: 'side', angle: Math.PI, center: 8, rest: 5 },
  orc: { fall: 'back', angle: BACK, center: 30, rest: 4 },
  troll: { fall: 'back', angle: BACK, center: 30, rest: 4.5 },
  'skeleton-mage': { fall: 'back', angle: BACK, center: 30, rest: 3 },
  lich: { fall: 'back', angle: BACK, center: 30, rest: 4 },
  // Desplomado sobre la panza, apenas volcado: las patas quedan bajo el cuerpo.
  dragon: { fall: 'side', angle: 0.3, center: 22, rest: 9 },
  daemon: { fall: 'back', angle: BACK, center: 30, rest: 4.5 },
  'earth-elemental': { fall: 'back', angle: BACK, center: 30, rest: 5 },
};
/** Las monturas (caballos, llamas, lagartos): de costado, con las patas estiradas. */
const MOUNT_POSE: CorpsePose = { fall: 'side', angle: SIDE, center: 26, rest: 6 };

function poseOf(kind: CreatureKind): CorpsePose | null {
  if (isMountKind(kind)) return MOUNT_POSE;
  return POSES[kind] ?? null;
}

/**
 * ¿Deja cuerpo? Los espíritus invocados (vórtice y elementales de aire, fuego
 * y agua) no tienen carne: se desvanecen al morir.
 */
export function leavesCorpse(kind: CreatureKind): boolean {
  return poseOf(kind) !== null;
}

export function corpseLayout(kind: CreatureKind): CorpseLayout {
  if (isMountKind(kind)) return MOUNT_LAYOUT;
  if (kind === 'dragon') return DRAGON_LAYOUT;
  if (kind === 'rat' || kind === 'wolf' || kind === 'giant-spider') return BEAST_LAYOUT;
  return HUMANOID_LAYOUT;
}

/**
 * El cuerpo de una criatura tirado en el piso. `fallen` va de 0 (todavía de
 * pie) a 1 (en el piso): con valores intermedios sale el cuadro de la caída.
 */
export function drawCreatureCorpse(
  kind: CreatureKind,
  direction: Direction,
  fallen = 1,
): PixelImage {
  const pose = poseOf(kind) ?? { fall: 'back', angle: BACK, center: 30, rest: 4 };
  const layout = corpseLayout(kind);
  const t = Math.max(0, Math.min(1, fallen));
  return drawCreatureFrame(kind, direction, 'dead', (_width, _height, camera) => {
    const angle = t * pose.angle;
    const turn = (v: Vec3): Vec3 => (pose.fall === 'back' ? pitch(v, -angle) : roll(v, angle));
    const height = pose.center + (pose.rest - pose.center) * t;
    const shift = add(turn([0, -pose.center, 0]), [0, height, 0]);
    const projection = new PosedProjection(camera, turn, shift, [
      layout.groundX - camera.originX,
      layout.groundY - camera.originY,
    ]);
    // Lo que queda bajo el suelo (patas debajo del cuerpo) no se ve.
    const aboveGround = (p: Vec3): boolean => turn(p)[1] + shift[1] > -0.5;
    return new VolumeCanvas(layout.width, layout.height, projection, aboveGround);
  });
}

/**
 * Una proyección con el modelo girado y corrido: `point(p)` es la de la
 * cámara aplicada a `turn(p) + shift`, más un corrimiento en la imagen (el
 * lienzo del cuerpo tiene otro tamaño que el de la criatura de pie).
 */
class PosedProjection implements Projection {
  /** Filas de la rotación, para aplicar la inversa (la transpuesta). */
  private readonly rows: readonly [Vec3, Vec3, Vec3];

  constructor(
    private readonly base: Projection,
    private readonly turn: (v: Vec3) => Vec3,
    private readonly shift: Vec3,
    private readonly image: readonly [number, number],
  ) {
    const cx = turn([1, 0, 0]);
    const cy = turn([0, 1, 0]);
    const cz = turn([0, 0, 1]);
    this.rows = [
      [cx[0], cy[0], cz[0]],
      [cx[1], cy[1], cz[1]],
      [cx[2], cy[2], cz[2]],
    ];
  }

  get zoom(): number {
    return this.base.zoom;
  }

  /** La rotación inversa: la transpuesta. */
  private back(v: Vec3): Vec3 {
    const [r0, r1, r2] = this.rows;
    return [
      r0[0] * v[0] + r1[0] * v[1] + r2[0] * v[2],
      r0[1] * v[0] + r1[1] * v[1] + r2[1] * v[2],
      r0[2] * v[0] + r1[2] * v[1] + r2[2] * v[2],
    ];
  }

  point(p: Vec3): Vec3 {
    const q = this.base.point(add(this.turn(p), this.shift));
    return [q[0] + this.image[0], q[1] + this.image[1], q[2]];
  }

  forward(v: Vec3): Vec3 {
    return this.base.forward(this.turn(v));
  }

  /** Con una rotación, el dual se compone igual que la proyección. */
  dual(v: Vec3): Vec3 {
    return this.base.dual(this.turn(v));
  }

  modelNormal(gradient: Vec3): Vec3 {
    return this.back(this.base.modelNormal(gradient));
  }

  unproject(x: number, y: number, z: number): Vec3 {
    const q = this.base.unproject(x - this.image[0], y - this.image[1], z);
    return this.back([q[0] - this.shift[0], q[1] - this.shift[1], q[2] - this.shift[2]]);
  }

  get viewDir(): Vec3 {
    return this.back(this.base.viewDir);
  }

  get lightDir(): Vec3 {
    return this.back(this.base.lightDir);
  }
}
