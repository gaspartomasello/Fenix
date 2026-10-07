import { PixelImage } from '@fenix/art';
import { daylight, type StaticPlacement } from '@fenix/shared';
import { Container, Sprite } from 'pixi.js';
import type { FractionalPosition } from '../core/entity';
import { TILE_HALF, tileToScreen } from './iso';
import type { TextureCache } from './texture-cache';

const DAY_TINT = [255, 255, 255] as const;
const NIGHT_TINT = [70, 84, 140] as const;
const LIGHT_COLOR = 0xffc878;
/** Radio de la luz que acompaña al jugador de noche, en tiles. */
const SELF_LIGHT_RADIUS = 3;
const LIGHT_TEXTURE_SIZE = 64;

/**
 * Día y noche: oscurece el mundo según la hora y suma luces cálidas
 * (faroles y el propio jugador) con mezcla aditiva.
 */
export class Lighting {
  readonly container = new Container();
  private readonly pool: Sprite[] = [];

  constructor(private readonly textures: TextureCache) {}

  /** Color por el que se multiplica el mundo (blanco = sin cambios). */
  static tintFor(dayProgress: number): number {
    const light = daylight(dayProgress);
    const t = (light - 0.25) / 0.75;
    const channel = (i: 0 | 1 | 2): number =>
      Math.round(NIGHT_TINT[i] + (DAY_TINT[i] - NIGHT_TINT[i]) * t);
    return (channel(0) << 16) | (channel(1) << 8) | channel(2);
  }

  update(
    dayProgress: number,
    focus: FractionalPosition,
    lights: Iterable<{ placement: StaticPlacement; radius: number }>,
  ): void {
    const darkness = 1 - (daylight(dayProgress) - 0.25) / 0.75;
    let used = 0;
    if (darkness > 0.02) {
      this.place(used++, focus, SELF_LIGHT_RADIUS, darkness * 0.3);
      for (const { placement, radius } of lights) {
        this.place(used++, placement, radius, darkness * 0.5);
      }
    }
    for (let i = used; i < this.pool.length; i++) {
      const sprite = this.pool[i];
      if (sprite) sprite.visible = false;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private place(index: number, at: FractionalPosition, radius: number, alpha: number): void {
    let sprite = this.pool[index];
    if (!sprite) {
      sprite = new Sprite(this.textures.custom('light', drawLightTexture));
      sprite.anchor.set(0.5);
      sprite.blendMode = 'add';
      sprite.tint = LIGHT_COLOR;
      this.pool[index] = sprite;
      this.container.addChild(sprite);
    }
    const screen = tileToScreen(at);
    const size = radius * TILE_HALF * 2 * 2;
    sprite.visible = true;
    sprite.alpha = alpha;
    sprite.position.set(screen.x, screen.y - TILE_HALF);
    sprite.width = size;
    sprite.height = size;
  }
}

/** Halo radial blanco que se desvanece hacia los bordes. */
function drawLightTexture(): PixelImage {
  const size = LIGHT_TEXTURE_SIZE;
  const image = new PixelImage(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      if (d < 1) image.set(x, y, [255, 255, 255], Math.round((1 - d) ** 2 * 255));
    }
  }
  return image;
}
