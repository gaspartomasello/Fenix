import type { TileMap } from '@fenix/shared';
import { Container, Rectangle, Sprite } from 'pixi.js';
import { ART_SCALE, TILE_HALF, tileToScreen } from './iso';
import type { TextureCache } from './texture-cache';

export const CHUNK_SIZE = 16;

/**
 * Dibuja el terreno en bloques de 16×16 tiles y oculta los que quedan fuera
 * de la cámara, para que el costo no crezca con el tamaño del mapa.
 */
export class TerrainLayer {
  readonly container = new Container();
  private readonly chunks: { container: Container; bounds: Rectangle }[] = [];

  constructor(map: TileMap, textures: TextureCache) {
    for (let cy = 0; cy < map.height; cy += CHUNK_SIZE) {
      for (let cx = 0; cx < map.width; cx += CHUNK_SIZE) {
        this.buildChunk(map, textures, cx, cy);
      }
    }
  }

  /** Muestra solo los bloques que se cruzan con el rectángulo visible. */
  cull(view: Rectangle): void {
    for (const chunk of this.chunks) {
      chunk.container.visible = chunk.bounds.intersects(view);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private buildChunk(map: TileMap, textures: TextureCache, cx: number, cy: number): void {
    const chunk = new Container();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

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
        minX = Math.min(minX, center.x - TILE_HALF);
        minY = Math.min(minY, center.y - TILE_HALF);
        maxX = Math.max(maxX, center.x + TILE_HALF);
        maxY = Math.max(maxY, center.y + TILE_HALF);
      }
    }
    this.container.addChild(chunk);
    this.chunks.push({
      container: chunk,
      bounds: new Rectangle(minX, minY, maxX - minX, maxY - minY),
    });
  }
}

/** Variante estable por tile, para romper la repetición del terreno. */
export function variantFor(x: number, y: number): number {
  const h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  return (h >>> 0) % 997;
}
