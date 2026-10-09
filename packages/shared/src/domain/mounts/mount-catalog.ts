/**
 * Monturas: animales mansos que se compran en la caballeriza, siguen a su
 * dueño y se montan con doble clic. Montado se anda más rápido (como en UO,
 * al paso se va a la velocidad de correr a pie, y al galope al doble).
 */
export const MOUNT_KINDS = [
  'horse-chestnut',
  'horse-black',
  'horse-gray',
  'horse-pinto',
  'llama',
  'runner',
] as const;
export type MountKind = (typeof MOUNT_KINDS)[number];

/** Forma del cuerpo: cada especie tiene su esqueleto y sus andares. */
export type MountSpecies = 'horse' | 'llama' | 'runner';

export interface MountDefinition {
  readonly kind: MountKind;
  readonly species: MountSpecies;
  readonly name: string;
  readonly article: 'un' | 'una';
  /** Precio en la caballeriza. */
  readonly price: number;
}

export const MOUNTS: Readonly<Record<MountKind, MountDefinition>> = {
  'horse-chestnut': {
    kind: 'horse-chestnut',
    species: 'horse',
    name: 'caballo alazán',
    article: 'un',
    price: 600,
  },
  'horse-black': {
    kind: 'horse-black',
    species: 'horse',
    name: 'caballo negro',
    article: 'un',
    price: 750,
  },
  'horse-gray': {
    kind: 'horse-gray',
    species: 'horse',
    name: 'caballo tordillo',
    article: 'un',
    price: 750,
  },
  'horse-pinto': {
    kind: 'horse-pinto',
    species: 'horse',
    name: 'caballo overo',
    article: 'un',
    price: 900,
  },
  llama: { kind: 'llama', species: 'llama', name: 'llama', article: 'una', price: 400 },
  runner: {
    kind: 'runner',
    species: 'runner',
    name: 'lagarto corredor',
    article: 'un',
    price: 1200,
  },
};

export function isMountKind(value: unknown): value is MountKind {
  return typeof value === 'string' && (MOUNT_KINDS as readonly string[]).includes(value);
}

/** A cuántos tiles hay que estar de la montura para subirse. */
export const MOUNT_RANGE = 1;
