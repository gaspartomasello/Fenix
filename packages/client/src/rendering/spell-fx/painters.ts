import type { Graphics } from 'pixi.js';
import { FIRE_COLORS, hash, mix, paletteAt } from '../particles';

/**
 * Los trazos con que se arman los efectos de los hechizos. Cada uno dibuja un
 * momento (`t` de 0 a 1) sin guardar nada: las partículas salen de una semilla
 * fija y del tiempo. `g` dibuja normal (humo, sombras, grietas); `light` suma
 * luz (fuego, rayos, brillos).
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface FxContext {
  readonly g: Graphics;
  readonly light: Graphics;
  /** Pecho del lanzador y del objetivo. */
  readonly from: Point;
  readonly to: Point;
  /** Pies del objetivo (el piso). */
  readonly feet: Point;
  readonly t: number;
  readonly seed: number;
}

/** Sube rápido, se mantiene y se apaga al final. */
export function envelope(t: number, rise = 0.15, fall = 0.3): number {
  if (t < rise) return t / rise;
  if (t > 1 - fall) return Math.max(0, (1 - t) / fall);
  return 1;
}

const lerp = (a: Point, b: Point, k: number): Point => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
});

// ---------------------------------------------------------------- proyectiles

export type ProjectileShape =
  /** Bola de luz con halo. */
  | 'orb'
  /** Flecha de luz: una estela fina y larga. */
  | 'streak'
  /** Bola de fuego con estela de llamas. */
  | 'fire'
  /** Esfera de energía que chisporrotea. */
  | 'energy'
  /** Bruma oscura que ondula. */
  | 'shadow';

export interface ProjectileSpec {
  readonly shape: ProjectileShape;
  readonly color: number;
  readonly glow: number;
  readonly size: number;
  /** Parte del tiempo que tarda en llegar (el resto es el impacto). */
  readonly travel: number;
}

/** Algo que viaja del lanzador al objetivo. Devuelve si ya llegó. */
export function projectile(c: FxContext, p: ProjectileSpec): boolean {
  if (c.t >= p.travel) return true;
  const k = c.t / p.travel;
  // Un arco suave hacia arriba: no viaja pegado al piso.
  const height = p.shape === 'streak' ? 6 : 14;
  const at = (q: number): Point => {
    const base = lerp(c.from, c.to, Math.max(0, q));
    return { x: base.x, y: base.y - Math.sin(Math.max(0, q) * Math.PI) * height };
  };
  const head = at(k);
  const L = c.light;
  switch (p.shape) {
    case 'orb':
      L.circle(head.x, head.y, p.size * 2.4).fill({ color: p.glow, alpha: 0.3 });
      L.circle(head.x, head.y, p.size).fill({ color: p.color });
      for (let i = 1; i <= 5; i++) {
        const back = at(k - i * 0.04);
        L.circle(back.x, back.y, p.size * (1 - i * 0.16)).fill({
          color: p.glow,
          alpha: 0.35 * (1 - i / 6),
        });
      }
      break;
    case 'streak': {
      const tail = at(k - 0.22);
      L.moveTo(tail.x, tail.y)
        .lineTo(head.x, head.y)
        .stroke({ color: p.glow, width: p.size * 2.6, alpha: 0.35, cap: 'round' });
      L.moveTo(tail.x, tail.y)
        .lineTo(head.x, head.y)
        .stroke({ color: p.color, width: p.size, cap: 'round' });
      L.circle(head.x, head.y, p.size * 1.4).fill({ color: 0xffffff });
      break;
    }
    case 'fire': {
      const trail = Math.round(8 + p.size * 2);
      for (let i = trail; i >= 1; i--) {
        const q = k - i * 0.022;
        if (q < 0) continue;
        const age = i / trail;
        const b = at(q);
        const jx = (hash(c.seed, i, 1) - 0.5) * p.size * 1.6 * age;
        const jy = (hash(c.seed, i, 2) - 0.5) * p.size * 1.6 * age - age * 6;
        L.circle(b.x + jx, b.y + jy, p.size * (1 - age * 0.75)).fill({
          color: paletteAt(FIRE_COLORS, 0.2 + age * 0.8),
          alpha: 0.85 * (1 - age),
        });
      }
      L.circle(head.x, head.y, p.size * 2.3).fill({ color: p.glow, alpha: 0.35 });
      L.circle(head.x, head.y, p.size * 1.2).fill({ color: p.color, alpha: 0.95 });
      L.circle(head.x, head.y, p.size * 0.55).fill({ color: 0xffffff });
      break;
    }
    case 'energy': {
      L.circle(head.x, head.y, p.size * 2.6).fill({ color: p.glow, alpha: 0.3 });
      L.circle(head.x, head.y, p.size * 1.2).fill({ color: p.color });
      // Chispazos que salen de la esfera y cambian en cada cuadro.
      const frame = Math.floor(c.t * 40);
      for (let i = 0; i < 4; i++) {
        const angle = hash(c.seed + frame, i, 3) * Math.PI * 2;
        const r = p.size * (1.6 + hash(c.seed + frame, i, 4) * 1.4);
        const mid = {
          x: head.x + Math.cos(angle + 0.4) * r * 0.5,
          y: head.y + Math.sin(angle + 0.4) * r * 0.5,
        };
        L.moveTo(head.x, head.y)
          .lineTo(mid.x, mid.y)
          .lineTo(head.x + Math.cos(angle) * r, head.y + Math.sin(angle) * r)
          .stroke({ color: p.color, width: 1.2, alpha: 0.9 });
      }
      for (let i = 1; i <= 6; i++) {
        const back = at(k - i * 0.03);
        L.circle(back.x, back.y, p.size * 0.5).fill({ color: p.glow, alpha: 0.4 * (1 - i / 7) });
      }
      break;
    }
    case 'shadow':
      for (let i = 0; i < 9; i++) {
        const b = at(k - i * 0.03);
        const wob = Math.sin(c.t * 30 + i) * p.size * 0.6;
        c.g.circle(b.x + wob, b.y + Math.cos(c.t * 26 + i) * 3, p.size * (1.3 - i * 0.1)).fill({
          color: i === 0 ? p.color : p.glow,
          alpha: 0.75 * (1 - i / 9),
        });
      }
      L.circle(head.x, head.y, p.size * 0.5).fill({ color: p.color, alpha: 0.9 });
      break;
  }
  return false;
}

