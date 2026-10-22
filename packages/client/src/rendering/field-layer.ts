import { drawFieldWall, FIELD_WALL_FRAME } from '@fenix/art';
import type { EntityId, GroundItemSnapshot, ItemKind, Position } from '@fenix/shared';
import { Container, Graphics, Sprite } from 'pixi.js';
import type { FractionalPosition } from '../core/entity';
import { staticDepth } from './depth';
import type { Ground } from './ground';
import { ART_SCALE, TILE_HALF } from './iso';
import { FIRE_COLORS, POISON_COLORS, hash, paletteAt } from './particles';
import type { TextureCache } from './texture-cache';

/** Colores de una llama, del centro más caliente a la punta que se apaga. */
interface Flame {
  readonly colors: readonly number[];
  /** Brillo del suelo alrededor. */
  readonly glow: number;
  /** Humo que sube por encima. */
  readonly smoke: number;
  /** Brasas del piso. */
  readonly coals: number;
}

const FIRE: Flame = {
  colors: FIRE_COLORS,
  glow: 0xff7a20,
  smoke: 0x3a3430,
  coals: 0x5a1a08,
};

/** El campo venenoso es el mismo fuego, pero verde. */
const POISON: Flame = {
  colors: POISON_COLORS,
  glow: 0x60e040,
  smoke: 0x2c3a26,
  coals: 0x1c3a10,
};

/** Campos que dibuja esta capa en vez del objeto quieto del suelo. */
const DRAWN: ReadonlySet<ItemKind> = new Set(['field-fire', 'field-poison', 'field-stone']);
/** Campos que mantienen su dibujo y además echan chispas. */
const SPARKLING: ReadonlySet<ItemKind> = new Set(['field-paralyze', 'field-energy']);

/** ¿Lo dibuja la capa de campos (y no la de objetos del suelo)? */
export function drawnAsField(kind: ItemKind): boolean {
  return DRAWN.has(kind);
}

type Axis = 'x' | 'y' | null;

interface FieldTile {
  readonly item: GroundItemSnapshot;
  readonly container: Container;
  /** Humo (se mezcla normal) y llamas (se suman a lo de abajo: brillan). */
  readonly back: Graphics;
  readonly front: Graphics;
  wall: Sprite | null;
  axis: Axis;
  /** Semilla propia, para que dos tiles no ardan igual. */
  readonly seed: number;
}

/**
 * Muros y campos mágicos: el fuego y el veneno son partículas que suben,
 * se achican y cambian de color (con humo y brasas), el muro de piedra es
 * un tramo de pared recto a lo largo de la hilera y los de parálisis y
 * energía echan chispas. Todo se calcula con el tiempo (sin guardar cada
 * partícula), así cuesta poco aunque haya varios campos.
 */
export class FieldLayer {
  private readonly tiles = new Map<EntityId, FieldTile>();

  constructor(
    private readonly textures: TextureCache,
    private readonly target: Container,
    private readonly ground: Ground,
  ) {}

  apply(added: readonly GroundItemSnapshot[], removed: readonly EntityId[]): void {
    let changed = false;
    for (const id of removed) changed = this.remove(id) || changed;
    for (const item of added) {
      if (!DRAWN.has(item.kind) && !SPARKLING.has(item.kind)) continue;
      this.remove(item.id);
      const container = new Container();
      const back = new Graphics();
      const front = new Graphics();
      front.blendMode = 'add';
      container.addChild(back, front);
      const screen = this.ground.toScreen(item.position);
      container.position.set(screen.x, screen.y);
      container.zIndex = staticDepth(item.position);
      this.target.addChild(container);
      this.tiles.set(item.id, {
        item,
        container,
        back,
        front,
        wall: null,
        axis: null,
        seed: hash(item.position.x, item.position.y, 1),
      });
      changed = true;
    }
    if (changed) this.orient();
  }

  /** Las fogatas del campo de fuego alumbran de noche. */
  *lights(): Iterable<{ at: FractionalPosition; radius: number }> {
    for (const tile of this.tiles.values())
      if (tile.item.kind === 'field-fire') yield { at: tile.item.position, radius: 2.5 };
  }

