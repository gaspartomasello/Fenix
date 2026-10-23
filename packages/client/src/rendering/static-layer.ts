import { INVISIBLE_STATICS, staticFrame } from '@fenix/art';
import {
  DOORS,
  STATICS,
  type Position,
  type StaticKind,
  type StaticPlacement,
  type TileMap,
} from '@fenix/shared';
import { Rectangle, Sprite, type Container } from 'pixi.js';
import type { FractionalPosition } from '../core/entity';
import { projectedDepth, staticDepth } from './depth';
import type { Ground } from './ground';
import { ART_SCALE, TILE_HALF } from './iso';
import type { TextureCache } from './texture-cache';
import { CHUNK_SIZE, variantFor } from './terrain-layer';

/** Objetos que pueden tapar al personaje y se vuelven translúcidos. */
const OCCLUDER_ALPHA = 0.4;
const LOW_STATICS = new Set([
  'flowers',
  'bush',
  'tall-grass',
  'weeds',
  'fern',
  'mushrooms',
  'wildflowers',
  'peyote',
  'dry-shrub',
  'pebbles',
  'jungle-plant',
  'tundra-shrub',
  'fallen-column',
]);

/** Medidas del sprite en pantalla respecto de su punto de apoyo. */
function extent(kind: StaticKind): { left: number; right: number; top: number; bottom: number } {
  const frame = staticFrame(kind);
  return {
    left: frame.ground.x * ART_SCALE,
    right: (frame.width - frame.ground.x) * ART_SCALE,
    top: frame.ground.y * ART_SCALE,
    bottom: (frame.height - frame.ground.y) * ART_SCALE,
  };
}

/** Punto de apoyo: el centro de la base (un objeto de 2 × 2 se apoya entre sus cuatro tiles). */
function footing(placement: StaticPlacement): FractionalPosition {
  const half = (STATICS[placement.kind].footprint - 1) / 2;
  return { x: placement.x + half, y: placement.y + half };
}

/** El tile de más adelante de la base: ahí se ordena el dibujo. */
function front(placement: StaticPlacement): FractionalPosition {
  const last = STATICS[placement.kind].footprint - 1;
  return { x: placement.x + last, y: placement.y + last };
}

/** Caja del personaje en pantalla respecto de sus pies (para la transparencia). */
const CHARACTER_BOX = { left: 16, right: 16, top: 64 };

interface Chunk {
  readonly placements: readonly StaticPlacement[];
  readonly bounds: Rectangle;
  sprites: { sprite: Sprite; placement: StaticPlacement }[] | null;
  visible: boolean;
}

/**
 * Objetos fijos del mapa. Comparten la capa ordenada con los personajes para
 * que el orden de dibujo sea correcto, pero solo se crean los sprites de los
 * bloques visibles.
 */
export class StaticLayer {
  private readonly chunks: Chunk[] = [];

  constructor(
    private readonly map: TileMap,
    private readonly textures: TextureCache,
    private readonly target: Container,
    private readonly ground: Ground,
  ) {
    const byChunk = new Map<string, StaticPlacement[]>();
    for (const placement of map.statics) {
      if (INVISIBLE_STATICS.has(placement.kind)) continue;
      // Por bloques según dónde se ven (los pisos altos, encima de su edificio).
      const seen = map.displayOf(placement);
      const key = `${Math.floor(seen.x / CHUNK_SIZE)},${Math.floor(seen.y / CHUNK_SIZE)}`;
      let list = byChunk.get(key);
      if (!list) byChunk.set(key, (list = []));
      list.push(placement);
    }
    for (const placements of byChunk.values()) {
      this.chunks.push({
        placements,
        bounds: boundsOf(placements, ground),
        sprites: null,
        visible: false,
      });
    }
  }

  /**
   * Crea, oculta o destruye sprites según lo visible y vuelve translúcido lo
   * que tapa a alguno de `focuses` (uno mismo primero y quienes estén cerca).
   * Los bloques cercanos (dentro de `near`) se preparan de antemano, de a uno
   * por cuadro; los que salen de la pantalla se ocultan y recién se destruyen
   * lejos (fuera de `far`), así ir y volver no rearma nada.
   */
  update(
    view: Rectangle,
    focuses: readonly FractionalPosition[],
    near: Rectangle = view,
    far: Rectangle = near,
  ): void {
    let next: Chunk | null = null;
    for (const chunk of this.chunks) {
      const visible = chunk.bounds.intersects(view);
      if (visible && !chunk.sprites) this.show(chunk);
      if (!chunk.sprites) {
        if (!next && chunk.bounds.intersects(near)) next = chunk;
        continue;
      }
      if (!visible && !chunk.bounds.intersects(far)) {
        this.hide(chunk);
        continue;
      }
      if (chunk.visible !== visible) this.setVisible(chunk, visible);
    }
    if (next && this.prepare(next)) {
      this.show(next);
      this.setVisible(next, false);
    }
    this.fadeOccluders(focuses);
  }

