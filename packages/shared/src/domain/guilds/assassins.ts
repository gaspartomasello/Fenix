import type { CreatureKind } from '../creatures/creature-catalog';

/**
 * El gremio de asesinos: escondido en el Refugio de los Bandidos, el pueblo
 * sin guardias. Su jefa se hace pasar por mendiga; solo habla de negocios con
 * quien le nombra «la sombra». Da encargos: matar a alguien de nombre azul
 * (gente de paz) en algún lugar del campo. Cada encargo cumplido sube de rango
 * y paga más. Matar a un inocente es un crimen: el encargo te deja criminal.
 */

/** Dónde vive el gremio y quién lo dirige. */
export const ASSASSINS_TOWN = 'Refugio de los Bandidos';
export const ASSASSINS_MASTER = 'Silvana la Sombra';
/** La clave en `Player.standing`: encargos cumplidos (si la tiene, es del gremio). */
export const ASSASSINS_STANDING = 'asesinos';
/** Cuánto tiempo hay para cumplir un encargo. */
export const CONTRACT_MS = 40 * 60 * 1000;

/** Los rangos, según los encargos cumplidos, y lo que se paga por cada encargo en ese rango. */
export const ASSASSIN_RANKS: readonly {
  readonly from: number;
  readonly title: string;
  readonly pay: number;
}[] = [
  { from: 0, title: 'Aprendiz de la Sombra', pay: 300 },
  { from: 3, title: 'Puñal', pay: 500 },
  { from: 6, title: 'Sombra', pay: 800 },
  { from: 10, title: 'Mano de la Muerte', pay: 1200 },
];

export function assassinRank(done: number): (typeof ASSASSIN_RANKS)[number] {
  let rank = { from: 0, title: 'Aprendiz de la Sombra', pay: 300 };
  for (const r of ASSASSIN_RANKS) if (done >= r.from) rank = r;
  return rank;
}

/** A quién se puede encargar matar: su nombre, cómo es y por qué alguien pagó. */
export interface Victim {
  readonly name: string;
  readonly kind: CreatureKind;
  readonly story: string;
  /** Rango mínimo (encargos cumplidos) para que te lo den: los de más arriba van custodiados. */
  readonly minDone: number;
  /** Custodios (gente de paz armada que lo acompaña). */
  readonly guards?: readonly CreatureKind[];
}

export const VICTIMS: readonly Victim[] = [
  {
    name: 'Don Ernesto el prestamista',
    kind: 'traveler',
    story:
      'Le presta a los pobres y les cobra el triple. Una viuda vendió su casa para pagar este encargo.',
    minDone: 0,
  },
  {
    name: 'Clarisa la buhonera',
    kind: 'peddler',
    story:
      'Le vendió a la guardia los nombres de tres de los nuestros. Dos ya cuelgan de la horca de Puerto Ceniza.',
    minDone: 0,
  },
  {
    name: 'Hermano Tadeo',
    kind: 'pilgrim',
    story:
      'Dice que es peregrino. Es un espía del castillo, y anda contando cuántos somos y dónde dormimos.',
    minDone: 0,
  },
  {
    name: 'Brígida la cazadora',
    kind: 'huntress',
    story:
      'En una cacería, una flecha suya mató al hijo de un mercader. Dijo que fue un accidente. El padre no le cree.',
    minDone: 1,
  },
  {
    name: 'Fausto el recaudador',
    kind: 'traveler',
    story:
      'Cobra impuestos que nadie votó y se queda con la mitad. Medio pueblo de Junco Verde juntó el oro para esto.',
    minDone: 2,
    guards: ['huntress'],
  },
  {
    name: 'Leonor la contrabandista',
    kind: 'peddler',
    story:
      'Le debe al gremio dos mil monedas y se cree que porque se fue lejos nos olvidamos. Nosotros no olvidamos.',
    minDone: 3,
    guards: ['traveler'],
  },
  {
    name: 'Maese Gervasio',
    kind: 'traveler',
    story:
      'Un juez que condena a los pobres y absuelve a quien le paga. Esta vez le paga alguien más.',
    minDone: 4,
    guards: ['huntress', 'huntress'],
  },
  {
    name: 'Sor Inés',
    kind: 'pilgrim',
    story:
      'Guarda en su rosario la lista de los que vendieron al gremio. Alguien de esa lista paga para que la lista desaparezca.',
    minDone: 6,
    guards: ['huntress', 'traveler'],
  },
  {
    name: 'Rodrigo el heredero',
    kind: 'traveler',
    story:
      'Su hermano menor quiere la herencia entera. No es una buena razón, pero paga como si lo fuera.',
    minDone: 8,
    guards: ['huntress', 'huntress', 'traveler'],
  },
];

/** Lugares del campo donde suelen andar las víctimas (se usan los que hay en el mapa). */
export const CONTRACT_PLACES: readonly string[] = [
  'Granja de los Olmos',
  'Chacra del Molino',
  'Granja del Arroyo',
  'Faro del Cabo',
  'Muelle de Puerto Ceniza',
  'Muelle de Puerto Brasa',
  'Paso del Cuervo',
  'Capilla Olvidada',
  'Ruinas del Sol',
];
