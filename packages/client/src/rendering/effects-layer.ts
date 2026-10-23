import { SPELLS, type SpellKey } from '@fenix/shared/magic/spell-catalog';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { Container, Graphics } from 'pixi.js';
import type { FractionalPosition } from '../core/entity';
import type { Ground } from './ground';
import { FIRE_COLORS, hash, paletteAt } from './particles';

/** Altura del pecho sobre los pies: de ahí salen y ahí llegan los hechizos. */
const CHEST_Y = 40;

/** Cómo se ve un efecto: con qué forma se anima, sus colores y cuánto dura. */
interface Visual {
  readonly style:
    | 'projectile'
    | 'arrow'
    | 'sparkles'
    | 'sink'
    | 'ring'
    | 'bolt'
    | 'column'
    | 'burst'
    /** Fuego con partículas: una bola que deja estela, una columna que sube, un estallido. */
    | 'fireball'
    | 'fire-column'
    | 'fire-burst';
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
  /** Para lo que va de un lugar a otro (un cañonazo), en vez de entre dos personajes. */
  readonly from?: FractionalPosition;
  readonly to?: FractionalPosition;
}

/** Proyectiles y destellos propios de algunos hechizos; el resto sale de lo que hacen. */
const SPELL_VISUALS: Partial<Record<SpellKey, Visual>> = {
  'magic-arrow': { style: 'fireball', color: 0xfff2a0, glow: 0xffd040, durationMs: 500, size: 3 },
  harm: { style: 'burst', color: 0xd04060, glow: 0x801030, durationMs: 500, size: 10 },
  fireball: { style: 'fireball', color: 0xffb040, glow: 0xff5a1a, durationMs: 800, size: 6 },
  lightning: { style: 'bolt', color: 0xf4f8ff, glow: 0x80b0ff, durationMs: 450, size: 3 },
  'mind-blast': { style: 'ring', color: 0xd0a0ff, glow: 0x8040c0, durationMs: 600, size: 40 },
  'energy-bolt': { style: 'projectile', color: 0xd8ecff, glow: 0x4080ff, durationMs: 650, size: 7 },
  explosion: { style: 'fire-burst', color: 0xffd060, glow: 0xff4010, durationMs: 900, size: 30 },
  flamestrike: {
    style: 'fire-column',
    color: 0xffc050,
    glow: 0xff3a10,
    durationMs: 1300,
    size: 16,
  },
  'mana-drain': { style: 'sink', color: 0x60a0ff, glow: 0x2050c0, durationMs: 800, size: 8 },
  'mana-vampire': { style: 'sink', color: 0x8060ff, glow: 0x4020c0, durationMs: 900, size: 10 },
  light: { style: 'ring', color: 0xfff0a0, glow: 0xfff0a0, durationMs: 600, size: 50 },
  teleport: { style: 'sparkles', color: 0xc080ff, glow: 0xc080ff, durationMs: 700, size: 12 },
  protection: { style: 'ring', color: 0xffd860, glow: 0xffd860, durationMs: 700, size: 30 },
  paralyze: { style: 'ring', color: 0x80f0ff, glow: 0x80f0ff, durationMs: 800, size: 22 },
  poison: { style: 'sink', color: 0x70e060, glow: 0x308020, durationMs: 800, size: 8 },
  cure: { style: 'sparkles', color: 0xf0fff0, glow: 0xf0fff0, durationMs: 700, size: 8 },
  'create-food': { style: 'sparkles', color: 0xffe080, glow: 0xffe080, durationMs: 700, size: 6 },
  'chain-lightning': { style: 'bolt', color: 0xf0f6ff, glow: 0x6090ff, durationMs: 500, size: 4 },
  'meteor-swarm': {
    style: 'fire-burst',
    color: 0xffa040,
    glow: 0xff3010,
    durationMs: 1000,
    size: 36,
  },
  'reactive-armor': { style: 'ring', color: 0xffb070, glow: 0xffb070, durationMs: 700, size: 30 },
  'magic-reflection': {
    style: 'ring',
    color: 0xe0e8ff,
    glow: 0xe0e8ff,
    durationMs: 700,
    size: 34,
  },
  incognito: { style: 'sparkles', color: 0xd0b0ff, glow: 0xd0b0ff, durationMs: 900, size: 12 },
  polymorph: { style: 'sparkles', color: 0xa0ffb0, glow: 0xa0ffb0, durationMs: 1000, size: 16 },
  dispel: { style: 'sink', color: 0xf0f0ff, glow: 0x8080ff, durationMs: 800, size: 14 },
  'mass-dispel': { style: 'sink', color: 0xf0f0ff, glow: 0x8080ff, durationMs: 800, size: 14 },
  'dispel-field': { style: 'sparkles', color: 0xf0f0ff, glow: 0x8080ff, durationMs: 700, size: 10 },
  'magic-lock': { style: 'sparkles', color: 0xffe090, glow: 0xffc040, durationMs: 700, size: 8 },
  unlock: { style: 'sparkles', color: 0xc0e0ff, glow: 0x80b0ff, durationMs: 700, size: 8 },
  telekinesis: { style: 'sparkles', color: 0xd0c0ff, glow: 0x9080ff, durationMs: 700, size: 8 },
  'mass-curse': { style: 'sink', color: 0x9050c0, glow: 0x501080, durationMs: 900, size: 30 },
  'arch-cure': { style: 'ring', color: 0xf0fff0, glow: 0xa0ffa0, durationMs: 800, size: 46 },
  'arch-protection': { style: 'ring', color: 0xffd860, glow: 0xffd860, durationMs: 800, size: 46 },
  'magic-trap': { style: 'sparkles', color: 0xff8060, glow: 0xff4020, durationMs: 700, size: 8 },
  'magic-untrap': { style: 'sparkles', color: 0xc0d0ff, glow: 0x8090ff, durationMs: 700, size: 8 },
  'wall-of-stone': {
    style: 'sparkles',
    color: 0xc8c0b0,
    glow: 0x8a8070,
    durationMs: 700,
    size: 10,
  },
  'fire-field': { style: 'sparkles', color: 0xffb040, glow: 0xff5010, durationMs: 700, size: 10 },
  'poison-field': { style: 'sparkles', color: 0x90e070, glow: 0x308020, durationMs: 700, size: 10 },
  'paralyze-field': {
    style: 'sparkles',
    color: 0xb0f0ff,
    glow: 0x60c0ff,
    durationMs: 700,
    size: 10,
  },
  'energy-field': { style: 'sparkles', color: 0xc0d8ff, glow: 0x4080ff, durationMs: 700, size: 12 },
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

/** La bala de cañón: oscura, y al llegar estalla (si dio en algo) o salpica el agua. */
const CANNON_HIT: Visual = {
  style: 'projectile',
  color: 0x2a2a30,
  glow: 0xff7a30,
  durationMs: 900,
  size: 5,
};
const CANNON_MISS: Visual = {
  style: 'projectile',
  color: 0x2a2a30,
  glow: 0xd8f0ff,
  durationMs: 900,
  size: 5,
};

const ARROW: Visual = { style: 'arrow', color: 0xe8dcc0, glow: 0x6a4a2a, durationMs: 300, size: 1 };

/** Efectos de hechizos y flechas, dibujados con formas simples que se animan por frame. */
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
    this.effects.push({ visual: visualFor(spell), casterId, targetId, startedAt: now });
  }

  addArrow(casterId: EntityId, targetId: EntityId, now: number): void {
    this.effects.push({ visual: ARROW, casterId, targetId, startedAt: now });
  }

  /** Un cañonazo de un tile a otro. */
  addShot(from: FractionalPosition, to: FractionalPosition, hit: boolean, now: number): void {
    this.effects.push({
      visual: hit ? CANNON_HIT : CANNON_MISS,
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
    this.effects = this.effects.filter((e) => now - e.startedAt < e.visual.durationMs);
    for (const effect of this.effects) {
      const { visual } = effect;
      const t = (now - effect.startedAt) / visual.durationMs;
      const target = effect.to ?? this.positionOf(effect.targetId, now);
      const caster = effect.from ?? this.positionOf(effect.casterId, now) ?? target;
      if (!target || !caster) continue;
      const to = chest(this.ground, target);
      const from = chest(this.ground, caster);

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
        case 'fireball':
          fireball(light, from, to, t, visual.size, effect.startedAt);
          break;
        case 'fire-column':
          fireColumn(g, light, to, t, visual.size, effect.startedAt);
          break;
        case 'fire-burst':
          fireBurst(g, light, to, t, visual.size, effect.startedAt);
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

/**
 * Bola de fuego: viaja dejando una estela de llamas que se achican y se
 * apagan; al llegar estalla en chispas.
 */
function fireball(
  g: Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  t: number,
  radius: number,
  seed: number,
): void {
  const travel = 0.6;
  const at = (k: number): { x: number; y: number } => ({
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
  });
  if (t < travel) {
    const k = t / travel;
    // Estela: llamas que quedaron atrás, cada vez más rojas y chicas.
    const trail = Math.round(6 + radius * 2);
    for (let i = trail; i >= 1; i--) {
      const back = k - i * 0.022;
      if (back < 0) continue;
      const age = i / trail;
      const p = at(back);
      const jx = (hash(seed, i, 1) - 0.5) * radius * 1.6 * age;
      const jy = (hash(seed, i, 2) - 0.5) * radius * 1.6 * age - age * 4;
      g.circle(p.x + jx, p.y + jy, radius * (1 - age * 0.75)).fill({
        color: paletteAt(FIRE_COLORS, 0.25 + age * 0.75),
        alpha: 0.8 * (1 - age),
      });
    }
    const p = at(k);
    g.circle(p.x, p.y, radius * 2.2).fill({ color: 0xff6a1a, alpha: 0.35 });
    g.circle(p.x, p.y, radius * 1.2).fill({ color: FIRE_COLORS[1] ?? 0xffd860, alpha: 0.95 });
    g.circle(p.x, p.y, radius * 0.6).fill({ color: FIRE_COLORS[0] ?? 0xffffff });
    return;
  }
  // Al llegar: chispas que salen para todos lados y caen.
  const k = (t - travel) / (1 - travel);
  g.circle(to.x, to.y, radius * (1.5 + k * 3)).fill({ color: 0xff6a1a, alpha: 0.5 * (1 - k) });
  const sparks = Math.round(8 + radius * 2);
  for (let i = 0; i < sparks; i++) {
    const angle = hash(seed, i, 3) * Math.PI * 2;
    const speed = (10 + hash(seed, i, 4) * 18) * (radius / 5);
    const x = to.x + Math.cos(angle) * speed * k;
    const y = to.y + Math.sin(angle) * speed * k * 0.7 + k * k * 10;
    g.circle(x, y, Math.max(0.8, radius * 0.45 * (1 - k))).fill({
      color: paletteAt(FIRE_COLORS, k),
      alpha: 1 - k,
    });
  }
}

/**
 * Columna de fuego: llamas que suben desde los pies del objetivo y lo
 * envuelven, con humo arriba; crece rápido, arde y se apaga.
 */
function fireColumn(
  smoke: Graphics,
  g: Graphics,
  at: { x: number; y: number },
  t: number,
  width: number,
  seed: number,
): void {
  const feet = at.y + CHEST_Y;
  const strength = Math.min(1, t * 4) * (t > 0.7 ? (1 - t) / 0.3 : 1);
  const now = t * 1300;
  g.ellipse(at.x, feet, width * 1.6, width * 0.6).fill({ color: 0xff6a1a, alpha: 0.35 * strength });
  for (let i = 0; i < 6; i++) {
    const a = ((now + hash(seed, i, 5) * 900) % 900) / 900;
    smoke
      .circle(at.x + (hash(seed, i, 6) - 0.5) * width, feet - 70 - a * 30, 5 + a * 8)
      .fill({ color: 0x3a3430, alpha: 0.3 * (1 - a) * strength });
  }
  const count = 46;
  for (let i = 0; i < count; i++) {
    const life = 350 + hash(seed, i, 7) * 350;
    const a = ((now + hash(seed, i, 8) * life * 5) % life) / life;
    const angle = hash(seed, i, 9) * Math.PI * 2 + now * 0.004;
    const r = width * (0.4 + hash(seed, i, 10) * 0.7) * (1 - a * 0.4);
    const x = at.x + Math.cos(angle) * r;
    const y = feet + Math.sin(angle) * r * 0.35 - a * (60 + hash(seed, i, 11) * 30);
    const size = (4 + hash(seed, i, 12) * 4) * (1 - a * 0.7);
    g.circle(x, y, size).fill({
      color: paletteAt(FIRE_COLORS, a),
      alpha: 0.85 * (1 - a) * strength,
    });
  }
}

/** Estallido de fuego (Explosión, meteoritos): una bola que se abre, llamas que vuelan y humo. */
function fireBurst(
  smoke: Graphics,
  g: Graphics,
  at: { x: number; y: number },
  t: number,
  size: number,
  seed: number,
): void {
  const core = size * (0.3 + t * 0.9);
  g.circle(at.x, at.y, core * 1.4).fill({ color: 0xff5a14, alpha: 0.45 * (1 - t) });
  g.circle(at.x, at.y, core * 0.7).fill({
    color: FIRE_COLORS[0] ?? 0xffffff,
    alpha: Math.max(0, 1 - t * 2),
  });
  for (let i = 0; i < 8; i++) {
    const angle = hash(seed, i, 13) * Math.PI * 2;
    const r = size * (0.4 + t * 0.9);
    smoke
      .circle(
        at.x + Math.cos(angle) * r,
        at.y + Math.sin(angle) * r * 0.6 - t * 18,
        size * 0.25 * (0.5 + t),
      )
      .fill({ color: 0x3a3430, alpha: 0.35 * t * (1 - t) * 2 });
  }
  const count = 36;
  for (let i = 0; i < count; i++) {
    const angle = hash(seed, i, 14) * Math.PI * 2;
    const speed = size * (0.6 + hash(seed, i, 15) * 1.1);
    const k = Math.min(1, t * (1 + hash(seed, i, 16)));
    const x = at.x + Math.cos(angle) * speed * k;
    const y = at.y + Math.sin(angle) * speed * k * 0.65 - k * 10 + k * k * 14;
    g.circle(x, y, (3 + hash(seed, i, 17) * 4) * (1 - k * 0.8)).fill({
      color: paletteAt(FIRE_COLORS, k),
      alpha: 0.9 * (1 - k),
    });
  }
}

function chest(ground: Ground, position: FractionalPosition): { x: number; y: number } {
  const screen = ground.toScreen(position);
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