/** Cuánto lleva el impacto (0–1) después de un viaje que dura `travel`. */
export function afterTravel(t: number, travel: number): number {
  return travel >= 1 ? 0 : Math.max(0, (t - travel) / (1 - travel));
}

// ---------------------------------------------------------------- partículas

export interface BurstSpec {
  readonly count: number;
  readonly colors: readonly number[];
  /** Distancia que recorren. */
  readonly reach: number;
  readonly size: number;
  /** Cuánto caen al final (gravedad) y cuánto suben. */
  readonly gravity: number;
  readonly lift: number;
  /** Aplastado contra el piso (perspectiva). */
  readonly flatten: number;
  readonly additive: boolean;
}

/** Estallido de partículas que salen de un punto (`k` de 0 a 1). */
export function burst(c: FxContext, at: Point, k: number, s: BurstSpec, salt: number): void {
  if (k <= 0 || k >= 1) return;
  const target = s.additive ? c.light : c.g;
  for (let i = 0; i < s.count; i++) {
    const angle = hash(c.seed, i, salt) * Math.PI * 2;
    const speed = s.reach * (0.35 + hash(c.seed, i, salt + 1) * 0.65);
    const life = Math.min(1, k * (1 + hash(c.seed, i, salt + 2) * 0.8));
    const ease = 1 - (1 - life) * (1 - life);
    const x = at.x + Math.cos(angle) * speed * ease;
    const y =
      at.y + Math.sin(angle) * speed * ease * s.flatten - s.lift * ease + s.gravity * life * life;
    const size = s.size * (0.5 + hash(c.seed, i, salt + 3)) * (1 - life * 0.7);
    target.circle(x, y, Math.max(0.6, size)).fill({
      color: paletteAt(s.colors, life),
      alpha: 1 - life,
    });
  }
}

export type MoteShape = 'dot' | 'cross' | 'star' | 'diamond' | 'drop' | 'ring';

export interface AuraSpec {
  readonly count: number;
  readonly color: number;
  readonly glow: number;
  readonly shape: MoteShape;
  /** −1 sube (refuerzo), +1 cae (maldición). */
  readonly direction: 1 | -1;
  /** Radio alrededor del cuerpo. */
  readonly radius: number;
  /** Vueltas que dan alrededor del cuerpo. */
  readonly spin: number;
  readonly size: number;
}

