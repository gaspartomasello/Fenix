/**
 * Objetos fijos del mundo (árboles, rocas, paredes…), como los "statics"
 * de UO. Cada uno ocupa un tile; los que bloquean impiden pasar por él.
 */
export const STATIC_KINDS = [
  'oak',
  'pine',
  'bush',
  'rock',
  'flowers',
  'wall-x',
  'wall-y',
  'wall-corner',
  'wall-post',
  'fence-x',
  'fence-y',
  'barrel',
  'crate',
  'well',
  'lamp',
  'sign',
  'shrine',
  'forge',
  'anvil',
  'cave-wall',
  'cave-entrance',
  'ladder',
  'brazier',
  'bones',
  'stalagmite',
] as const;

export type StaticKind = (typeof STATIC_KINDS)[number];

export interface StaticDefinition {
  readonly kind: StaticKind;
  readonly name: string;
  readonly blocking: boolean;
  /** Radio de luz que emite de noche, en tiles (0 = no ilumina). */
  readonly lightRadius: number;
}

const define = (
  kind: StaticKind,
  name: string,
  blocking: boolean,
  lightRadius = 0,
): StaticDefinition => ({ kind, name, blocking, lightRadius });

export const STATICS: Readonly<Record<StaticKind, StaticDefinition>> = {
  oak: define('oak', 'roble', true),
  pine: define('pine', 'pino', true),
  bush: define('bush', 'arbusto', false),
  rock: define('rock', 'roca', true),
  flowers: define('flowers', 'flores', false),
  'wall-x': define('wall-x', 'pared', true),
  'wall-y': define('wall-y', 'pared', true),
  'wall-corner': define('wall-corner', 'pared', true),
  'wall-post': define('wall-post', 'columna', true),
  'fence-x': define('fence-x', 'cerca', true),
  'fence-y': define('fence-y', 'cerca', true),
  barrel: define('barrel', 'barril', true),
  crate: define('crate', 'cajón', true),
  well: define('well', 'aljibe', true),
  lamp: define('lamp', 'farol', true, 5),
  sign: define('sign', 'cartel', false),
  shrine: define('shrine', 'santuario', true, 4),
  forge: define('forge', 'forja', true, 3),
  anvil: define('anvil', 'yunque', true),
  'cave-wall': define('cave-wall', 'pared de roca', true),
  'cave-entrance': define('cave-entrance', 'entrada a la cueva', false),
  ladder: define('ladder', 'escalera de salida', false),
  brazier: define('brazier', 'brasero', true, 6),
  bones: define('bones', 'huesos', false),
  stalagmite: define('stalagmite', 'estalagmita', true),
};

export function isStaticKind(value: unknown): value is StaticKind {
  return typeof value === 'string' && (STATIC_KINDS as readonly string[]).includes(value);
}

export interface StaticPlacement {
  readonly kind: StaticKind;
  readonly x: number;
  readonly y: number;
}
