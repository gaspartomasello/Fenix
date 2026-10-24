import type { SpellKey } from '@fenix/shared/magic/spell-catalog';
import { FIRE_COLORS, POISON_COLORS } from '../particles';
import type {
  AuraSpec,
  BoltSpec,
  BurstSpec,
  GroundSpec,
  ProjectileSpec,
  ShellSpec,
} from './painters';

/**
 * Cómo se ve cada hechizo: una lista de capas que se dibujan juntas. Cada
 * capa puede ocupar solo una parte del tiempo (`span`, de 0 a 1): así un
 * proyectil viaja y después estalla. Cada hechizo tiene la suya, distinta.
 */
export type Layer = { readonly span?: readonly [number, number] } & (
  | { readonly kind: 'projectile'; readonly spec: ProjectileSpec }
  | { readonly kind: 'burst'; readonly at: 'chest' | 'feet'; readonly spec: BurstSpec }
  | { readonly kind: 'aura'; readonly spec: AuraSpec }
  | { readonly kind: 'ground'; readonly spec: GroundSpec }
  | { readonly kind: 'shell'; readonly spec: ShellSpec }
  | {
      readonly kind: 'spiral';
      readonly colors: readonly number[];
      readonly turns: number;
      readonly radius: number;
      readonly strands: number;
    }
  | {
      readonly kind: 'stream';
      readonly color: number;
      readonly glow: number;
      readonly count: number;
    }
  | { readonly kind: 'sky-bolt'; readonly spec: BoltSpec }
  | { readonly kind: 'arcs'; readonly spec: BoltSpec }
  | { readonly kind: 'fire-column'; readonly width: number; readonly height: number }
  | { readonly kind: 'explosion'; readonly size: number }
  | { readonly kind: 'meteors'; readonly count: number; readonly size: number }
  | {
      readonly kind: 'portal';
      readonly color: number;
      readonly glow: number;
      readonly height: number;
    }
  | {
      readonly kind: 'vortex';
      readonly colors: readonly number[];
      readonly radius: number;
      readonly height: number;
    }
  | {
      readonly kind: 'dust';
      readonly color: number;
      readonly count: number;
      readonly spread: number;
    }
  | { readonly kind: 'flash'; readonly color: number; readonly radius: number }
  | {
      readonly kind: 'nova';
      readonly color: number;
      readonly glow: number;
      readonly rays: number;
      readonly reach: number;
    }
  | { readonly kind: 'mind-waves'; readonly color: number }
);

export interface SpellFx {
  readonly durationMs: number;
  readonly layers: readonly Layer[];
}

// Ayudas para escribir las recetas cortas.
const rise = (color: number, shape: AuraSpec['shape'], extra: Partial<AuraSpec> = {}): Layer => ({
  kind: 'aura',
  spec: {
    count: 10,
    color,
    glow: color,
    shape,
    direction: -1,
    radius: 15,
    spin: 1,
    size: 2.4,
    ...extra,
  },
});
const fall = (color: number, shape: AuraSpec['shape'], extra: Partial<AuraSpec> = {}): Layer => ({
  kind: 'aura',
  spec: {
    count: 10,
    color,
    glow: color,
    shape,
    direction: 1,
    radius: 15,
    spin: 0.6,
    size: 2.4,
    ...extra,
  },
});
const sparks = (
  colors: readonly number[],
  at: 'chest' | 'feet',
  extra: Partial<BurstSpec> = {},
  span?: readonly [number, number],
): Layer => ({
  kind: 'burst',
  at,
  ...(span ? { span } : {}),
  spec: {
    count: 18,
    colors,
    reach: 26,
    size: 2,
    gravity: 10,
    lift: 6,
    flatten: 0.7,
    additive: true,
    ...extra,
  },
});
const shot = (spec: Omit<ProjectileSpec, 'travel'>, travel = 0.6): Layer => ({
  kind: 'projectile',
  span: [0, travel],
  spec: { ...spec, travel: 1 },
});
const onFloor = (style: GroundSpec['style'], color: number, radius: number): Layer => ({
  kind: 'ground',
  spec: { style, color, radius },
});

