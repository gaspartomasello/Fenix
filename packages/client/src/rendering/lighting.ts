import { PixelImage } from '@fenix/art';
import { daylight, type StaticPlacement } from '@fenix/shared';
import { Container, Graphics, RenderTexture, Sprite, type Renderer } from 'pixi.js';
import type { FractionalPosition } from '../core/entity';
import { TILE_HALF, tileToScreen, type ScreenPoint } from './iso';
import type { TextureCache } from './texture-cache';

/** Luz de ambiente en plena noche: el mundo se ve azulado y oscuro, pero se distingue. */
const NIGHT_AMBIENT = [58, 68, 116] as const;
/** Color que suma cada luz (cálido, como fuego). */
const LIGHT_COLOR = 0xb08a62;
/** Luz chica que acompaña al jugador de noche, en tiles (para no quedar a ciegas). */
const SELF_LIGHT_RADIUS = 2.5;
const LIGHT_TEXTURE_SIZE = 128;
/** El mapa de luz se arma a media resolución: es suave y así cuesta menos. */
const LIGHT_MAP_RESOLUTION = 0.5;

export interface LightingFrame {
  readonly renderer: Renderer;
  readonly width: number;
  readonly height: number;
  /** Punto del mundo → pantalla, y la escala de la cámara. */
  readonly toScreen: (p: ScreenPoint) => ScreenPoint;
  readonly zoom: number;
  readonly dayProgress: number;
  readonly focus: FractionalPosition;
  readonly lights: Iterable<{ placement: StaticPlacement; radius: number }>;
  /** Visión nocturna: se ve como de día, sin oscuridad. */
  readonly nightVision: boolean;
}

/**
 * Día y noche con un mapa de luz: una capa que multiplica todo lo que se ve.
 * Lejos de las luces queda el color de ambiente (oscuro de noche); cerca de
 * un farol o del jugador, la luz suma y el terreno, las paredes, las
 * criaturas y los personajes se ven con sus colores, con un tono cálido.
 * Así la luz ilumina lo que toca en vez de tapar la vista.
 */
export class Lighting {
  /** Lo que se pone sobre el mundo, en coordenadas de pantalla. */
  readonly overlay: Sprite;
  private readonly scene = new Container();
  private readonly ambient = new Graphics();
  private readonly pool: Sprite[] = [];
  private target: RenderTexture;

  constructor(private readonly textures: TextureCache) {
    this.target = RenderTexture.create({ width: 1, height: 1, resolution: LIGHT_MAP_RESOLUTION });
    this.overlay = new Sprite(this.target);
    this.overlay.blendMode = 'multiply';
    this.overlay.visible = false;
    this.scene.addChild(this.ambient);
  }

  /** Qué tan de noche es (0 de día, 1 en plena noche). */
  static darkness(dayProgress: number): number {
    return Math.max(0, Math.min(1, 1 - (daylight(dayProgress) - 0.25) / 0.75));
  }

  update(frame: LightingFrame): void {
    const darkness = frame.nightVision ? 0 : Lighting.darkness(frame.dayProgress);
    if (darkness < 0.02) {
      this.overlay.visible = false;
      return;
    }
    this.resize(frame.width, frame.height);
    const channel = (i: 0 | 1 | 2): number => Math.round(255 + (NIGHT_AMBIENT[i] - 255) * darkness);
    this.ambient
      .clear()
      .rect(0, 0, frame.width, frame.height)
      .fill((channel(0) << 16) | (channel(1) << 8) | channel(2));

    let used = 0;
    this.place(used++, frame, frame.focus, SELF_LIGHT_RADIUS, darkness * 0.7);
    for (const { placement, radius } of frame.lights) {
      this.place(used++, frame, placement, radius, darkness);
    }
    for (let i = used; i < this.pool.length; i++) {
      const sprite = this.pool[i];
      if (sprite) sprite.visible = false;
    }
    frame.renderer.render({ container: this.scene, target: this.target, clear: true });
    this.overlay.visible = true;
  }

  destroy(): void {
    this.scene.destroy({ children: true });
    this.overlay.destroy();
    this.target.destroy(true);
  }

  private resize(width: number, height: number): void {
    if (this.target.width === width && this.target.height === height) return;
    this.target.resize(width, height);
    this.overlay.texture = this.target;
    this.overlay.width = width;
    this.overlay.height = height;
  }

  /** Una luz sobre el suelo: un círculo que se desvanece hacia afuera. */
  private place(
    index: number,
    frame: LightingFrame,
    at: FractionalPosition,
    radius: number,
    intensity: number,
  ): void {
    let sprite = this.pool[index];
    if (!sprite) {
      sprite = new Sprite(this.textures.custom('light', drawLightTexture));
      sprite.anchor.set(0.5);
      sprite.blendMode = 'add';
      sprite.tint = LIGHT_COLOR;
      this.pool[index] = sprite;
      this.scene.addChild(sprite);
    }
    const screen = frame.toScreen(tileToScreen(at));
    // Un paso de tile mide 22·√2 px en la pantalla; el halo llega hasta `radius` tiles.
    const size = radius * TILE_HALF * Math.SQRT2 * 2 * frame.zoom;
    sprite.visible = true;
    sprite.alpha = intensity;
    sprite.position.set(screen.x, screen.y);
    sprite.width = size;
    sprite.height = size;
  }
}

/** Halo radial blanco, fuerte en el centro y suave hacia el borde. */
function drawLightTexture(): PixelImage {
  const size = LIGHT_TEXTURE_SIZE;
  const image = new PixelImage(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      if (d < 1) {
        // Fuerte cerca de la luz y cayendo rápido, como la luz de una llama.
        const falloff = (1 - d) ** 1.6 * (1 - d * d * 0.3);
        image.set(x, y, [255, 255, 255], Math.round(falloff * 255));
      }
    }
  }
  return image;
}