/** Partículas alrededor del cuerpo que suben o caen girando. */
export function aura(c: FxContext, a: AuraSpec): void {
  const strength = envelope(c.t, 0.1, 0.35);
  for (let i = 0; i < a.count; i++) {
    const phase = hash(c.seed, i, 21);
    const life = (c.t * 1.6 + phase) % 1;
    const angle = phase * Math.PI * 2 + c.t * a.spin * Math.PI * 2;
    const x = c.feet.x + Math.cos(angle) * a.radius;
    const depth = Math.sin(angle);
    const height = a.direction < 0 ? life * 70 : (1 - life) * 70;
    const y = c.feet.y - height + depth * a.radius * 0.35;
    const alpha = strength * Math.sin(life * Math.PI) * (depth < 0 ? 0.55 : 1);
    mote(depth < 0 ? c.g : c.light, x, y, a.size, a.shape, a.color, alpha);
  }
  c.light
    .ellipse(c.feet.x, c.feet.y, a.radius * 1.3, a.radius * 0.45)
    .fill({ color: a.glow, alpha: 0.22 * strength });
}

/** Una partícula con forma. */
export function mote(
  g: Graphics,
  x: number,
  y: number,
  size: number,
  shape: MoteShape,
  color: number,
  alpha: number,
): void {
  if (alpha <= 0) return;
  switch (shape) {
    case 'dot':
      g.circle(x, y, size).fill({ color, alpha });
      break;
    case 'cross':
      g.rect(x - size * 0.35, y - size * 1.2, size * 0.7, size * 2.4).fill({ color, alpha });
      g.rect(x - size * 1.2, y - size * 0.35, size * 2.4, size * 0.7).fill({ color, alpha });
      break;
    case 'star':
      g.star(x, y, 4, size * 1.5, size * 0.45).fill({ color, alpha });
      break;
    case 'diamond':
      g.poly([x, y - size * 1.4, x + size * 0.8, y, x, y + size * 1.4, x - size * 0.8, y]).fill({
        color,
        alpha,
      });
      break;
    case 'drop':
      g.circle(x, y, size * 0.8).fill({ color, alpha });
      g.poly([
        x - size * 0.7,
        y - size * 0.2,
        x + size * 0.7,
        y - size * 0.2,
        x,
        y - size * 2,
      ]).fill({ color, alpha });
      break;
    case 'ring':
      g.circle(x, y, size).stroke({ color, alpha, width: 1.2 });
      break;
  }
}

// ---------------------------------------------------------------- en el piso

export type GroundStyle =
  /** Un anillo que se abre. */
  | 'pulse'
  /** Anillo con marcas, como un círculo rúnico. */
  | 'runic'
  /** Estrella de cinco puntas dentro del círculo (invocaciones). */
  | 'pentagram'
  /** Grietas en el piso que se abren (terremoto). */
  | 'cracks';

export interface GroundSpec {
  readonly style: GroundStyle;
  readonly color: number;
  readonly radius: number;
}

/** Algo dibujado en el piso, alrededor de los pies. */
export function ground(c: FxContext, s: GroundSpec): void {
  const { x, y } = c.feet;
  const strength = envelope(c.t, 0.15, 0.35);
  const ry = 0.42;
  switch (s.style) {
    case 'pulse':
      for (let i = 0; i < 3; i++) {
        const k = (c.t * 1.5 + i / 3) % 1;
        c.light
          .ellipse(x, y, s.radius * k, s.radius * k * ry)
          .stroke({ color: s.color, width: 2.5, alpha: (1 - k) * strength });
      }
      break;
    case 'runic': {
      const r = s.radius * Math.min(1, c.t * 3);
      c.light.ellipse(x, y, r, r * ry).stroke({ color: s.color, width: 2, alpha: strength });
      c.light
        .ellipse(x, y, r * 0.78, r * 0.78 * ry)
        .stroke({ color: s.color, width: 1, alpha: strength * 0.8 });
      const marks = 10;
      for (let i = 0; i < marks; i++) {
        const angle = (i / marks) * Math.PI * 2 + c.t * 2;
        const px = x + Math.cos(angle) * r * 0.89;
        const py = y + Math.sin(angle) * r * 0.89 * ry;
        c.light.rect(px - 1.5, py - 1.5, 3, 3).fill({ color: s.color, alpha: strength });
      }
      break;
    }
    case 'pentagram': {
      const r = s.radius * Math.min(1, c.t * 2.5);
      c.light.ellipse(x, y, r, r * ry).stroke({ color: s.color, width: 2, alpha: strength });
      const points: number[] = [];
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI / 2 + ((i * 2) % 5) * ((Math.PI * 2) / 5) + c.t * 0.8;
        points.push(x + Math.cos(angle) * r, y + Math.sin(angle) * r * ry);
      }
      c.light.poly(points).stroke({ color: s.color, width: 1.5, alpha: strength });
      c.light.ellipse(x, y, r * 0.6, r * 0.6 * ry).fill({ color: s.color, alpha: 0.12 * strength });
      break;
    }
    case 'cracks':
      for (let i = 0; i < 7; i++) {
        const angle = hash(c.seed, i, 31) * Math.PI * 2;
        const length = s.radius * (0.5 + hash(c.seed, i, 32) * 0.5) * Math.min(1, c.t * 3);
        let px = x;
        let py = y;
        c.g.moveTo(px, py);
        for (let j = 1; j <= 4; j++) {
          const d = (length * j) / 4;
          const bend = (hash(c.seed, i, 33 + j) - 0.5) * 0.6;
          px = x + Math.cos(angle + bend) * d;
          py = y + Math.sin(angle + bend) * d * ry;
          c.g.lineTo(px, py);
        }
        c.g.stroke({ color: s.color, width: 2.5, alpha: strength });
      }
      break;
  }
}

