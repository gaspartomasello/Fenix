import { SHIP_ART_HEIGHT, SHIP_ART_ORIGIN, SHIP_ART_WIDTH, drawShip } from '@fenix/art';
import type { EntityId, ShipSnapshot } from '@fenix/shared';
import { Container, Sprite } from 'pixi.js';
import type { Ground } from './ground';
import { ART_SCALE } from './iso';
import type { TextureCache } from './texture-cache';

/** Cuánto del camino hacia su tile nuevo recorre el barco en cada cuadro (se desliza). */
const GLIDE = 0.25;

/**
 * Los barcos: van sobre el agua y debajo de la gente (que camina por la
 * cubierta). Cada uno se dibuja con la proa hacia donde mira y se desliza
 * de un tile al siguiente.
 */
export class ShipLayer {
  readonly container = new Container();
  private readonly sprites = new Map<
    EntityId,
    { sprite: Sprite; key: string; x: number; y: number }
  >();

  constructor(
    private readonly textures: TextureCache,
    private readonly ground: Ground,
  ) {}

  apply(ships: readonly ShipSnapshot[]): void {
    const seen = new Set<EntityId>();
    for (const ship of ships) {
      seen.add(ship.id);
      const key = `ship:${ship.kind}:${ship.facing}`;
      const screen = this.ground.toScreen(ship);
      let entry = this.sprites.get(ship.id);
      if (!entry) {
        const sprite = new Sprite();
        sprite.anchor.set(SHIP_ART_ORIGIN.x / SHIP_ART_WIDTH, SHIP_ART_ORIGIN.y / SHIP_ART_HEIGHT);
        sprite.scale.set(ART_SCALE);
        sprite.position.set(screen.x, screen.y);
        this.container.addChild(sprite);
        entry = { sprite, key: '', x: screen.x, y: screen.y };
        this.sprites.set(ship.id, entry);
      }
      if (entry.key !== key) {
        entry.sprite.texture = this.textures.custom(key, () => drawShip(ship.kind, ship.facing));
        entry.key = key;
      }
      entry.x = screen.x;
      entry.y = screen.y;
    }
    for (const [id, entry] of this.sprites)
      if (!seen.has(id)) {
        entry.sprite.destroy();
        this.sprites.delete(id);
      }
  }

  /** Acerca cada barco a su lugar (se llama en cada cuadro). */
  update(): void {
    for (const { sprite, x, y } of this.sprites.values()) {
      sprite.x += (x - sprite.x) * GLIDE;
      sprite.y += (y - sprite.y) * GLIDE;
    }
  }

  clear(): void {
    for (const { sprite } of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
  }
}
