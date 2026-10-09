import type { Appearance, Direction, Terrain } from '@fenix/shared';
import { Texture } from 'pixi.js';
import { drawCharacterFrame, type CharacterFrame } from '../assets/character-art';
import { drawTerrainTile, TERRAIN_VARIANTS } from '../assets/terrain-art';

/**
 * Convierte el arte generado (canvas) en texturas de Pixi y las reutiliza.
 * Es el único punto donde `assets` y Pixi se encuentran.
 */
export class TextureCache {
  private readonly textures = new Map<string, Texture>();

  terrain(terrain: Terrain, variant: number): Texture {
    const v = variant % TERRAIN_VARIANTS;
    return this.getOrCreate(`t:${terrain}:${v}`, () => drawTerrainTile(terrain, v));
  }

  character(appearance: Appearance, direction: Direction, frame: CharacterFrame): Texture {
    const key = `c:${appearance.clothHue}:${appearance.skinTone}:${appearance.hairHue}:${direction}:${frame}`;
    return this.getOrCreate(key, () => drawCharacterFrame(appearance, direction, frame));
  }

  destroy(): void {
    this.textures.forEach((texture) => texture.destroy(true));
    this.textures.clear();
  }

  private getOrCreate(key: string, draw: () => HTMLCanvasElement): Texture {
    let texture = this.textures.get(key);
    if (!texture) {
      texture = Texture.from(draw());
      texture.source.scaleMode = 'nearest';
      this.textures.set(key, texture);
    }
    return texture;
  }
}
