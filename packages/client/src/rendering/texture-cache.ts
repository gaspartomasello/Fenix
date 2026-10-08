import {
  drawCharacterFrame,
  drawCreatureFrame,
  drawItem,
  drawStatic,
  drawTerrainTile,
  STATIC_VARIANTS,
  TERRAIN_VARIANTS,
  type CharacterFrame,
  type PixelImage,
  type TerrainNeighbors,
} from '@fenix/art';
import {
  EQUIPMENT_SLOTS,
  type Appearance,
  type CreatureKind,
  type Direction,
  type EquipmentLook,
  type ItemKind,
  type StaticKind,
  type Terrain,
} from '@fenix/shared';
import { Texture } from 'pixi.js';
import { toCanvas } from '../platform/canvas';

/**
 * Convierte el arte generado en texturas de Pixi y las reutiliza.
 * Es el único punto donde `@fenix/art` y Pixi se encuentran.
 */
export class TextureCache {
  private readonly textures = new Map<string, Texture>();

  terrain(terrain: Terrain, variant: number, neighbors: TerrainNeighbors): Texture {
    const v = variant % TERRAIN_VARIANTS;
    const { north, east, south, west } = neighbors;
    return this.getOrCreate(`t:${terrain}:${v}:${north}:${east}:${south}:${west}`, () =>
      drawTerrainTile(terrain, v, neighbors),
    );
  }

  static(kind: StaticKind, variant: number): Texture {
    const v = variant % STATIC_VARIANTS;
    return this.getOrCreate(`s:${kind}:${v}`, () => drawStatic(kind, v));
  }

  character(
    appearance: Appearance,
    direction: Direction,
    frame: CharacterFrame,
    equipment: EquipmentLook,
  ): Texture {
    const worn = EQUIPMENT_SLOTS.map((slot) => equipment[slot] ?? '').join(',');
    const key = `c:${appearance.clothHue}:${appearance.skinTone}:${appearance.hairHue}:${direction}:${frame}:${worn}`;
    return this.getOrCreate(key, () => drawCharacterFrame(appearance, direction, frame, equipment));
  }

  creature(kind: CreatureKind, direction: Direction, frame: CharacterFrame): Texture {
    return this.getOrCreate(`m:${kind}:${direction}:${frame}`, () =>
      drawCreatureFrame(kind, direction, frame),
    );
  }

  item(kind: ItemKind): Texture {
    return this.getOrCreate(`i:${kind}`, () => drawItem(kind));
  }

  /** Textura arbitraria generada una sola vez (por ejemplo, el halo de luz). */
  custom(key: string, draw: () => PixelImage): Texture {
    return this.getOrCreate(`x:${key}`, draw, 'linear');
  }

  destroy(): void {
    this.textures.forEach((texture) => texture.destroy(true));
    this.textures.clear();
  }

  private getOrCreate(
    key: string,
    draw: () => PixelImage,
    scaleMode: 'nearest' | 'linear' = 'nearest',
  ): Texture {
    let texture = this.textures.get(key);
    if (!texture) {
      texture = Texture.from(toCanvas(draw()));
      texture.source.scaleMode = scaleMode;
      this.textures.set(key, texture);
    }
    return texture;
  }
}