// ---------------------------------------------------------------- alrededor

export type ShellStyle =
  /** Cúpula de facetas (protección). */
  | 'facets'
  /** Superficie que brilla como un espejo (reflejo mágico). */
  | 'mirror'
  /** Púas que salen del cuerpo (armadura reactiva). */
  | 'spikes'
  /** Cristales de hielo alrededor de los pies (parálisis). */
  | 'crystals';

export interface ShellSpec {
  readonly style: ShellStyle;
  readonly color: number;
  readonly glow: number;
  readonly radius: number;
}

/** Una cúpula, púas o cristales que envuelven al objetivo. */
export function shell(c: FxContext, s: ShellSpec): void {
  const strength = envelope(c.t, 0.2, 0.35);
  const cx = c.feet.x;
  const base = c.feet.y;
  const r = s.radius * (0.7 + Math.min(1, c.t * 4) * 0.3);
  switch (s.style) {
    case 'facets': {
      c.light
        .ellipse(cx, base - r * 0.55, r, r * 1.05)
        .fill({ color: s.glow, alpha: 0.12 * strength });
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI + c.t * 1.5;
        const w = Math.cos(angle) * r;
        c.light
          .ellipse(cx, base - r * 0.55, Math.abs(w), r * 1.05)
          .stroke({ color: s.color, width: 1, alpha: 0.5 * strength });
      }
      c.light
        .ellipse(cx, base - r * 0.55, r, r * 1.05)
        .stroke({ color: s.color, width: 2, alpha: strength });
      break;
    }
    case 'mirror': {
      c.light
        .ellipse(cx, base - r * 0.55, r, r * 1.05)
        .stroke({ color: s.color, width: 2.5, alpha: strength });
      // Un brillo que recorre la superficie.
      const sweep = ((c.t * 2) % 1) * Math.PI;
      for (let i = 0; i < 3; i++) {
        const a = sweep + i * 0.12;
        const px = cx + Math.cos(a) * r * 0.9;
        const py = base - r * 0.55 - Math.sin(a) * r * 0.95;
        c.light.circle(px, py, 3 - i).fill({ color: 0xffffff, alpha: strength * (1 - i * 0.3) });
      }
      c.light
        .ellipse(cx, base - r * 0.55, r * 0.85, r * 0.9)
        .fill({ color: s.glow, alpha: 0.1 * strength });
      break;
    }
    case 'spikes':
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const out = r * (0.6 + 0.4 * Math.sin(c.t * 10 + i));
        const sx = cx + Math.cos(angle) * 6;
        const sy = base - 30 + Math.sin(angle) * 14;
        c.light
          .moveTo(sx, sy)
          .lineTo(cx + Math.cos(angle) * out, base - 30 + Math.sin(angle) * out * 0.8)
          .stroke({ color: i % 2 ? s.color : s.glow, width: 2, alpha: strength });
      }
      break;
    case 'crystals':
      for (let i = 0; i < 9; i++) {
        const angle = (i / 9) * Math.PI * 2 + 0.3;
        const px = cx + Math.cos(angle) * r * 0.8;
        const py = base + Math.sin(angle) * r * 0.3;
        const h = (14 + hash(c.seed, i, 41) * 22) * Math.min(1, c.t * 4);
        const w = 3 + hash(c.seed, i, 42) * 3;
        const target = Math.sin(angle) < 0 ? c.g : c.light;
        target
          .poly([px - w, py, px, py - h, px + w, py])
          .fill({ color: s.color, alpha: 0.75 * strength });
        target
          .poly([px, py, px, py - h, px + w, py])
          .fill({ color: s.glow, alpha: 0.5 * strength });
      }
      break;
  }
}

