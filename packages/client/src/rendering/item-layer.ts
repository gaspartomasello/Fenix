import {
  ITEM_ART_SIZE,
  MOONGATE_ART,
  PLAYER_CORPSE_LAYOUT,
  drawMoongate,
  drawStatic,
  staticFrame,
} from '@fenix/art';
import { CHEST_ART } from '@fenix/shared/housing/furniture';
import type { EntityId, GroundItemSnapshot } from '@fenix/shared/protocol/messages';
import { Sprite, type Container } from 'pixi.js';
import { characterDepth, groundItemDepth, staticDepth } from './depth';
import { drawnAsField } from './field-layer';
import type { Ground } from './ground';
import { ART_SCALE, CHARACTER_SCALE, type ScreenPoint } from './iso';
import type { TextureCache } from './texture-cache';

/** Los objetos, como los personajes, tienen el doble de detalle y se muestran sin escalar. */
const HALF = (ITEM_ART_SIZE * CHARACTER_SCALE) / 2;

/** Objetos tirados en el suelo, en la capa ordenada junto a personajes y objetos fijos. */
export class ItemLayer {
  private readonly sprites = new Map<EntityId, { sprite: Sprite; item: GroundItemSnapshot }>();
  /** Los que se están arrastrando (no se muestran hasta soltarlos). */
  private readonly lifted = new Set<EntityId>();

  constructor(
    private readonly textures: TextureCache,
    private readonly target: Container,
    private readonly ground: Ground,
  ) {}

  apply(added: readonly GroundItemSnapshot[], removed: readonly EntityId[]): void {
    for (const id of removed) this.remove(id);
    for (const item of added) {
      this.remove(item.id);
      // El fuego, el veneno y el muro de piedra los dibuja la capa de campos.
      if (drawnAsField(item.kind)) continue;
      const dressed = item.kind === 'player-corpse' ? item.corpseLook : undefined;
      const sprite = new Sprite(
        dressed
          ? this.textures.playerCorpse(dressed)
          : item.kind === 'moongate'
            ? this.textures.custom('moongate', drawMoongate)
            : this.textures.item(item.kind, item.amount),
      );
      const screen = this.ground.toScreen(item.position);
      sprite.anchor.set(0.5);
      sprite.scale.set(CHARACTER_SCALE);
      if (item.kind === 'raw-fish')
        sprite.scale.set((CHARACTER_SCALE * ITEM_ART_SIZE) / sprite.texture.width);
      sprite.position.set(screen.x, screen.y - 4);
      sprite.zIndex = groundItemDepth(item.position);
      // El cuerpo de un jugador, del tamaño de una persona: tirado como cayó, con lo que tiene puesto.
      if (dressed) {
        sprite.scale.set(CHARACTER_SCALE);
        sprite.anchor.set(
          PLAYER_CORPSE_LAYOUT.groundX / PLAYER_CORPSE_LAYOUT.width,
          PLAYER_CORPSE_LAYOUT.groundY / PLAYER_CORPSE_LAYOUT.height,
        );
        sprite.position.set(screen.x, screen.y);
      } else if (item.kind === 'player-corpse' || item.kind === 'player-bones')
        sprite.scale.set(CHARACTER_SCALE * 2.2);
      const chestArt = CHEST_ART[item.kind];
      if (chestArt) {
        // Los cofres de las casas: el baúl de los muebles, de su tamaño y mirando a su lado.
        const frame = staticFrame(chestArt);
        sprite.texture = this.textures.custom(`chest:${chestArt}`, () => drawStatic(chestArt, 0));
        sprite.anchor.set(frame.ground.x / frame.width, frame.ground.y / frame.height);
        sprite.scale.set(ART_SCALE);
        sprite.position.set(screen.x, screen.y);
        sprite.zIndex = staticDepth(item.position);
      }
      if (item.kind === 'moongate') {
        // El portal está parado, un poco más alto que una persona: se apoya en el piso y brilla.
        sprite.anchor.set(0.5, MOONGATE_ART.groundY / MOONGATE_ART.height);
        sprite.scale.set(CHARACTER_SCALE);
        sprite.position.set(screen.x, screen.y);
        sprite.zIndex = characterDepth(item.position) - 1;
        sprite.alpha = 0.92;
      }
      this.target.addChild(sprite);
      this.sprites.set(item.id, { sprite, item });
    }
  }

  /** Esconde lo que está en un piso de arriba del edificio donde uno está. */
  refreshHidden(): void {
    for (const [id, { sprite, item }] of this.sprites)
      sprite.visible = !this.lifted.has(id) && !this.ground.hidden(item.position);
  }

  /** El objeto bajo un punto del mundo (el de más adelante si hay varios). */
  itemAt(point: ScreenPoint): GroundItemSnapshot | null {
    let best: { item: GroundItemSnapshot; z: number } | null = null;
    for (const { sprite, item } of this.sprites.values()) {
      if (!sprite.visible) continue;
      // El cuerpo de un jugador es grande (una persona tirada): se toca en cualquier parte de él.
      const inside =
        item.kind === 'player-corpse' || item.kind === 'player-bones' || CHEST_ART[item.kind]
          ? insideDrawing(sprite, point)
          : Math.abs(point.x - sprite.x) <= HALF * 0.7 &&
            Math.abs(point.y - sprite.y) <= HALF * 0.7;
      if (inside && (!best || sprite.zIndex > best.z)) best = { item, z: sprite.zIndex };
    }
    return best?.item ?? null;
  }

  /** Esconde un objeto del suelo mientras se lo arrastra; devuelve cómo mostrarlo de nuevo. */
  lift(id: EntityId): () => void {
    const entry = this.sprites.get(id);
    if (entry) entry.sprite.visible = false;
    this.lifted.add(id);
    return () => {
      this.lifted.delete(id);
      const current = this.sprites.get(id);
      if (current) current.sprite.visible = true;
    };
  }

  clear(): void {
    for (const id of [...this.sprites.keys()]) this.remove(id);
  }

  private remove(id: EntityId): void {
    this.sprites.get(id)?.sprite.destroy();
    this.sprites.delete(id);
  }
}

/** ¿Cae el punto dentro del dibujo (su rectángulo, un poco achicado para no tocar de más)? */
function insideDrawing(sprite: Sprite, point: ScreenPoint): boolean {
  const width = sprite.texture.width * Math.abs(sprite.scale.x);
  const height = sprite.texture.height * Math.abs(sprite.scale.y);
  const left = sprite.x - sprite.anchor.x * width;
  const top = sprite.y - sprite.anchor.y * height;
  const margin = 0.15;
  return (
    point.x >= left + width * margin &&
    point.x <= left + width * (1 - margin) &&
    point.y >= top + height * margin &&
    point.y <= top + height * (1 - margin)
  );
}
