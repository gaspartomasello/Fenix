import {
  CHARACTER_ART_HEIGHT,
  CHARACTER_FEET_Y,
  WALK_FRAMES,
  type CharacterFrame,
} from '@fenix/art';
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { Notoriety } from '@fenix/shared';
import { COMBAT_TEXT_MS, type CombatText, type Entity } from '../core/entity';
import { characterDepth } from './depth';
import { ART_SCALE, tileToScreen } from './iso';
import type { TextureCache } from './texture-cache';

const NAME_COLOR_SELF = 0xf6d36b;
/** Personas según su reputación: azul inocente, gris criminal, rojo asesino. */
const NAME_COLOR_NOTORIETY: Readonly<Record<Notoriety, number>> = {
  innocent: 0x8fbfff,
  criminal: 0xb4b4b4,
  murderer: 0xff5a4a,
};
/** Gris, como las criaturas atacables de UO. */
const NAME_COLOR_CREATURE = 0xd0c8b8;
/** Amarillo suave para los personajes del pueblo. */
const NAME_COLOR_NPC = 0xf2dd8a;
const SPRITE_HEIGHT = CHARACTER_FEET_Y * ART_SCALE;
const HEALTH_BAR_WIDTH = 32;
const COMBAT_TEXT_COLORS: Readonly<Record<CombatText['kind'], number>> = {
  'damage-taken': 0xff5a4a,
  'damage-dealt': 0xffe27a,
  miss: 0xc8c8c8,
  heal: 0x7ee08a,
};
/** Resolución de los textos: alta para que sigan nítidos con zoom. */
const TEXT_RESOLUTION = Math.max(2, Math.ceil(window.devicePixelRatio * 2));

export interface CharacterViewState {
  /** Es el objetivo del jugador: se marca con un aro rojo. */
  readonly targeted: boolean;
}

/** Representación visual de un personaje o criatura: sombra, sprite, nombre, vida y textos. */
export class CharacterView {
  readonly container = new Container();
  private readonly sprite = new Sprite();
  private readonly targetRing = new Graphics()
    .ellipse(0, 0, 17, 8)
    .stroke({ color: 0xff3b30, width: 2, alpha: 0.9 });
  private readonly healthBar = new Graphics();
  private readonly nameLabel: Text;
  private readonly overhead = new Container();
  private readonly combatTexts = new Container();
  private shownOverhead = '';
  private shownHealth = -1;
  private shownName = '';
  private readonly combatLabels = new Map<CombatText, Text>();

