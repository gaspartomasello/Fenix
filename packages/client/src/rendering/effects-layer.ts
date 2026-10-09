import type { EntityId, SpellKey } from '@fenix/shared';
import { Container, Graphics } from 'pixi.js';
import type { FractionalPosition } from '../core/entity';
import { tileToScreen } from './iso';

/** Altura del pecho sobre los pies: de ahí salen y ahí llegan los hechizos. */
const CHEST_Y = 40;

interface ActiveEffect {
  readonly spell: SpellKey;
  readonly casterId: EntityId;
  readonly targetId: EntityId;
  readonly startedAt: number;
}

const DURATION_MS: Readonly<Record<SpellKey, number>> = {
  'magic-arrow': 500,
  fireball: 700,
  heal: 800,
  'greater-heal': 1000,
  light: 600,
};

/** Efectos de hechizos dibujados con formas simples que se animan por frame. */
export class EffectsLayer {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private effects: ActiveEffect[] = [];

  constructor(
    private readonly positionOf: (id: EntityId, now: number) => FractionalPosition | null,
  ) {
    this.container.addChild(this.graphics);
  }

  add(effect: Omit<ActiveEffect, 'startedAt'>, now: number): void {
    this.effects.push({ ...effect, startedAt: now });
  }

  update(now: number): void {
    const g = this.graphics.clear();
    this.effects = this.effects.filter((e) => now - e.startedAt < DURATION_MS[e.spell]);
    for (const effect of this.effects) {
      const t = (now - effect.startedAt) / DURATION_MS[effect.spell];
      const target = this.positionOf(effect.targetId, now);
      const caster = this.positionOf(effect.casterId, now) ?? target;
      if (!target || !caster) continue;
      const to = chest(target);
      const from = chest(caster);

      switch (effect.spell) {
        case 'magic-arrow':
          projectile(g, from, to, t, 0.6, 3, 0xfff2a0, 0xffd040);
          break;
        case 'fireball':
          projectile(g, from, to, t, 0.55, 6, 0xffb040, 0xff5a1a);
          break;
        case 'heal':
        case 'greater-heal':
          sparkles(g, to, t, effect.spell === 'greater-heal' ? 10 : 6, 0x8cf09a);
          break;
        case 'light':
          g.circle(to.x, to.y, 10 + t * 50).stroke({ color: 0xfff0a0, width: 3, alpha: 1 - t });
          break;
      }
    }
  }
}

function chest(position: FractionalPosition): { x: number; y: number } {
  const screen = tileToScreen(position);
  return { x: screen.x, y: screen.y - CHEST_Y };
}

/** Un proyectil que viaja la primera parte del tiempo y explota en el resto. */
function projectile(
  g: Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  t: number,
  travel: number,
  radius: number,
  core: number,
  glow: number,
): void {
  if (t < travel) {
    const k = t / travel;
    const x = from.x + (to.x - from.x) * k;
    const y = from.y + (to.y - from.y) * k;
    g.circle(x, y, radius * 2).fill({ color: glow, alpha: 0.35 });
    g.circle(x, y, radius).fill({ color: core });
    return;
  }
  const k = (t - travel) / (1 - travel);
  g.circle(to.x, to.y, radius * (1 + k * 3)).fill({ color: glow, alpha: 0.6 * (1 - k) });
}

/** Destellos que suben alrededor del objetivo. */
function sparkles(
  g: Graphics,
  at: { x: number; y: number },
  t: number,
  count: number,
  color: number,
): void {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const x = at.x + Math.cos(angle + t * 3) * 14;
    const y = at.y + 16 - t * 46 + Math.sin(angle) * 6;
    g.circle(x, y, 2.2).fill({ color, alpha: 1 - t });
  }
}