/** Una espiral de luz que sube enroscada al cuerpo (transformaciones). */
export function spiral(
  c: FxContext,
  colors: readonly number[],
  turns: number,
  radius: number,
  strands: number,
): void {
  const strength = envelope(c.t, 0.15, 0.3);
  const steps = 26;
  for (let s = 0; s < strands; s++) {
    for (let i = 0; i < steps; i++) {
      const k = i / steps;
      const angle = k * turns * Math.PI * 2 + c.t * 9 + (s * Math.PI * 2) / strands;
      const depth = Math.sin(angle);
      const x = c.feet.x + Math.cos(angle) * radius * (1 - k * 0.3);
      const y = c.feet.y - k * 80 * Math.min(1, c.t * 2.5) + depth * radius * 0.3;
      (depth < 0 ? c.g : c.light)
        .circle(x, y, 2.4 * (1 - k * 0.5))
        .fill({ color: paletteAt(colors, k), alpha: strength * (depth < 0 ? 0.5 : 1) });
    }
  }
}

/** Partículas que fluyen del objetivo al lanzador (robo de maná, vampirismo). */
export function stream(c: FxContext, color: number, glow: number, count: number): void {
  const strength = envelope(c.t, 0.1, 0.25);
  for (let i = 0; i < count; i++) {
    const k = (c.t * 1.8 + hash(c.seed, i, 51)) % 1;
    const p = lerp(c.to, c.from, k);
    const wave = Math.sin(k * Math.PI * 3 + i) * 10 * Math.sin(k * Math.PI);
    c.light.circle(p.x + wave, p.y - Math.sin(k * Math.PI) * 18, 2.6).fill({
      color: k < 0.5 ? glow : color,
      alpha: strength * Math.sin(k * Math.PI),
    });
  }
}

// ---------------------------------------------------------------- rayos

/** Un camino quebrado de rayo entre dos puntos, distinto en cada cuadro. */
function zigzag(a: Point, b: Point, segments: number, jitter: number, seed: number): number[] {
  const points = [a.x, a.y];
  for (let i = 1; i < segments; i++) {
    const k = i / segments;
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    const length = Math.hypot(nx, ny) || 1;
    const off = (hash(seed, i, 61) - 0.5) * 2 * jitter;
    points.push(
      a.x + (b.x - a.x) * k + (nx / length) * off,
      a.y + (b.y - a.y) * k + (ny / length) * off,
    );
  }
  points.push(b.x, b.y);
  return points;
}

function strokePath(
  g: Graphics,
  points: number[],
  color: number,
  width: number,
  alpha: number,
): void {
  g.moveTo(points[0] ?? 0, points[1] ?? 0);
  for (let i = 2; i < points.length; i += 2) g.lineTo(points[i] ?? 0, points[i + 1] ?? 0);
  g.stroke({ color, width, alpha, cap: 'round', join: 'round' });
}

export interface BoltSpec {
  readonly color: number;
  readonly glow: number;
  /** Desde qué altura cae (en píxeles sobre los pies). */
  readonly height: number;
  readonly branches: number;
}

/**
 * Un rayo que cae del cielo sobre el objetivo: largo, quebrado, con ramas,
 * que parpadea, deja un fogonazo en el piso y chispas.
 */
