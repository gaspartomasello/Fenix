import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { CHARACTER_ART_HEIGHT, CHARACTER_FEET_Y, WALK_FRAMES } from '@fenix/art';
import type { Entity } from '../core/entity';
import { ART_SCALE, tileToScreen } from './iso';
import { characterDepth } from './depth';
import type { TextureCache } from './texture-cache';

const NAME_COLOR_SELF = 0xf6d36b;
const NAME_COLOR_OTHER = 0x8fbfff;
const SPRITE_HEIGHT = CHARACTER_FEET_Y * ART_SCALE;
/** Resolución de los textos: alta para que sigan nítidos con zoom. */
const TEXT_RESOLUTION = Math.max(2, Math.ceil(window.devicePixelRatio * 2));

/** Representación visual de un personaje: sombra, sprite, nombre y textos. */
export class CharacterView {
  readonly container = new Container();
  private readonly sprite = new Sprite();
  private readonly nameLabel: Text;
  private readonly overhead = new Container();
  private shownOverhead = '';

  constructor(
    private readonly entity: Entity,
    private readonly textures: TextureCache,
    isSelf: boolean,
  ) {
    const shadow = new Graphics().ellipse(0, 0, 13, 6).fill({ color: 0x000000, alpha: 0.28 });

    this.sprite.anchor.set(0.5, CHARACTER_FEET_Y / CHARACTER_ART_HEIGHT);
    this.sprite.scale.set(ART_SCALE);

    this.nameLabel = new Text({
      text: entity.name,
      resolution: TEXT_RESOLUTION,
      style: {
        fontFamily: 'Georgia, serif',
        fontSize: 13,
        fontWeight: 'bold',
        fill: isSelf ? NAME_COLOR_SELF : NAME_COLOR_OTHER,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    this.nameLabel.anchor.set(0.5, 1);
    this.nameLabel.position.set(0, -SPRITE_HEIGHT - 4);
    this.overhead.position.set(0, -SPRITE_HEIGHT - 22);

    this.container.addChild(shadow, this.sprite, this.nameLabel, this.overhead);
  }

  update(now: number): void {
    const position = this.entity.renderPosition(now);
    const screen = tileToScreen(position);
    this.container.position.set(screen.x, screen.y);
    this.container.zIndex = characterDepth(position);
    this.sprite.texture = this.textures.character(
      this.entity.appearance,
      this.entity.direction,
      this.currentFrame(now),
      this.entity.equipment,
    );
    this.syncOverhead();
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  /** Cada paso recorre medio ciclo; pasos pares e impares alternan la pierna. */
  private currentFrame(now: number) {
    const progress = this.entity.stepProgress(now);
    if (progress === null) return 'idle' as const;
    const half = this.entity.stepCount % 2 === 0 ? 0 : 2;
    return WALK_FRAMES[half + (progress < 0.5 ? 0 : 1)] ?? ('idle' as const);
  }

  private syncOverhead(): void {
    const texts = this.entity.overheadTexts;
    const key = texts.map((t) => t.text).join('\n');
    if (key === this.shownOverhead) return;
    this.shownOverhead = key;

    this.overhead.removeChildren().forEach((child) => child.destroy());
    let offsetY = 0;
    for (const { text } of [...texts].reverse()) {
      const label = new Text({
        text,
        resolution: TEXT_RESOLUTION,
        style: {
          fontFamily: 'Georgia, serif',
          fontSize: 14,
          fill: 0xffffff,
          stroke: { color: 0x000000, width: 3 },
          wordWrap: true,
          wordWrapWidth: 200,
          align: 'center',
        },
      });
      label.anchor.set(0.5, 1);
      label.position.set(0, -offsetY);
      offsetY += label.height + 2;
      this.overhead.addChild(label);
    }
  }
}
