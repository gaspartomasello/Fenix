import { SPELLS, type EntityId, type SpellKey } from '@fenix/shared';
import { Container, Graphics } from 'pixi.js';
import type { FractionalPosition } from '../core/entity';
import { tileToScreen } from './iso';

/** Altura del pecho sobre los pies: de ahí salen y ahí llegan los hechizos. */
const CHEST_Y = 40;

/** Cómo se ve un efecto: con qué forma se anima, sus colores y cuánto dura. */
interface Visual {
  readonly style:
    'projectile' | 'arrow' | 'sparkles' | 'sink' | 'ring' | 'bolt' | 'column' | 'burst';
  readonly color: number;
  readonly glow: number;
  readonly durationMs: number;
  /** Tamaño (radio del proyectil, cantidad de destellos…). */
  readonly size: number;
}

interface ActiveEffect {
  readonly visual: Visual;
  readonly casterId: EntityId;
  readonly targetId: EntityId;
  readonly startedAt: number;
}

/** Proyectiles y destellos propios de algunos hechizos; el resto sale de lo que hacen. */
const SPELL_VISUALS: Partial<Record<SpellKey, Visual>> = {
  'magic-arrow': { style: 'projectile', color: 0xfff2a0, glow: 0xffd040, durationMs: 500, size: 3 },
  harm: { style: 'burst', color: 0xd04060, glow: 0x801030, durationMs: 500, size: 10 },
  fireball: { style: 'projectile', color: 0xffb040, glow: 0xff5a1a, durationMs: 700, size: 6 },
  lightning: { style: 'bolt', color: 0xf4f8ff, glow: 0x80b0ff, durationMs: 450, size: 3 },
  'mind-blast': { style: 'ring', color: 0xd0a0ff, glow: 0x8040c0, durationMs: 600, size: 40 },
  'energy-bolt': { style: 'projectile', color: 0xd8ecff, glow: 0x4080ff, durationMs: 650, size: 7 },
  explosion: { style: 'burst', color: 0xffd060, glow: 0xff4010, durationMs: 700, size: 26 },
  flamestrike: { style: 'column', color: 0xffc050, glow: 0xff3a10, durationMs: 900, size: 14 },
  'mana-drain': { style: 'sink', color: 0x60a0ff, glow: 0x2050c0, durationMs: 800, size: 8 },
  'mana-vampire': { style: 'sink', color: 0x8060ff, glow: 0x4020c0, durationMs: 900, size: 10 },
  light: { style: 'ring', color: 0xfff0a0, glow: 0xfff0a0, durationMs: 600, size: 50 },
  teleport: { style: 'sparkles', color: 0xc080ff, glow: 0xc080ff, durationMs: 700, size: 12 },
  protection: { style: 'ring', color: 0xffd860, glow: 0xffd860, durationMs: 700, size: 30 },
  paralyze: { style: 'ring', color: 0x80f0ff, glow: 0x80f0ff, durationMs: 800, size: 22 },
  poison: { style: 'sink', color: 0x70e060, glow: 0x308020, durationMs: 800, size: 8 },
  cure: { style: 'sparkles', color: 0xf0fff0, glow: 0xf0fff0, durationMs: 700, size: 8 },
  'create-food': { style: 'sparkles', color: 0xffe080, glow: 0xffe080, durationMs: 700, size: 6 },
};

function visualFor(spell: SpellKey): Visual {
  const own = SPELL_VISUALS[spell];
  if (own) return own;
  const effect = SPELLS[spell].effect;
  if (effect.kind === 'heal')
    return {
      style: 'sparkles',
      color: 0x8cf09a,
      glow: 0x8cf09a,
      durationMs: 900,
      size: 6 + SPELLS[spell].circle * 2,
    };
  if (effect.kind === 'area-damage')
    return { style: 'burst', color: 0xc8a070, glow: 0x6a4a2a, durationMs: 700, size: 16 };
  if (effect.kind === 'summon')
    return { style: 'sparkles', color: 0xd0a0ff, glow: 0xd0a0ff, durationMs: 900, size: 14 };
  if (effect.kind === 'resurrect')
    return { style: 'sparkles', color: 0xfff2b0, glow: 0xfff2b0, durationMs: 1200, size: 16 };
  if (effect.kind === 'attribute')
    return effect.sign > 0
      ? { style: 'sparkles', color: 0x90c8ff, glow: 0x90c8ff, durationMs: 800, size: 7 }
      : { style: 'sink', color: 0xb070d0, glow: 0x602080, durationMs: 800, size: 7 };
  return { style: 'projectile', color: 0xffffff, glow: 0xa0a0ff, durationMs: 600, size: 4 };
}