  update(now: number): void {
    for (const tile of this.tiles.values()) {
      const visible = !this.ground.hidden(tile.item.position);
      tile.container.visible = visible;
      if (!visible) continue;
      tile.back.clear();
      tile.front.clear();
      switch (tile.item.kind) {
        case 'field-fire':
          drawFlames(tile, now, FIRE);
          break;
        case 'field-poison':
          drawFlames(tile, now, POISON);
          break;
        case 'field-paralyze':
          drawMotes(tile, now);
          break;
        case 'field-energy':
          drawSparks(tile, now);
          break;
      }
    }
  }

  clear(): void {
    for (const id of [...this.tiles.keys()]) this.remove(id);
  }

  /**
   * Hacia dónde corre cada hilera (mirando los tiles vecinos del mismo
   * campo): las llamas se reparten a lo largo y el muro va recto.
   */
  private orient(): void {
    const at = new Map<string, ItemKind>();
    for (const tile of this.tiles.values()) at.set(key(tile.item.position), tile.item.kind);
    for (const tile of this.tiles.values()) {
      const { x, y } = tile.item.position;
      const same = (dx: number, dy: number): boolean =>
        at.get(key({ x: x + dx, y: y + dy })) === tile.item.kind;
      const axis: Axis = same(1, 0) || same(-1, 0) ? 'x' : same(0, 1) || same(0, -1) ? 'y' : null;
      tile.axis = axis;
      if (tile.item.kind === 'field-stone') this.placeWall(tile, axis ?? 'x');
    }
  }

  private placeWall(tile: FieldTile, axis: 'x' | 'y'): void {
    const along = axis === 'x' ? 0 : 2;
    const texture = this.textures.custom(`field-wall-${along}`, () => drawFieldWall(along));
    if (!tile.wall) {
      tile.wall = new Sprite(texture);
      tile.wall.anchor.set(
        FIELD_WALL_FRAME.ground.x / FIELD_WALL_FRAME.width,
        FIELD_WALL_FRAME.ground.y / FIELD_WALL_FRAME.height,
      );
      tile.wall.scale.set(ART_SCALE);
      tile.container.addChildAt(tile.wall, 0);
    } else tile.wall.texture = texture;
  }

  private remove(id: EntityId): boolean {
    const tile = this.tiles.get(id);
    if (!tile) return false;
    tile.container.destroy({ children: true });
    this.tiles.delete(id);
    return true;
  }
}

const key = (p: Position): string => `${p.x},${p.y}`;

/** Punto del tile a lo largo de la hilera (`u` de −0,5 a 0,5) más un corrimiento al costado. */
function along(axis: Axis, u: number, side: number): { x: number; y: number } {
  // En la vista isométrica, x avanza abajo a la derecha e y abajo a la izquierda.
  if (axis === 'x') return { x: u * TILE_HALF * 1.9 + side, y: u * TILE_HALF * 0.95 };
  if (axis === 'y') return { x: -u * TILE_HALF * 1.9 + side, y: u * TILE_HALF * 0.95 };
  return { x: u * TILE_HALF * 1.2 + side, y: side * 0.25 };
}

/**
 * Fuego (o veneno): lenguas de llama que nacen abajo, suben ondulando, se
 * achican y pasan del blanco al rojo oscuro; chispas que saltan más alto,
 * humo que sube despacio y un resplandor que tiembla en el suelo.
 */
