import { STATIC_ART_HEIGHT, STATIC_ART_WIDTH, STATIC_GROUND } from '@fenix/art';
import { STATICS, type StaticPlacement, type TileMap } from '@fenix/shared';
import { Rectangle, Sprite, type Container } from 'pixi.js';
import type { FractionalPosition } from '../core/entity';
import { staticDepth } from './depth';
import { ART_SCALE, TILE_HALF, depthOf, tileToScreen } from './iso';
import type { TextureCache } from './texture-cache';
import { CHUNK_SIZE, variantFor } from './terrain-layer';

/** Objetos que pueden tapar al personaje y se vuelven translúcidos. */
const OCCLUDER_ALPHA = 0.4;
const LOW_STATICS = new Set(['flowers', 'bush']);

/** Medidas del sprite en pantalla respecto de su punto de apoyo. */
const SPRITE_LEFT = STATIC_GROUND.x * ART_SCALE;
const SPRITE_RIGHT = (STATIC_ART_WIDTH - STATIC_GROUND.x) * ART_SCALE;
const SPRITE_TOP = STATIC_GROUND.y * ART_SCALE;
const SPRITE_BOTTOM = (STATIC_ART_HEIGHT - STATIC_GROUND.y) * ART_SCALE;

/** Caja del personaje en pantalla respecto de sus pies (para la transparencia). */
const CHARACTER_BOX = { left: 16, right: 16, top: 64 };

interface Chunk {
  readonly placements: readonly StaticPlacement[];
  readonly bounds: Rectangle;
  sprites: { sprite: Sprite; placement: StaticPlacement }[] | null;
}

/**
 * Objetos fijos del mapa. Comparten la capa ordenada con los personajes para
 * que el orden de dibujo sea correcto, pero solo se crean los sprites de los
 * bloques visibles.
 */
export class StaticLayer {
  private readonly chunks: Chunk[] = [];

  constructor(
    map: TileMap,
    private readonly textures: TextureCache,
    private readonly target: Container,
  ) {
    const byChunk = new Map<string, StaticPlacement[]>();
    for (const placement of map.statics) {
      const key = `${Math.floor(placement.x / CHUNK_SIZE)},${Math.floor(placement.y / CHUNK_SIZE)}`;
      let list = byChunk.get(key);
      if (!list) byChunk.set(key, (list = []));
      list.push(placement);
    }
    for (const placements of byChunk.values()) {
      this.chunks.push({ placements, bounds: boundsOf(placements), sprites: null });
    }
  }

  /** Crea o destruye sprites según lo visible y aplica transparencia cerca de `focus`. */
  update(view: Rectangle, focus: FractionalPosition): void {
    for (const chunk of this.chunks) {
      const visible = chunk.bounds.intersects(view);
      if (visible && !chunk.sprites) this.show(chunk);
      if (!visible && chunk.sprites) this.hide(chunk);
    }
    this.fadeOccluders(focus);
  }

  /** Objetos visibles que emiten luz, con su radio en tiles. */
  *visibleLights(): Generator<{ placement: StaticPlacement; radius: number }> {
    for (const chunk of this.chunks) {
      if (!chunk.sprites) continue;
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
      const sprite = new Sprite(
        this.textures.static(placement.kind, variantFor(placement.x, placement.y)),
      );
      const screen = tileToScreen(placement);
      sprite.anchor.set(STATIC_GROUND.x / STATIC_ART_WIDTH, STATIC_GROUND.y / STATIC_ART_HEIGHT);
      sprite.scale.set(ART_SCALE);
      sprite.position.set(screen.x, screen.y);
      sprite.zIndex = staticDepth(placement);
      this.target.addChild(sprite);
      return { sprite, placement };
    });
  }

  private hide(chunk: Chunk): void {
    chunk.sprites?.forEach(({ sprite }) => sprite.destroy());
    chunk.sprites = null;
  }

  /** Lo que está delante del personaje y se superpone con él se vuelve translúcido. */
  private fadeOccluders(focus: FractionalPosition): void {
    const self = tileToScreen(focus);
    const selfDepth = depthOf(focus);
    for (const chunk of this.chunks) {
      if (!chunk.sprites) continue;
      for (const { sprite, placement } of chunk.sprites) {
        if (LOW_STATICS.has(placement.kind)) continue;
        const depth = depthOf(placement);
        let alpha = 1;
        if (depth > selfDepth && depth - selfDepth <= 6) {
          const s = tileToScreen(placement);
          const overlaps =
            s.x - SPRITE_LEFT < self.x + CHARACTER_BOX.right &&
            s.x + SPRITE_RIGHT > self.x - CHARACTER_BOX.left &&
            s.y - SPRITE_TOP < self.y &&
            s.y + SPRITE_BOTTOM > self.y - CHARACTER_BOX.top;
          if (overlaps) alpha = OCCLUDER_ALPHA;
        }
        sprite.alpha = alpha;
      }
    }
  }
}

function boundsOf(placements: readonly StaticPlacement[]): Rectangle {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of placements) {
    const s = tileToScreen(p);
    minX = Math.min(minX, s.x - SPRITE_LEFT);
    maxX = Math.max(maxX, s.x + SPRITE_RIGHT);
    minY = Math.min(minY, s.y - SPRITE_TOP);
    maxY = Math.max(maxY, s.y + SPRITE_BOTTOM + TILE_HALF);
  }
  return new Rectangle(minX, minY, maxX - minX, maxY - minY);
}
