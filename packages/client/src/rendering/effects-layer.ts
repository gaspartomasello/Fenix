import type { SpellKey } from '@fenix/shared/magic/spell-catalog';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { Container, Graphics } from 'pixi.js';
import type { FractionalPosition } from '../core/entity';
import type { Ground } from './ground';
import { paintFx } from './spell-fx/paint';
import { explosion, projectile, type FxContext, type Point } from './spell-fx/painters';
import { SPELL_FX, type SpellFx } from './spell-fx/recipes';

/** Altura del pecho sobre los pies: de ahí salen y ahí llegan los hechizos. */
const CHEST_Y = 40;

/** Lo que no es un hechizo: flechas y cañonazos. */
type Shot = 'arrow' | 'cannon-hit' | 'cannon-miss';

interface ActiveEffect {
  readonly fx: SpellFx | Shot;
  readonly durationMs: number;
  readonly casterId: EntityId;
  readonly targetId: EntityId;
  readonly startedAt: number;
  /** Para lo que va de un lugar a otro (un cañonazo), en vez de entre dos personajes. */
  readonly from?: FractionalPosition;
  readonly to?: FractionalPosition;
}

const SHOT_MS: Readonly<Record<Shot, number>> = {
  arrow: 300,
  'cannon-hit': 900,
  'cannon-miss': 900,
};

/**
 * Efectos de hechizos, flechas y cañonazos. Cada hechizo tiene su propio
 * dibujo (`spell-fx/recipes.ts`), hecho con trazos y partículas que se
 * calculan en cada cuadro.
 */
export class EffectsLayer {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  /** Fuego y brillos: se suman a lo que hay abajo (iluminan). */
  private readonly glow = new Graphics();
  private effects: ActiveEffect[] = [];

  constructor(
    private readonly positionOf: (id: EntityId, now: number) => FractionalPosition | null,
    private readonly ground: Ground,
  ) {
    this.glow.blendMode = 'add';
    this.container.addChild(this.graphics, this.glow);
  }

  addSpell(spell: SpellKey, casterId: EntityId, targetId: EntityId, now: number): void {
    const fx = SPELL_FX[spell];
    this.effects.push({ fx, durationMs: fx.durationMs, casterId, targetId, startedAt: now });
  }

  addArrow(casterId: EntityId, targetId: EntityId, now: number): void {
    this.effects.push({
      fx: 'arrow',
      durationMs: SHOT_MS.arrow,
      casterId,
      targetId,
      startedAt: now,
    });
  }

  /** Un cañonazo de un tile a otro. */
  addShot(from: FractionalPosition, to: FractionalPosition, hit: boolean, now: number): void {
    const fx: Shot = hit ? 'cannon-hit' : 'cannon-miss';
    this.effects.push({
      fx,
      durationMs: SHOT_MS[fx],
      casterId: '',
      targetId: '',
      startedAt: now,
      from,
      to,
    });
  }

  update(now: number): void {
    const g = this.graphics.clear();
    const light = this.glow.clear();
    this.effects = this.effects.filter((e) => now - e.startedAt < e.durationMs);
    for (const effect of this.effects) {
      const target = effect.to ?? this.positionOf(effect.targetId, now);
      const caster = effect.from ?? this.positionOf(effect.casterId, now) ?? target;
      if (!target || !caster) continue;
      const feet = this.ground.toScreen(target);
      const origin = this.ground.toScreen(caster);
      const c: FxContext = {
        g,
        light,
        from: { x: origin.x, y: origin.y - CHEST_Y },
        to: { x: feet.x, y: feet.y - CHEST_Y },
        feet,
        t: (now - effect.startedAt) / effect.durationMs,
        seed: effect.startedAt,
      };
      if (typeof effect.fx !== 'string') paintFx(effect.fx, c);
      else if (effect.fx === 'arrow') arrow(g, c.from, c.to, c.t);
      else cannonball(c, effect.fx === 'cannon-hit');
    }
  }
}

/** La bala de cañón: oscura; al llegar estalla (si dio en algo) o salpica el agua. */
function cannonball(c: FxContext, hit: boolean): void {
  const travel = 0.6;
  if (c.t < travel) {
    projectile(
      { ...c, t: c.t / travel },
      { shape: 'orb', color: 0x2a2a30, glow: 0x6a6a70, size: 4, travel: 1 },
    );
    return;
  }
  const k = (c.t - travel) / (1 - travel);
  if (hit) explosion(c, c.to, 10, k);
  else c.light.circle(c.to.x, c.to.y, 6 + k * 14).fill({ color: 0xd8f0ff, alpha: 0.6 * (1 - k) });
}

/** Una flecha: una línea corta que vuela recta hasta el objetivo. */
function arrow(g: Graphics, from: Point, to: Point, t: number): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const x = from.x + dx * t;
  const y = from.y + dy * t;
  const ux = (dx / length) * 9;
  const uy = (dy / length) * 9;
  g.moveTo(x - ux, y - uy)
    .lineTo(x, y)
    .stroke({ color: 0xe8dcc0, width: 2 });
}