export function skyBolt(c: FxContext, s: BoltSpec): void {
  const frame = Math.floor(c.t * 30);
  const flicker = frame % 3 === 2 ? 0.45 : 1;
  const strength = (c.t < 0.55 ? 1 : (1 - c.t) / 0.45) * flicker;
  const top = { x: c.feet.x + (hash(c.seed, 0, 62) - 0.5) * 60, y: c.feet.y - s.height };
  const main = zigzag(top, c.feet, 14, 16, c.seed * 31 + frame);
  strokePath(c.light, main, s.glow, 12, 0.3 * strength);
  strokePath(c.light, main, s.glow, 5, 0.6 * strength);
  strokePath(c.light, main, s.color, 2, strength);
  for (let b = 0; b < s.branches; b++) {
    const at = 4 + Math.floor(hash(c.seed, b, 63) * 7);
    const sx = main[at * 2] ?? c.feet.x;
    const sy = main[at * 2 + 1] ?? c.feet.y;
    const side = hash(c.seed + frame, b, 64) < 0.5 ? -1 : 1;
    const end = {
      x: sx + side * (25 + hash(c.seed, b, 65) * 30),
      y: sy + 30 + hash(c.seed, b, 66) * 30,
    };
    const branch = zigzag({ x: sx, y: sy }, end, 5, 7, c.seed * 17 + frame + b);
    strokePath(c.light, branch, s.color, 1.2, 0.8 * strength);
  }
  // Fogonazo donde pega y luz en el piso.
  c.light.circle(c.feet.x, c.feet.y - 20, 26).fill({ color: s.glow, alpha: 0.35 * strength });
  c.light.ellipse(c.feet.x, c.feet.y, 40, 14).fill({ color: s.glow, alpha: 0.3 * strength });
  burst(
    c,
    c.feet,
    c.t * 1.4,
    {
      count: 14,
      colors: [0xffffff, s.color, s.glow],
      reach: 30,
      size: 1.6,
      gravity: 12,
      lift: 10,
      flatten: 0.5,
      additive: true,
    },
    67,
  );
}

/** Rayos que saltan del lanzador al objetivo y alrededor (rayo en cadena). */
export function arcs(c: FxContext, s: BoltSpec): void {
  const frame = Math.floor(c.t * 30);
  const strength = c.t < 0.6 ? 1 : (1 - c.t) / 0.4;
  const hop = zigzag(c.from, c.to, 10, 14, c.seed + frame);
  strokePath(c.light, hop, s.glow, 6, 0.4 * strength);
  strokePath(c.light, hop, s.color, 1.6, strength);
  // Saltos a los costados del objetivo, como buscando a otros.
  for (let b = 0; b < s.branches; b++) {
    const angle = (b / s.branches) * Math.PI * 2 + c.t * 3;
    const end = { x: c.to.x + Math.cos(angle) * 46, y: c.to.y + Math.sin(angle) * 22 + 20 };
    strokePath(
      c.light,
      zigzag(c.to, end, 5, 8, c.seed * 7 + frame + b),
      s.color,
      1.2,
      0.8 * strength,
    );
  }
  skyBolt({ ...c, t: Math.min(0.99, c.t * 1.2) }, { ...s, branches: 1 });
}

// ---------------------------------------------------------------- fuego

/** Columna de fuego que sube desde los pies y envuelve al objetivo, con humo. */
export function fireColumn(c: FxContext, width: number, height: number): void {
  const strength = Math.min(1, c.t * 4) * (c.t > 0.7 ? (1 - c.t) / 0.3 : 1);
  const now = c.t * 1300;
  const { x, y } = c.feet;
  c.light.ellipse(x, y, width * 1.7, width * 0.6).fill({ color: 0xff6a1a, alpha: 0.4 * strength });
  for (let i = 0; i < 7; i++) {
    const a = ((now + hash(c.seed, i, 5) * 900) % 900) / 900;
    c.g
      .circle(x + (hash(c.seed, i, 6) - 0.5) * width, y - height - a * 34, 5 + a * 10)
      .fill({ color: 0x3a3430, alpha: 0.32 * (1 - a) * strength });
  }
  for (let i = 0; i < 56; i++) {
    const life = 350 + hash(c.seed, i, 7) * 350;
    const a = ((now + hash(c.seed, i, 8) * life * 5) % life) / life;
    const angle = hash(c.seed, i, 9) * Math.PI * 2 + now * 0.004;
    const r = width * (0.4 + hash(c.seed, i, 10) * 0.7) * (1 - a * 0.4);
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r * 0.35 - a * (height * 0.85 + hash(c.seed, i, 11) * 30);
    c.light.circle(px, py, (4 + hash(c.seed, i, 12) * 4) * (1 - a * 0.7)).fill({
      color: paletteAt(FIRE_COLORS, a),
      alpha: 0.85 * (1 - a) * strength,
    });
  }
}

