import type { TerrainNeighbors } from '@fenix/art';
import type { Terrain, TileMap } from '@fenix/shared';
import { Container, MeshSimple, Rectangle, Sprite } from 'pixi.js';
import type { Ground } from './ground';
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
  /**
   * Grupo de dibujo propio: Pixi rearma la lista de dibujo de un grupo cada
   * vez que algo cambia de orden (los personajes al caminar), y así el
   * terreno no entra en ese trabajo.
   */
  readonly container = new Container({ sortableChildren: true, isRenderGroup: true });
  private readonly chunks: Chunk[] = [];

  constructor(
    private readonly map: TileMap,
    private readonly textures: TextureCache,
    private readonly ground: Ground,
  ) {
    for (let cy = 0; cy < map.height; cy += CHUNK_SIZE) {
      for (let cx = 0; cx < map.width; cx += CHUNK_SIZE) {
        const right = Math.min(cx + CHUNK_SIZE, map.width) - 1;
        const bottom = Math.min(cy + CHUNK_SIZE, map.height) - 1;
        // El rombo del bloque: de la esquina izquierda (cx, bottom) a la derecha (right, cy).
        const minX = (cx - bottom) * TILE_HALF - TILE_HALF;
        const maxX = (right - cy) * TILE_HALF + TILE_HALF;
        // Arriba, lugar para las lomas más altas.
        const minY = (cx + cy) * TILE_HALF - TILE_HALF - HIGHEST_LIFT;
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

  /**
   * Muestra solo los bloques que se cruzan con el rectángulo visible. Los que
   * están cerca (dentro de `near`) se preparan de antemano y de a uno por
   * cuadro: primero se dibujan sus texturas entre cuadro y cuadro y después
   * se arma el bloque, así al caminar no hay tirones cuando entra uno nuevo.
   */
  cull(view: Rectangle, near: Rectangle = view): void {
    let next: Chunk | null = null;
    for (const chunk of this.chunks) {
      const visible = chunk.bounds.intersects(view);
      if (visible && !chunk.container) chunk.container = this.buildChunk(chunk.cx, chunk.cy);
      if (chunk.container) chunk.container.visible = visible;
      else if (!next && chunk.bounds.intersects(near)) next = chunk;
    }
    if (next && this.prepareChunk(next.cx, next.cy)) {
      next.container = this.buildChunk(next.cx, next.cy);
      next.container.visible = false;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  /**
   * Sombra de la ladera en un tile, con la pendiente medida en un área de
   * unos tiles (así pasa de un tile al otro sin escalones).
   */
  private shade(x: number, y: number): number {
    const g = this.ground;
    const towardX =
      (g.lift({ x: x + 1.5, y }) - g.lift({ x: x - 1.5, y })) / 3 +
      (g.lift({ x: x + 1.5, y: y + 1 }) - g.lift({ x: x - 1.5, y: y + 1 })) / 6 +
      (g.lift({ x: x + 1.5, y: y - 1 }) - g.lift({ x: x - 1.5, y: y - 1 })) / 6;
    const towardY =
      (g.lift({ x, y: y + 1.5 }) - g.lift({ x, y: y - 1.5 })) / 3 +
      (g.lift({ x: x + 1, y: y + 1.5 }) - g.lift({ x: x + 1, y: y - 1.5 })) / 6 +
      (g.lift({ x: x - 1, y: y + 1.5 }) - g.lift({ x: x - 1, y: y - 1.5 })) / 6;
    return slopeShade(towardX / 1.33, towardY / 1.33);
  }

  /** Pide las texturas de un bloque; devuelve si ya están todas dibujadas. */
  private prepareChunk(cx: number, cy: number): boolean {
    let ready = true;
    this.eachTile(cx, cy, (x, y, terrain, neighbors) => {
      if (!this.textures.prepareTerrain(terrain, variantFor(x, y), neighbors)) ready = false;
    });
    return ready;
  }

  private eachTile(
    cx: number,
    cy: number,
    visit: (x: number, y: number, terrain: Terrain, neighbors: TerrainNeighbors) => void,
  ): void {
    const { map } = this;
    for (let y = cy; y < Math.min(cy + CHUNK_SIZE, map.height); y++) {
      for (let x = cx; x < Math.min(cx + CHUNK_SIZE, map.width); x++) {
        const terrain = map.terrainAt({ x, y });
        if (terrain === undefined) continue;
        visit(x, y, terrain, {
          north: map.terrainAt({ x, y: y - 1 }),
          east: map.terrainAt({ x: x + 1, y }),
          south: map.terrainAt({ x, y: y + 1 }),
          west: map.terrainAt({ x: x - 1, y }),
        });
      }
    }
  }

  private buildChunk(cx: number, cy: number): Container {
    const chunk = new Container();
    this.eachTile(cx, cy, (x, y, terrain, neighbors) => {
      const texture = this.textures.terrain(terrain, variantFor(x, y), neighbors);
      const center = tileToScreen({ x, y });
      // Las cuatro esquinas del rombo, cada una a su altura.
      const top = this.ground.corner(x, y);
      const right = this.ground.corner(x + 1, y);
      const bottom = this.ground.corner(x + 1, y + 1);
      const left = this.ground.corner(x, y + 1);
      if (top === right && right === bottom && bottom === left) {
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.scale.set(ART_SCALE);
        sprite.position.set(center.x, center.y - top);
        sprite.tint = this.shade(x, y);
        chunk.addChild(sprite);
        return;
      }
      // En una ladera el rombo se deforma (dos triángulos) y se sombrea según
      // hacia dónde mira: la luz viene de arriba a la izquierda.
      const h = TILE_HALF * ART_SCALE;
      const mesh = new MeshSimple({
        texture,
        vertices: new Float32Array([
          center.x,
          center.y - h - top,
          center.x + h,
          center.y - right,
          center.x,
          center.y + h - bottom,
          center.x - h,
          center.y - left,
        ]),
        uvs: new Float32Array([0.5, 0, 1, 0.5, 0.5, 1, 0, 0.5]),
        indices: new Uint32Array([0, 1, 3, 1, 2, 3]),
      });
      mesh.autoUpdate = false;
      mesh.tint = this.shade(x, y);
      chunk.addChild(mesh);
    });
    // Los bloques se dibujan en orden de profundidad (de atrás hacia adelante).
    chunk.zIndex = cx + cy;
    this.container.addChild(chunk);
    return chunk;
  }
}

/** Margen arriba de cada bloque para las lomas más altas (pixeles). */
const HIGHEST_LIFT = 170;

/**
 * Sombra de una ladera (como color de tinte), según cuántos pixeles sube el
 * suelo por tile en cada eje del mapa. La luz llega desde -x (arriba a la
 * izquierda en pantalla): lo que sube hacia +x queda de frente al sol y lo
 * que baja, en sombra.
 */
export function slopeShade(towardX: number, towardY: number): number {
  const light = Math.max(0.6, Math.min(1, 1 + (towardX * 0.9 + towardY * 0.45) * 0.075));
  const c = Math.round(light * 255);
  return (c << 16) | (c << 8) | c;
}

/** Variante estable por tile, para romper la repetición del terreno. */
export function variantFor(x: number, y: number): number {
  const h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  return (h >>> 0) % 997;
}