  constructor(
    private readonly entity: Entity,
    private readonly textures: TextureCache,
    private readonly isSelf: boolean,
  ) {
    const shadow = new Graphics().ellipse(0, 0, 13, 6).fill({ color: 0x000000, alpha: 0.28 });

    this.sprite.anchor.set(0.5, CHARACTER_FEET_Y / CHARACTER_ART_HEIGHT);
    this.sprite.scale.set(ART_SCALE);
    this.targetRing.visible = false;

    this.nameLabel = new Text({
      text: entity.name,
      resolution: TEXT_RESOLUTION,
      style: {
        fontFamily: 'Georgia, serif',
        fontSize: 13,
        fontWeight: 'bold',
        fill: NAME_COLOR_CREATURE,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    this.syncName();
    this.nameLabel.anchor.set(0.5, 1);
    this.nameLabel.position.set(0, -SPRITE_HEIGHT - 8);
    this.healthBar.position.set(-HEALTH_BAR_WIDTH / 2, -SPRITE_HEIGHT - 6);
    this.overhead.position.set(0, -SPRITE_HEIGHT - 26);
    this.combatTexts.position.set(0, -SPRITE_HEIGHT + 8);

    this.container.addChild(
      this.targetRing,
      shadow,
      this.sprite,
      this.healthBar,
      this.nameLabel,
      this.overhead,
      this.combatTexts,
    );
  }

  /** Para saber si el puntero está sobre este personaje (coordenadas del mundo). */
  get feet(): { x: number; y: number } {
    return { x: this.container.x, y: this.container.y };
  }

  get entityId(): string {
    return this.entity.id;
  }

  get isAliveCreature(): boolean {
    return this.entity.body !== 'human' && !this.entity.dead;
  }

  get isNpc(): boolean {
    return this.entity.npc !== null;
  }

  /** Otra persona viva (para atacarla en modo guerra). */
  get isOtherLivingPlayer(): boolean {
    return !this.isSelf && this.entity.isPlayer && !this.entity.dead;
  }

  update(now: number, state: CharacterViewState): void {
    const position = this.entity.renderPosition(now);
    const lunge = this.entity.lungeOffset(now);
    const screen = tileToScreen({ x: position.x + lunge.x, y: position.y + lunge.y });
    this.container.position.set(screen.x, screen.y);
    this.container.zIndex = characterDepth(position);

    const frame =
      this.entity.dead && this.entity.body !== 'human' ? 'idle' : this.currentFrame(now);
    this.sprite.texture =
      this.entity.body === 'human'
        ? this.textures.character(
            this.entity.appearance,
            this.entity.direction,
            frame,
            this.entity.equipment,
          )
        : this.textures.creature(this.entity.body, this.entity.direction, frame);
    this.applyDeathLook();

    this.targetRing.visible = state.targeted && !this.entity.dead;
    this.syncHealthBar(state.targeted);
    this.syncName();
    this.syncOverhead();
    this.syncCombatTexts(now);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  /** Nombre con las siglas del gremio, coloreado según la reputación. */
  private syncName(): void {
    const { entity } = this;
    const text = entity.guildTag ? `${entity.name} [${entity.guildTag}]` : entity.name;
    const color = entity.npc
      ? NAME_COLOR_NPC
      : !entity.isPlayer
        ? NAME_COLOR_CREATURE
        : this.isSelf && entity.notoriety === 'innocent'
          ? NAME_COLOR_SELF
          : NAME_COLOR_NOTORIETY[entity.notoriety];
    const key = `${text}|${color}`;
    if (key === this.shownName) return;
    this.shownName = key;
    this.nameLabel.text = text;
    this.nameLabel.style.fill = color;
  }

  /** Fantasma (jugador muerto): translúcido y azulado. Criatura muerta: se desvanece. */
  private applyDeathLook(): void {
    if (!this.entity.dead) {
      this.sprite.alpha = 1;
      this.sprite.tint = 0xffffff;
      return;
    }
    if (this.entity.body === 'human') {
      this.sprite.alpha = 0.5;
      this.sprite.tint = 0xb8c8ff;
    } else {
      this.sprite.alpha = Math.max(0, this.sprite.alpha - 0.04);
      this.sprite.tint = 0x777777;
    }
  }

  /** La barra de vida se ve si está herido o es el objetivo. */
  private syncHealthBar(targeted: boolean): void {
    const health = this.entity.dead ? 0 : this.entity.health;
    const visible = !this.entity.dead && (health < 1 || targeted);
    this.healthBar.visible = visible;
    if (!visible || health === this.shownHealth) return;
    this.shownHealth = health;
    const color = health > 0.5 ? 0x4cc24c : health > 0.25 ? 0xe0b030 : 0xe04030;
    this.healthBar
      .clear()
      .rect(0, 0, HEALTH_BAR_WIDTH, 4)
      .fill({ color: 0x000000, alpha: 0.7 })
      .rect(0, 0, Math.max(1, Math.round(HEALTH_BAR_WIDTH * health)), 4)
      .fill({ color });
  }

  /** Cada paso recorre medio ciclo; pasos pares e impares alternan la pierna. */
  private currentFrame(now: number): CharacterFrame {
    const progress = this.entity.stepProgress(now);
    if (progress === null) return 'idle';
    const half = this.entity.stepCount % 2 === 0 ? 0 : 2;
    return WALK_FRAMES[half + (progress < 0.5 ? 0 : 1)] ?? 'idle';
  }

  /** Números de daño que suben y se desvanecen. */
  private syncCombatTexts(now: number): void {
    const current = new Set(this.entity.combatTexts);
    for (const [text, label] of this.combatLabels) {
      if (!current.has(text)) {
        label.destroy();
        this.combatLabels.delete(text);
      }
    }
    for (const text of current) {
      let label = this.combatLabels.get(text);
      if (!label) {
        label = new Text({
          text: text.text,
          resolution: TEXT_RESOLUTION,
          style: {
            fontFamily: 'Georgia, serif',
            fontSize: text.kind === 'miss' ? 13 : 17,
            fontWeight: 'bold',
            fill: COMBAT_TEXT_COLORS[text.kind],
            stroke: { color: 0x000000, width: 3 },
          },
        });
        label.anchor.set(0.5, 1);
        this.combatLabels.set(text, label);
        this.combatTexts.addChild(label);
      }
      const t = Math.min(1, (now - text.startedAt) / COMBAT_TEXT_MS);
      label.position.set(0, -t * 34);
      label.alpha = 1 - t * t;
    }
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