const ARROW: Visual = { style: 'arrow', color: 0xe8dcc0, glow: 0x6a4a2a, durationMs: 300, size: 1 };

/** Efectos de hechizos y flechas, dibujados con formas simples que se animan por frame. */
export class EffectsLayer {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private effects: ActiveEffect[] = [];

  constructor(
    private readonly positionOf: (id: EntityId, now: number) => FractionalPosition | null,
  ) {
    this.container.addChild(this.graphics);
  }

  addSpell(spell: SpellKey, casterId: EntityId, targetId: EntityId, now: number): void {
    this.effects.push({ visual: visualFor(spell), casterId, targetId, startedAt: now });
  }

  addArrow(casterId: EntityId, targetId: EntityId, now: number): void {
    this.effects.push({ visual: ARROW, casterId, targetId, startedAt: now });
  }

  update(now: number): void {
    const g = this.graphics.clear();
    this.effects = this.effects.filter((e) => now - e.startedAt < e.visual.durationMs);
    for (const effect of this.effects) {
      const { visual } = effect;
      const t = (now - effect.startedAt) / visual.durationMs;
      const target = this.positionOf(effect.targetId, now);
      const caster = this.positionOf(effect.casterId, now) ?? target;
      if (!target || !caster) continue;
      const to = chest(target);
      const from = chest(caster);

      switch (visual.style) {
        case 'projectile':
          projectile(g, from, to, t, 0.6, visual.size, visual.color, visual.glow);
          break;
        case 'arrow':
          arrow(g, from, to, t, visual.color);
          break;
        case 'sparkles':
          sparkles(g, to, t, visual.size, visual.color, -1);
          break;
        case 'sink':
          sparkles(g, to, t, visual.size, visual.color, 1);
          break;
        case 'ring':
          g.circle(to.x, to.y, 8 + t * visual.size).stroke({
            color: visual.color,
            width: 3,
            alpha: 1 - t,
          });
          break;
        case 'bolt':
          bolt(g, to, t, visual.color, visual.glow);
          break;
        case 'column':
          column(g, to, t, visual.size, visual.color, visual.glow);
          break;
        case 'burst':
          g.circle(to.x, to.y, visual.size * (0.4 + t)).fill({
            color: visual.glow,
            alpha: 0.5 * (1 - t),
          });
          g.circle(to.x, to.y, visual.size * 0.5 * (0.4 + t)).fill({
            color: visual.color,
            alpha: 1 - t,
          });
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

/** Una flecha: una línea corta que vuela recta hasta el objetivo. */
function arrow(
  g: Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  t: number,
  color: number,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const x = from.x + dx * t;
  const y = from.y + dy * t;
  const ux = (dx / length) * 9;
  const uy = (dy / length) * 9;
  g.moveTo(x - ux, y - uy)
    .lineTo(x, y)
    .stroke({ color, width: 2 });
}

/** Destellos alrededor del objetivo, que suben (−1) o bajan (+1). */
function sparkles(
  g: Graphics,
  at: { x: number; y: number },
  t: number,
  count: number,
  color: number,
  direction: 1 | -1,
): void {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const x = at.x + Math.cos(angle + t * 3) * 14;
    const rise = direction < 0 ? 16 - t * 46 : -24 + t * 40;
    const y = at.y + rise + Math.sin(angle) * 6;
    g.circle(x, y, 2.2).fill({ color, alpha: 1 - t });
  }
}

/** Relámpago: una línea quebrada que cae del cielo sobre el objetivo. */
function bolt(
  g: Graphics,
  at: { x: number; y: number },
  t: number,
  color: number,
  glow: number,
): void {
  let x = at.x;
  let y = at.y - 140;
  g.moveTo(x, y);
  for (let i = 1; i <= 7; i++) {
    x = at.x + (i === 7 ? 0 : i % 2 ? 7 : -6);
    y = at.y - 140 + i * 20;
    g.lineTo(x, y);
  }
  g.stroke({ color: glow, width: 6, alpha: 0.5 * (1 - t) });
  g.stroke({ color, width: 2, alpha: 1 - t });
}

/** Columna de fuego que sube desde los pies del objetivo. */
function column(
  g: Graphics,
  at: { x: number; y: number },
  t: number,
  width: number,
  color: number,
  glow: number,
): void {
  const height = 70 * Math.min(1, t * 2.5);
  const alpha = t < 0.6 ? 1 : (1 - t) / 0.4;
  g.rect(at.x - width, at.y + CHEST_Y - height, width * 2, height).fill({
    color: glow,
    alpha: 0.5 * alpha,
  });
  g.rect(at.x - width / 2, at.y + CHEST_Y - height, width, height).fill({ color, alpha });
}
