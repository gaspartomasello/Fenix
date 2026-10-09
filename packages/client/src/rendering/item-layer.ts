import { ITEM_ART_SIZE } from '@fenix/art';
import type { EntityId, GroundItemSnapshot } from '@fenix/shared';
import { Sprite, type Container } from 'pixi.js';
import { groundItemDepth } from './depth';
import { CHARACTER_SCALE, tileToScreen, type ScreenPoint } from './iso';
import type { TextureCache } from './texture-cache';

/** Los objetos, como los personajes, tienen el doble de detalle y se muestran sin escalar. */
const HALF = (ITEM_ART_SIZE * CHARACTER_SCALE) / 2;

/** Objetos tirados en el suelo, en la capa ordenada junto a personajes y objetos fijos. */
export class ItemLayer {
  private readonly sprites = new Map<EntityId, { sprite: Sprite; item: GroundItemSnapshot }>();

  constructor(
    private readonly textures: TextureCache,
    private readonly target: Container,
  ) {}

  apply(added: readonly GroundItemSnapshot[], removed: readonly EntityId[]): void {
    for (const id of removed) this.remove(id);
    for (const item of added) {
      this.remove(item.id);
      const sprite = new Sprite(this.textures.item(item.kind, item.amount));
      const screen = tileToScreen(item.position);
      sprite.anchor.set(0.5);
      sprite.scale.set(CHARACTER_SCALE);
      sprite.position.set(screen.x, screen.y - 4);
      sprite.zIndex = groundItemDepth(item.position);
      this.target.addChild(sprite);
      this.sprites.set(item.id, { sprite, item });
    }
  }

  /** El objeto bajo un punto del mundo (el de más adelante si hay varios). */
  itemAt(point: ScreenPoint): GroundItemSnapshot | null {
    let best: { item: GroundItemSnapshot; z: number } | null = null;
    for (const { sprite, item } of this.sprites.values()) {
      const inside =
        Math.abs(point.x - sprite.x) <= HALF * 0.7 && Math.abs(point.y - sprite.y) <= HALF * 0.7;
      if (inside && (!best || sprite.zIndex > best.z)) best = { item, z: sprite.zIndex };
    }
    return best?.item ?? null;
  }

  clear(): void {
    for (const id of [...this.sprites.keys()]) this.remove(id);
  }

  private remove(id: EntityId): void {
    this.sprites.get(id)?.sprite.destroy();
    this.sprites.delete(id);
  }
}
