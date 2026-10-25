import { staticFrame } from '@fenix/art';
import type { Position } from '@fenix/shared/geometry/position';
import type { HouseKind } from '@fenix/shared/housing/houses';
import { houseLayout } from '@fenix/shared/housing/layout';
import { houseOrigin } from '@fenix/shared/housing/structure';
import { Container, Graphics, Sprite } from 'pixi.js';
import type { Ground } from './ground';
import { ART_SCALE, TILE_HALF } from './iso';
import type { TextureCache } from './texture-cache';
import { variantFor } from './terrain-layer';

const OK = 0x6ee070;
const WRONG = 0xff5a4a;

/**
 * La casa como se vería al levantarla, mientras se elige el lugar: el suelo
 * que ocupa (verde si se puede, rojo si no) y sus paredes, transparentes.
 * Va por encima de todo: es una guía, no parte del mundo.
 */
export class HousePreview {
  readonly container = new Container();
  private readonly floor = new Graphics();
  private readonly walls = new Container();
  private shown = '';

  constructor(
    private readonly textures: TextureCache,
    private readonly ground: Ground,
  ) {
    this.container.addChild(this.floor, this.walls);
    this.container.visible = false;
  }

  show(kind: HouseKind, center: Position, valid: boolean): void {
    const key = `${kind}:${center.x},${center.y}:${valid}`;
    this.container.visible = true;
    if (key === this.shown) return;
    this.shown = key;
    const layout = houseLayout(kind);
    const origin = houseOrigin(kind, center);
    const color = valid ? OK : WRONG;
    const g = this.floor.clear();
    for (let y = 0; y < layout.height; y++)
      for (let x = 0; x < layout.width; x++) {
        const c = this.ground.toScreen({ x: origin.x + x, y: origin.y + y });
        g.poly([
          c.x,
          c.y - TILE_HALF,
          c.x + TILE_HALF,
          c.y,
          c.x,
          c.y + TILE_HALF,
          c.x - TILE_HALF,
          c.y,
        ]);
      }
    g.fill({ color, alpha: 0.28 }).stroke({ color, alpha: 0.6, width: 1 });
    for (const child of this.walls.removeChildren()) child.destroy();
    // De atrás hacia adelante, para que las paredes se tapen bien entre sí.
    const statics = [...layout.statics].sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const placed of statics) {
      const at = { x: origin.x + placed.x, y: origin.y + placed.y };
      const sprite = new Sprite(this.textures.static(placed.kind, variantFor(at.x, at.y)));
      const frame = staticFrame(placed.kind);
      const screen = this.ground.toScreen(at);
      sprite.anchor.set(frame.ground.x / frame.width, frame.ground.y / frame.height);
      sprite.scale.set(ART_SCALE);
      sprite.position.set(screen.x, screen.y);
      sprite.alpha = 0.55;
      sprite.tint = valid ? 0xd8ffd8 : 0xffb0a8;
      this.walls.addChild(sprite);
    }
  }

  hide(): void {
    this.container.visible = false;
    this.shown = '';
  }
}