function drawFlames(tile: FieldTile, now: number, flame: Flame): void {
  const { back, front, axis, seed } = tile;
  const flicker = 0.75 + 0.25 * Math.sin(now * 0.013 + seed * 40) * Math.sin(now * 0.021);
  // Resplandor y brasas en el suelo.
  for (let k = -1; k <= 1; k++) {
    const p = along(axis, k * 0.33, 0);
    back.ellipse(p.x, p.y, 11, 5).fill({ color: flame.coals, alpha: 0.55 });
  }
  front
    .ellipse(0, 0, TILE_HALF * 1.25, TILE_HALF * 0.6)
    .fill({ color: flame.glow, alpha: 0.18 * flicker });

  // Humo: sube por encima de las llamas, se abre y se desvanece.
  for (let i = 0; i < 6; i++) {
    const life = 2200 + hash(seed, i, 2) * 1400;
    const a = ((now + hash(seed, i, 3) * life * 5) % life) / life;
    const p = along(axis, hash(seed, i, 4) - 0.5, 0);
    const x = p.x + Math.sin(now * 0.0012 + i * 2) * 6 * a + a * 6;
    const y = p.y - 34 - a * 46;
    back
      .circle(x, y, 4 + a * 9)
      .fill({ color: flame.smoke, alpha: 0.22 * (1 - a) * Math.min(1, a * 4) });
  }

  // Lenguas de fuego.
  const count = 30;
  for (let i = 0; i < count; i++) {
    const life = 650 + hash(seed, i, 5) * 650;
    const a = ((now + hash(seed, i, 6) * life * 9) % life) / life;
    const u = (i / count - 0.5) * 0.9 + (hash(seed, i, 7) - 0.5) * 0.12;
    const p = along(axis, u, (hash(seed, i, 8) - 0.5) * 6);
    // Más altas en el medio de cada tile, como una hoguera alargada.
    const height = (24 + hash(seed, i, 9) * 26) * (1 - Math.abs(u) * 0.5);
    const sway = Math.sin(now * 0.007 + hash(seed, i, 10) * 30) * (2 + a * 4);
    const x = p.x + sway;
    const y = p.y - a * height;
    const radius = (4.5 + hash(seed, i, 11) * 3.5) * (1 - a * 0.8);
    const fade = Math.min(1, a / 0.08) * (1 - a) ** 0.7;
    front.circle(x, y, radius).fill({ color: paletteAt(flame.colors, a), alpha: 0.85 * fade });
    // Centro más claro en las recién nacidas.
    if (a < 0.35)
      front
        .circle(x, y + 1, radius * 0.5)
        .fill({ color: flame.colors[0] ?? 0xffffff, alpha: 0.6 * (1 - a / 0.35) });
  }

  // Chispas que saltan.
  for (let i = 0; i < 7; i++) {
    const life = 900 + hash(seed, i, 12) * 900;
    const a = ((now + hash(seed, i, 13) * life * 3) % life) / life;
    const p = along(axis, hash(seed, i, 14) - 0.5, 0);
    const x = p.x + Math.sin(a * 6 + i) * 7;
    const y = p.y - 18 - a * 52;
    front.circle(x, y, 1.3).fill({ color: flame.colors[1] ?? 0xffffff, alpha: (1 - a) * 0.95 });
  }
}

/** Campo paralizante: motas de luz helada que suben despacio y titilan. */
function drawMotes(tile: FieldTile, now: number): void {
  const { front, axis, seed } = tile;
  for (let i = 0; i < 14; i++) {
    const life = 1600 + hash(seed, i, 20) * 1200;
    const a = ((now + hash(seed, i, 21) * life * 4) % life) / life;
    const p = along(axis, hash(seed, i, 22) - 0.5, (hash(seed, i, 23) - 0.5) * 8);
    const twinkle = 0.5 + 0.5 * Math.sin(now * 0.02 + i * 3);
    front
      .circle(p.x, p.y - 4 - a * 34, 1.6 + twinkle)
      .fill({ color: 0xc8f4ff, alpha: 0.8 * (1 - a) * Math.min(1, a * 5) });
  }
}

/** Campo de energía: chispas que saltan y rayitos que cruzan la columna. */
function drawSparks(tile: FieldTile, now: number): void {
  const { front, axis, seed } = tile;
  for (let i = 0; i < 12; i++) {
    const life = 500 + hash(seed, i, 30) * 500;
    const a = ((now + hash(seed, i, 31) * life * 6) % life) / life;
    const p = along(axis, hash(seed, i, 32) - 0.5, 0);
    const angle = hash(seed, i, 33) * Math.PI * 2;
    front
      .circle(
        p.x + Math.cos(angle) * a * 10,
        p.y - 10 - hash(seed, i, 34) * 30 + Math.sin(angle) * a * 6,
        1.4,
      )
      .fill({ color: 0xe0ecff, alpha: 1 - a });
  }
  // Un rayito quebrado que aparece y desaparece.
  const beat = Math.floor(now / 120);
  if (hash(seed, beat, 35) > 0.55) {
    let x = (hash(seed, beat, 36) - 0.5) * 10;
    let y = -6;
    front.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (hash(seed, beat + k, 37) - 0.5) * 10;
      y -= 7;
      front.lineTo(x, y);
    }
    front.stroke({ color: 0xb0d0ff, width: 1.5, alpha: 0.9 });
  }
}