/**
 * Explosión con partículas: un fogonazo blanco, una onda que se abre en el
 * piso, una bola de fuego que crece, llamas y brasas que vuelan y caen, y
 * humo que sube al final.
 */
export function explosion(c: FxContext, at: Point, size: number, k: number): void {
  if (k <= 0 || k >= 1) return;
  const floorY = at.y + 40;
  // Fogonazo.
  if (k < 0.18) {
    const f = 1 - k / 0.18;
    c.light.circle(at.x, at.y, size * 1.8).fill({ color: 0xffffff, alpha: 0.55 * f });
  }
  // Onda en el piso.
  const wave = Math.min(1, k * 2.2);
  c.light
    .ellipse(at.x, floorY, size * 2.4 * wave, size * 0.9 * wave)
    .stroke({ color: 0xffb060, width: 3, alpha: 0.7 * (1 - wave) });
  // Bola de fuego: crece rápido y se consume despacio.
  const core = size * (0.35 + Math.min(1, k * 3) * 0.8);
  const fade = Math.max(0, 1 - k * 1.15);
  c.light.circle(at.x, at.y, core * 1.5).fill({ color: 0xff5a14, alpha: 0.5 * fade });
  c.light.circle(at.x, at.y, core).fill({ color: 0xffb040, alpha: 0.8 * fade });
  c.light.circle(at.x, at.y, core * 0.5).fill({ color: 0xfff6c8, alpha: fade * fade });
  // Bolas de llama que se abren hacia afuera y suben, como hongos de fuego.
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2 + hash(c.seed, i, 70) * 0.6;
    const out = size * (0.4 + Math.min(1, k * 1.8) * (0.7 + hash(c.seed, i, 69) * 0.5));
    const life = Math.min(1, k * 1.3);
    c.light
      .circle(
        at.x + Math.cos(angle) * out,
        at.y + Math.sin(angle) * out * 0.55 - life * 16,
        size * (0.35 + hash(c.seed, i, 68) * 0.25) * (1 - life * 0.6),
      )
      .fill({ color: paletteAt(FIRE_COLORS, 0.15 + life * 0.85), alpha: 0.85 * (1 - life) });
  }
  // Llamas que vuelan.
  burst(
    c,
    at,
    k * 1.15,
    {
      count: 60,
      colors: FIRE_COLORS,
      reach: size * 2.1,
      size: 4,
      gravity: 18,
      lift: 14,
      flatten: 0.7,
      additive: true,
    },
    71,
  );
  // Brasas chicas que llegan más lejos y caen.
  burst(
    c,
    at,
    k,
    {
      count: 28,
      colors: [0xfff0b0, 0xffa030, 0xa02008],
      reach: size * 3,
      size: 1.4,
      gravity: 40,
      lift: 22,
      flatten: 0.6,
      additive: true,
    },
    75,
  );
  // Humo que sube.
  for (let i = 0; i < 10; i++) {
    const angle = hash(c.seed, i, 79) * Math.PI * 2;
    const r = size * (0.3 + k * 1.1);
    c.g
      .circle(
        at.x + Math.cos(angle) * r,
        at.y + Math.sin(angle) * r * 0.5 - k * 34,
        size * 0.32 * (0.5 + k),
      )
      .fill({
        color: mix(0x5a4a40, 0x2a2624, k),
        alpha: 0.4 * Math.sin(Math.min(1, k * 1.3) * Math.PI),
      });
  }
}

/** Una bola de fuego que cae del cielo en diagonal y explota (lluvia de meteoritos). */
export function meteors(c: FxContext, count: number, size: number): void {
  for (let i = 0; i < count; i++) {
    const delay = i * 0.12;
    const k = (c.t - delay) / 0.45;
    const land = {
      x: c.feet.x + (hash(c.seed, i, 81) - 0.5) * 90,
      y: c.feet.y - 30 + (hash(c.seed, i, 82) - 0.5) * 30,
    };
    if (k > 0 && k < 1) {
      const sky = { x: land.x - 120, y: land.y - 260 };
      projectile(
        { ...c, from: sky, to: land, t: k },
        { shape: 'fire', color: 0xffc050, glow: 0xff4010, size, travel: 1 },
      );
    }
    explosion(c, land, size * 3.2, (c.t - delay - 0.45) / 0.4);
  }
}

// ---------------------------------------------------------------- otros

