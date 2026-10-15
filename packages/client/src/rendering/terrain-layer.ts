import type { TileMap } from '@fenix/shared';
import { Container, Rectangle, Sprite } from 'pixi.js';
import { ART_SCALE, TILE_HALF, tileToScreen } from './iso';
import type { TextureCache } from './texture-cache';

export const CHUNK_SIZE = 16;

interface Chunk {
  readonly cx: number;
  readonly cy: number;
  readonly bounds: Rectangle;
  container: Container | null;
}

/**
 * Dibuja el terreno en bloques de 16×16 tiles. Cada bloque se arma recién
 * cuando entra en pantalla y se oculta cuando sale, así el costo no crece con
 * el tamaño del mapa (el continente tiene más de cien mil tiles).
 */
export class TerrainLayer {
  readonly container = new Container({ sortableChildren: true });
  private readonly chunks: Chunk[] = [];

  constructor(
    private readonly map: TileMap,
    private readonly textures: TextureCache,
  ) {
    for (let cy = 0; cy < map.height; cy += CHUNK_SIZE) {
      for (let cx = 0; cx < map.width; cx += CHUNK_SIZE) {
        const right = Math.min(cx + CHUNK_SIZE, map.width) - 1;
        const bottom = Math.min(cy + CHUNK_SIZE, map.height) - 1;
        // El rombo del bloque: de la esquina izquierda (cx, bottom) a la derecha (right, cy).
        const minX = (cx - bottom) * TILE_HALF - TILE_HALF;
        const maxX = (right - cy) * TILE_HALF + TILE_HALF;
        const minY = (cx + cy) * TILE_HALF - TILE_HALF;
        const maxY = (right + bottom) * TILE_HALF + TILE_HALF;
        this.chunks.push({
          cx,
          cy,
          bounds: new Rectangle(minX, minY, maxX - minX, maxY - minY),
          container: null,
        });
      }
    }
  }

  /** Muestra solo los bloques que se cruzan con el rectángulo visible (y los arma si hace falta). */
  cull(view: Rectangle): void {
    for (const chunk of this.chunks) {
      const visible = chunk.bounds.intersects(view);
      if (visible && !chunk.container) chunk.container = this.buildChunk(chunk.cx, chunk.cy);
      if (chunk.container) chunk.container.visible = visible;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private buildChunk(cx: number, cy: number): Container {
    const { map, textures } = this;
    const chunk = new Container();
    for (let y = cy; y < Math.min(cy + CHUNK_SIZE, map.height); y++) {
      for (let x = cx; x < Math.min(cx + CHUNK_SIZE, map.width); x++) {
        const terrain = map.terrainAt({ x, y });
        if (terrain === undefined) continue;
        const neighbors = {
          north: map.terrainAt({ x, y: y - 1 }),
          east: map.terrainAt({ x: x + 1, y }),
          south: map.terrainAt({ x, y: y + 1 }),
          west: map.terrainAt({ x: x - 1, y }),
        };
        const sprite = new Sprite(textures.terrain(terrain, variantFor(x, y), neighbors));
        const center = tileToScreen({ x, y });
        sprite.anchor.set(0.5);
        sprite.scale.set(ART_SCALE);
        sprite.position.set(center.x, center.y);
        chunk.addChild(sprite);
      }
    }
    // Los bloques se dibujan en orden de profundidad (de atrás hacia adelante).
    chunk.zIndex = cx + cy;
    this.container.addChild(chunk);
    return chunk;
  }
}

/** Variante estable por tile, para romper la repetición del terreno. */
export function variantFor(x: number, y: number): number {
  const h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  return (h >>> 0) % 997;
}