const ENERGY: readonly number[] = [0xffffff, 0xb0d0ff, 0x4070ff, 0x2030a0];
const VIOLET: readonly number[] = [0xffffff, 0xd0a0ff, 0x8040c0, 0x401070];
const HOLY: readonly number[] = [0xffffff, 0xfff2b0, 0xffd860, 0xc09020];
const WATER: readonly number[] = [0xffffff, 0xa0e0ff, 0x3090e0, 0x104890];
const SHADOW: readonly number[] = [0xff8090, 0xc02040, 0x601020, 0x200810];

export const SPELL_FX: Readonly<Record<SpellKey, SpellFx>> = {
  // ------------------------------------------------------------ primer círculo
  clumsy: { durationMs: 900, layers: [fall(0xc8a048, 'diamond', { spin: 1.4 })] },
  'create-food': {
    durationMs: 800,
    layers: [
      rise(0xffd890, 'star', { count: 6 }),
      sparks([0xfff0c0, 0xffb040], 'feet', { count: 10 }),
    ],
  },
  feeblemind: {
    durationMs: 900,
    layers: [fall(0x7080c0, 'ring'), { kind: 'mind-waves', color: 0x506090 }],
  },
  heal: { durationMs: 900, layers: [rise(0x8cf09a, 'cross')] },
  'magic-arrow': {
    durationMs: 650,
    layers: [
      shot({ shape: 'streak', color: 0xfff2a0, glow: 0xffc040, size: 2.5 }, 0.65),
      sparks([0xffffff, 0xfff0a0, 0xffa020], 'chest', { count: 12, reach: 18 }, [0.65, 1]),
    ],
  },
  light: {
    durationMs: 900,
    layers: [
      { kind: 'flash', color: 0xfff0a0, radius: 46 },
      rise(0xfff6c0, 'dot', { count: 14, radius: 20 }),
    ],
  },
  weaken: { durationMs: 900, layers: [fall(0xb05040, 'drop')] },
  'reactive-armor': {
    durationMs: 900,
    layers: [
      { kind: 'shell', spec: { style: 'spikes', color: 0xffb070, glow: 0xff7030, radius: 34 } },
    ],
  },

  // ------------------------------------------------------------ segundo círculo
  agility: { durationMs: 900, layers: [rise(0x80e0ff, 'diamond', { spin: 2.4, count: 12 })] },
  cunning: { durationMs: 900, layers: [rise(0x9090ff, 'star', { radius: 12 })] },
  cure: {
    durationMs: 900,
    layers: [
      sparks(POISON_COLORS, 'chest', { count: 16, gravity: -8 }),
      rise(0xf0fff0, 'ring', { count: 8 }),
    ],
  },
  harm: {
    durationMs: 700,
    layers: [
      shot({ shape: 'shadow', color: 0xa02040, glow: 0x401020, size: 6 }, 0.55),
      { kind: 'nova', span: [0.55, 1], color: 0xff6080, glow: 0x801030, rays: 10, reach: 30 },
    ],
  },
  protection: {
    durationMs: 1000,
    layers: [
      { kind: 'shell', spec: { style: 'facets', color: 0xffd860, glow: 0xffe8a0, radius: 30 } },
    ],
  },
  strength: {
    durationMs: 900,
    layers: [rise(0xff7050, 'diamond'), onFloor('pulse', 0xff6040, 30)],
  },
  'magic-trap': {
    durationMs: 900,
    layers: [onFloor('runic', 0xff6040, 22), sparks([0xffd0a0, 0xff4020], 'feet', { count: 8 })],
  },
  'magic-untrap': {
    durationMs: 900,
    layers: [
      onFloor('runic', 0x80a0ff, 22),
      sparks([0xffffff, 0x80a0ff], 'feet', { count: 14, lift: 20 }),
    ],
  },

  // ------------------------------------------------------------ tercer círculo
  bless: {
    durationMs: 1000,
    layers: [rise(0xfff0c0, 'star', { count: 14, spin: 1.6 }), onFloor('pulse', 0xffd860, 34)],
  },
  fireball: {
    durationMs: 900,
    layers: [
      shot({ shape: 'fire', color: 0xffb040, glow: 0xff5a1a, size: 6 }, 0.6),
      { kind: 'explosion', span: [0.6, 1], size: 12 },
    ],
  },
  poison: {
    durationMs: 950,
    layers: [
      shot({ shape: 'orb', color: 0xb0f070, glow: 0x308020, size: 4 }, 0.5),
      sparks(POISON_COLORS, 'chest', { count: 22, gravity: 26 }, [0.5, 1]),
      { ...fall(0x70e060, 'drop', { count: 8 }), span: [0.5, 1] },
    ],
  },
  teleport: {
    durationMs: 800,
    layers: [{ kind: 'spiral', colors: VIOLET, turns: 2.5, radius: 16, strands: 2 }],
  },
  'wall-of-stone': {
    durationMs: 900,
    layers: [
      { kind: 'dust', color: 0x8a8070, count: 14, spread: 40 },
      onFloor('cracks', 0x3a342c, 30),
    ],
  },
  'magic-lock': {
    durationMs: 800,
    layers: [onFloor('runic', 0xffc040, 16), rise(0xffe090, 'diamond', { count: 4, radius: 8 })],
  },
  telekinesis: {
    durationMs: 800,
    layers: [
      shot({ shape: 'orb', color: 0xe0d8ff, glow: 0x9080ff, size: 3 }, 0.6),
      sparks([0xffffff, 0xd0c0ff, 0x9080ff], 'chest', { count: 10 }, [0.6, 1]),
    ],
  },
  unlock: {
    durationMs: 700,
    layers: [
      { kind: 'flash', color: 0xc0e0ff, radius: 20 },
      sparks([0xffffff, 0x80b0ff], 'chest', { count: 12 }),
    ],
  },

  // ------------------------------------------------------------ cuarto círculo
  curse: {
    durationMs: 1000,
    layers: [fall(0x8040b0, 'drop', { count: 12 }), onFloor('runic', 0x602090, 28)],
  },
  'greater-heal': {
    durationMs: 1100,
    layers: [
      rise(0x8cf09a, 'cross', { count: 16, radius: 18, size: 3 }),
      onFloor('pulse', 0x60e080, 36),
      { kind: 'flash', color: 0xc0ffc0, radius: 28 },
    ],
  },
  lightning: {
    durationMs: 600,
    layers: [
      { kind: 'sky-bolt', spec: { color: 0xf4f8ff, glow: 0x80b0ff, height: 460, branches: 3 } },
    ],
  },
  'mana-drain': {
    durationMs: 900,
    layers: [{ kind: 'stream', color: 0x60a0ff, glow: 0x2050c0, count: 14 }],
  },
  recall: {
    durationMs: 1000,
    layers: [{ kind: 'portal', color: 0x80b0ff, glow: 0x3060d0, height: 60 }],
  },
  'arch-cure': {
    durationMs: 1000,
    layers: [onFloor('pulse', 0xd0ffd0, 60), rise(0xa0ffa0, 'ring', { count: 12, radius: 20 })],
  },
  'arch-protection': {
    durationMs: 1100,
    layers: [
      onFloor('runic', 0xffd860, 60),
      { kind: 'shell', spec: { style: 'facets', color: 0xffe8a0, glow: 0xffd860, radius: 36 } },
    ],
  },
  'fire-field': {
    durationMs: 900,
    layers: [
      sparks(FIRE_COLORS, 'feet', { count: 26, lift: 30, gravity: 0 }),
      onFloor('pulse', 0xff7020, 34),
    ],
  },

  // ------------------------------------------------------------ quinto círculo
  'mind-blast': {
    durationMs: 800,
    layers: [
      { kind: 'mind-waves', color: 0xd0a0ff },
      { kind: 'nova', span: [0.2, 1], color: 0xe0c0ff, glow: 0x8040c0, rays: 8, reach: 26 },
    ],
  },
  paralyze: {
    durationMs: 1000,
    layers: [
      { kind: 'shell', spec: { style: 'crystals', color: 0x80f0ff, glow: 0xe0ffff, radius: 22 } },
    ],
  },
  'poison-field': {
    durationMs: 900,
    layers: [
      sparks(POISON_COLORS, 'feet', { count: 26, lift: 26, gravity: 0 }),
      onFloor('pulse', 0x50c030, 34),
    ],
  },
  'blade-spirits': {
    durationMs: 1000,
    layers: [{ kind: 'vortex', colors: [0xffffff, 0xc0c8d0, 0x707880], radius: 18, height: 60 }],
  },
  'dispel-field': {
    durationMs: 800,
    layers: [
      { kind: 'nova', color: 0xf0f0ff, glow: 0x8080ff, rays: 12, reach: 34 },
      sparks(ENERGY, 'feet', { count: 10 }),
    ],
  },
  incognito: {
    durationMs: 1000,
    layers: [
      { kind: 'spiral', colors: [0xffffff, 0xd0b0ff, 0x8060c0], turns: 3, radius: 14, strands: 1 },
      rise(0xd0b0ff, 'dot', { count: 6 }),
    ],
  },
  'magic-reflection': {
    durationMs: 1000,
    layers: [
      { kind: 'shell', spec: { style: 'mirror', color: 0xe0e8ff, glow: 0xa0b8ff, radius: 32 } },
    ],
  },
  'summon-creature': {
    durationMs: 1100,
    layers: [onFloor('pentagram', 0xc080ff, 30), { kind: 'flash', color: 0xd0a0ff, radius: 24 }],
  },

  // ------------------------------------------------------------ sexto círculo
  'energy-bolt': {
    durationMs: 800,
    layers: [
      shot({ shape: 'energy', color: 0xd8ecff, glow: 0x4080ff, size: 6 }, 0.6),
      { kind: 'flash', span: [0.6, 1], color: 0x80b0ff, radius: 30 },
      sparks(ENERGY, 'chest', { count: 20, reach: 30 }, [0.6, 1]),
    ],
  },
  explosion: { durationMs: 1200, layers: [{ kind: 'explosion', size: 26 }] },
  mark: {
    durationMs: 1000,
    layers: [onFloor('runic', 0xffd070, 26), rise(0xffd070, 'diamond', { count: 6, spin: 0.4 })],
  },
  invisibility: {
    durationMs: 1000,
    layers: [
      { kind: 'spiral', colors: [0xffffff, 0xc0c8d0, 0x606870], turns: 2, radius: 18, strands: 3 },
      { kind: 'flash', color: 0xe0e8f0, radius: 22 },
    ],
  },
  reveal: {
    durationMs: 900,
    layers: [
      { kind: 'nova', color: 0xfff2b0, glow: 0xffd860, rays: 16, reach: 60 },
      onFloor('pulse', 0xffe080, 70),
    ],
  },
  'mass-curse': {
    durationMs: 1100,
    layers: [onFloor('runic', 0x501080, 64), fall(0x9050c0, 'drop', { count: 16, radius: 26 })],
  },
  'paralyze-field': {
    durationMs: 1000,
    layers: [
      { kind: 'shell', spec: { style: 'crystals', color: 0xb0f0ff, glow: 0x60c0ff, radius: 16 } },
      onFloor('pulse', 0x80e0ff, 30),
    ],
  },
  dispel: {
    durationMs: 900,
    layers: [
      { kind: 'nova', color: 0xf0f0ff, glow: 0x4060ff, rays: 8, reach: 40 },
      fall(0xc0c8ff, 'ring', { count: 8 }),
    ],
  },

  // ------------------------------------------------------------ séptimo círculo
  flamestrike: { durationMs: 1300, layers: [{ kind: 'fire-column', width: 18, height: 90 }] },
  'mana-vampire': {
    durationMs: 1000,
    layers: [
      { kind: 'stream', color: 0xa080ff, glow: 0x4020c0, count: 22 },
      fall(0x6040c0, 'drop', { count: 6 }),
    ],
  },
  'gate-travel': {
    durationMs: 1300,
    layers: [
      { kind: 'portal', color: 0x60a0ff, glow: 0x2040c0, height: 84 },
      onFloor('pulse', 0x4080ff, 30),
    ],
  },
  'chain-lightning': {
    durationMs: 700,
    layers: [{ kind: 'arcs', spec: { color: 0xf0f6ff, glow: 0x6090ff, height: 420, branches: 4 } }],
  },
  'meteor-swarm': { durationMs: 1500, layers: [{ kind: 'meteors', count: 4, size: 5 }] },
  'energy-field': {
    durationMs: 900,
    layers: [
      onFloor('pulse', 0x4080ff, 36),
      sparks(ENERGY, 'feet', { count: 24, lift: 34, gravity: 0 }),
    ],
  },
  'mass-dispel': {
    durationMs: 1000,
    layers: [
      onFloor('runic', 0xf0f0ff, 64),
      { kind: 'nova', color: 0xffffff, glow: 0x8080ff, rays: 20, reach: 70 },
    ],
  },
  polymorph: {
    durationMs: 1100,
    layers: [
      { kind: 'spiral', colors: [0xffffff, 0xa0ffb0, 0x30a050], turns: 3, radius: 18, strands: 2 },
      sparks([0xd0ffd0, 0x60c070], 'chest', { count: 14 }),
    ],
  },

  // ------------------------------------------------------------ octavo círculo
  earthquake: {
    durationMs: 1400,
    layers: [
      onFloor('cracks', 0x2a241c, 80),
      { kind: 'dust', color: 0x9a8668, count: 26, spread: 90 },
    ],
  },
  'energy-vortex': {
    durationMs: 1200,
    layers: [
      { kind: 'vortex', colors: [0xffffff, 0xa0a0ff, 0x6020c0, 0x200060], radius: 22, height: 70 },
    ],
  },
  resurrection: {
    durationMs: 1500,
    layers: [
      onFloor('runic', 0xfff2b0, 34),
      rise(0xfff2b0, 'star', { count: 16, radius: 16, spin: 0.5 }),
      sparks(HOLY, 'chest', { count: 20, gravity: -20 }, [0.5, 1]),
      { kind: 'flash', span: [0.5, 1], color: 0xffffff, radius: 34 },
    ],
  },
  'air-elemental': {
    durationMs: 1200,
    layers: [
      onFloor('pentagram', 0xe0f0ff, 32),
      { kind: 'vortex', colors: [0xffffff, 0xd0e8ff, 0x90b0d0], radius: 16, height: 56 },
    ],
  },
  'earth-elemental': {
    durationMs: 1200,
    layers: [
      onFloor('pentagram', 0xb08a50, 32),
      { kind: 'dust', color: 0x7a6040, count: 18, spread: 34 },
    ],
  },
  'fire-elemental': {
    durationMs: 1300,
    layers: [onFloor('pentagram', 0xff6020, 32), { kind: 'fire-column', width: 12, height: 64 }],
  },
  'water-elemental': {
    durationMs: 1200,
    layers: [
      onFloor('pentagram', 0x40a0ff, 32),
      sparks(WATER, 'feet', { count: 30, lift: 34, gravity: 30, additive: false }),
    ],
  },
  'summon-daemon': {
    durationMs: 1500,
    layers: [
      onFloor('pentagram', 0xff2020, 40),
      sparks(SHADOW, 'feet', { count: 34, lift: 44, gravity: -10, size: 2.6 }),
      { kind: 'flash', span: [0.4, 1], color: 0xff4020, radius: 36 },
    ],
  },
};