/** Un óvalo de portal que se abre y gira (Portal, Recordar, Marcar). */
export function portal(c: FxContext, color: number, glow: number, height: number): void {
  const open = Math.min(1, c.t * 3) * envelope(c.t, 0.05, 0.3);
  const cx = c.feet.x;
  const cy = c.feet.y - height / 2;
  c.light.ellipse(cx, cy, 20 * open, (height / 2) * open).fill({ color: glow, alpha: 0.35 });
  for (let i = 0; i < 3; i++) {
    c.light
      .ellipse(cx, cy, (20 - i * 5) * open, (height / 2 - i * 7) * open)
      .stroke({ color: i === 0 ? color : glow, width: 2, alpha: 0.9 - i * 0.2 });
  }
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2 + c.t * 8;
    c.light
      .circle(cx + Math.cos(angle) * 18 * open, cy + Math.sin(angle) * (height / 2) * open, 1.8)
      .fill({ color: 0xffffff, alpha: open });
  }
}

/** Un remolino de energía (vórtice, espíritus de las cuchillas). */
export function vortex(
  c: FxContext,
  colors: readonly number[],
  radius: number,
  height: number,
): void {
  const strength = envelope(c.t, 0.15, 0.3);
  for (let i = 0; i < 40; i++) {
    const k = hash(c.seed, i, 91);
    const angle = k * Math.PI * 12 + c.t * 16;
    const h = k * height;
    const r = radius * (0.3 + k * 0.9);
    c.light
      .circle(c.feet.x + Math.cos(angle) * r, c.feet.y - h + Math.sin(angle) * r * 0.3, 2.2)
      .fill({
        color: paletteAt(colors, k),
        alpha: strength,
      });
  }
}

/** Polvo que se levanta del piso (terremoto, muro de piedra). */
export function dust(c: FxContext, color: number, count: number, spread: number): void {
  for (let i = 0; i < count; i++) {
    const k = Math.min(1, c.t * (1.2 + hash(c.seed, i, 95)));
    const angle = hash(c.seed, i, 96) * Math.PI * 2;
    const r = spread * (0.3 + hash(c.seed, i, 97) * 0.7);
    c.g
      .circle(
        c.feet.x + Math.cos(angle) * r,
        c.feet.y + Math.sin(angle) * r * 0.4 - k * 20,
        4 + k * 8,
      )
      .fill({ color, alpha: 0.35 * (1 - k) });
  }
}

/** Un fogonazo de luz sobre el objetivo. */
export function flash(c: FxContext, color: number, radius: number, at: Point = c.to): void {
  const k = Math.min(1, c.t * 3);
  c.light.circle(at.x, at.y, radius * (0.5 + k)).fill({ color, alpha: 0.5 * (1 - k) });
}

/** Rayos de luz que salen del objetivo hacia afuera (nova). */
export function nova(c: FxContext, color: number, glow: number, rays: number, reach: number): void {
  const k = Math.min(1, c.t * 1.6);
  const strength = 1 - k;
  for (let i = 0; i < rays; i++) {
    const angle = (i / rays) * Math.PI * 2 + hash(c.seed, i, 99) * 0.3;
    const inner = reach * k * 0.4;
    const outer = reach * (0.3 + k);
    c.light
      .moveTo(c.to.x + Math.cos(angle) * inner, c.to.y + Math.sin(angle) * inner * 0.7)
      .lineTo(c.to.x + Math.cos(angle) * outer, c.to.y + Math.sin(angle) * outer * 0.7)
      .stroke({ color: i % 2 ? color : glow, width: 2, alpha: strength });
  }
  c.light.circle(c.to.x, c.to.y, reach * 0.3 * (1 - k)).fill({ color, alpha: 0.6 * strength });
}

/** Ondas que salen de la cabeza del objetivo (golpe mental). */
export function mindWaves(c: FxContext, color: number): void {
  const head = { x: c.to.x, y: c.to.y - 18 };
  for (let i = 0; i < 4; i++) {
    const k = (c.t * 2 + i / 4) % 1;
    c.light
      .ellipse(head.x, head.y, 10 + k * 36, 6 + k * 20)
      .stroke({ color, width: 2.5 * (1 - k) + 0.5, alpha: (1 - k) * envelope(c.t) });
  }
  c.light.circle(head.x, head.y, 6).fill({ color: 0xffffff, alpha: 0.7 * envelope(c.t) });
}