  /** Pide las texturas de un bloque; devuelve si ya están todas dibujadas. */
  private prepare(chunk: Chunk): boolean {
    let ready = true;
    for (const placement of chunk.placements) {
      const kind = this.map.isDoorOpen(placement) ? DOORS[placement.kind] : undefined;
      if (
        !this.textures.prepareStatic(kind ?? placement.kind, variantFor(placement.x, placement.y))
      )
        ready = false;
    }
    return ready;
  }

  private setVisible(chunk: Chunk, visible: boolean): void {
    chunk.visible = visible;
    for (const { sprite } of chunk.sprites ?? []) sprite.visible = visible;
  }

  /** Objetos visibles que emiten luz, con su radio en tiles. */
  *visibleLights(): Generator<{ placement: StaticPlacement; radius: number }> {
    for (const chunk of this.chunks) {
      if (!chunk.visible) continue;
      for (const placement of chunk.placements) {
        const radius = STATICS[placement.kind].lightRadius;
        if (radius > 0) yield { placement, radius };
      }
    }
  }

  destroy(): void {
    this.chunks.forEach((chunk) => this.hide(chunk));
  }

  private show(chunk: Chunk): void {
    chunk.sprites = chunk.placements.map((placement) => {
      const sprite = new Sprite(this.textureOf(placement));
      const screen = this.ground.toScreen(footing(placement));
      const frame = staticFrame(placement.kind);
      sprite.anchor.set(frame.ground.x / frame.width, frame.ground.y / frame.height);
      sprite.scale.set(ART_SCALE);
      sprite.position.set(screen.x, screen.y);
      sprite.zIndex = staticDepth(front(placement));
      this.target.addChild(sprite);
      return { sprite, placement };
    });
    chunk.visible = true;
  }

  /** La textura de un objeto: las puertas abiertas se ven abiertas. */
  private textureOf(placement: StaticPlacement) {
    const open = this.map.isDoorOpen(placement) ? DOORS[placement.kind] : undefined;
    return this.textures.static(open ?? placement.kind, variantFor(placement.x, placement.y));
  }

  /** Una puerta cambió: si se ve, se le cambia el dibujo. */
  refreshDoor(position: Position): void {
    for (const chunk of this.chunks)
      for (const entry of chunk.sprites ?? [])
        if (entry.placement.x === position.x && entry.placement.y === position.y)
          entry.sprite.texture = this.textureOf(entry.placement);
  }

  private hide(chunk: Chunk): void {
    chunk.sprites?.forEach(({ sprite }) => sprite.destroy());
    chunk.sprites = null;
    chunk.visible = false;
  }

  /** Lo que está delante del personaje y se superpone con él se vuelve translúcido. */
  private fadeOccluders(focuses: readonly FractionalPosition[]): void {
    const boxes = focuses.map((f) => ({
      screen: this.ground.toScreen(f),
      depth: projectedDepth(f),
    }));
    for (const chunk of this.chunks) {
      if (!chunk.sprites || !chunk.visible) continue;
      for (const { sprite, placement } of chunk.sprites) {
        // Lo de los pisos de arriba del edificio donde está uno no se ve.
        sprite.visible = !this.ground.hidden(placement);
        if (!sprite.visible || LOW_STATICS.has(placement.kind)) continue;
        const depth = projectedDepth(front(placement));
        const s = this.ground.toScreen(footing(placement));
        const e = extent(placement.kind);
        const hides = boxes.some(
          (box) =>
            depth > box.depth &&
            depth - box.depth <= 6 &&
            s.x - e.left < box.screen.x + CHARACTER_BOX.right &&
            s.x + e.right > box.screen.x - CHARACTER_BOX.left &&
            s.y - e.top < box.screen.y &&
            s.y + e.bottom > box.screen.y - CHARACTER_BOX.top,
        );
        sprite.alpha = hides ? OCCLUDER_ALPHA : 1;
      }
    }
  }
}

function boundsOf(placements: readonly StaticPlacement[], ground: Ground): Rectangle {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of placements) {
    const s = ground.toScreen(footing(p));
    const e = extent(p.kind);
    minX = Math.min(minX, s.x - e.left);
    maxX = Math.max(maxX, s.x + e.right);
    minY = Math.min(minY, s.y - e.top);
    maxY = Math.max(maxY, s.y + e.bottom + TILE_HALF);
  }
  return new Rectangle(minX, minY, maxX - minX, maxY - minY);
}
