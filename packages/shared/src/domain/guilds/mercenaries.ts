import type { CreatureKind } from '../creatures/creature-catalog';

/**
 * Mercenarios: se contratan con un capitán de mercenarios (en algunos pueblos)
 * y pelean para quien les paga. Cobran cada tanto, solos, del oro de la
 * mochila. Tienen **lealtad** (0 a 100), que crece si se les paga a tiempo,
 * si se les da propina y si pelean juntos; y **codicia**, que es de cada uno.
 *
 * - Si no se les paga, avisan; si igual no cobran, se van... o, si son
 *   codiciosos y poco leales, se cobran solos (se dan vuelta y atacan).
 * - Si el patrón lleva mucho oro encima, un codicioso poco leal empieza a
 *   mirarlo raro (avisa sin querer) y, si nada cambia, puede traicionarlo.
 * - Uno leal no traiciona nunca. La lealtad se recuerda: si se lo vuelve a
 *   contratar, sigue donde estaba. Un traidor no vuelve a trabajar para vos.
 */

/** Cada cuánto cobran (tiempo de juego, en milisegundos). */
export const WAGE_PERIOD_MS = 10 * 60 * 1000;
/** Cuánto esperan después de avisar que no cobraron. */
export const WAGE_GRACE_MS = 2 * 60 * 1000;
/** Cuántos se pueden tener a la vez. */
export const MAX_MERCENARIES = 2;
/** Lealtad desde la que ya no traicionan nunca. */
export const LOYAL = 70;
/** La clave en `Player.standing` con la lealtad de cada uno (`merc:<nombre>`); -1 = traidor. */
export function mercenaryStanding(name: string): string {
  return `merc:${name}`;
}

export interface Mercenary {
  readonly name: string;
  readonly kind: CreatureKind;
  /** Dónde se lo contrata (el pueblo de su capitán). */
  readonly town: string;
  /** Lo que cobra cada período. */
  readonly wage: number;
  /** De 0 (honrado) a 1 (vende a su madre). */
  readonly greed: number;
  /** Lealtad con la que empieza con un patrón nuevo. */
  readonly loyalty: number;
  /** Cómo se presenta. */
  readonly story: string;
}

/** Los capitanes de mercenarios y dónde atienden (al lado de la taberna). */
export const MERCENARY_CAPTAINS: readonly { readonly town: string; readonly name: string }[] = [
  { town: 'Puerto Ceniza', name: 'Capitana Remedios' },
  { town: 'Roca Alta', name: 'Capitán Anselmo Garra' },
  { town: 'Refugio de los Bandidos', name: 'Tuerto Salcedo' },
  { town: 'Puerto Esmeralda', name: 'Capitán Iturbide' },
];

export const MERCENARIES: readonly Mercenary[] = [
  {
    name: 'Bruno el Leal',
    kind: 'sellsword',
    town: 'Puerto Ceniza',
    wage: 80,
    greed: 0.1,
    loyalty: 50,
    story: 'Fui soldado del rey hasta que el rey dejó de pagar. Cumplo mi palabra.',
  },
  {
    name: 'Ofelia de las Llamas',
    kind: 'battle-mage',
    town: 'Puerto Ceniza',
    wage: 120,
    greed: 0.35,
    loyalty: 35,
    story: 'Me echaron de la torre de magos por quemar la biblioteca. Fue un accidente. Casi.',
  },
  {
    name: 'Gorka el Hachero',
    kind: 'axeman',
    town: 'Roca Alta',
    wage: 90,
    greed: 0.3,
    loyalty: 40,
    story: 'Bajé de las montañas a buscar trabajo. Lo único que sé hacer es partir cosas.',
  },
  {
    name: 'Leandro Mano Firme',
    kind: 'sellsword',
    town: 'Roca Alta',
    wage: 70,
    greed: 0.2,
    loyalty: 45,
    story: 'Escolté caravanas diez años. Nunca perdí una. Bueno, una.',
  },
  {
    name: 'Rata Mondragón',
    kind: 'sellsword',
    town: 'Refugio de los Bandidos',
    wage: 40,
    greed: 0.85,
    loyalty: 15,
    story: 'Barato, rápido y sin preguntas. Mientras haya oro, soy tuyo.',
  },
  {
    name: 'Vera la Cuervo',
    kind: 'battle-mage',
    town: 'Refugio de los Bandidos',
    wage: 60,
    greed: 0.7,
    loyalty: 20,
    story: 'Mis hechizos queman igual para cualquiera que me pague. Para cualquiera.',
  },
  {
    name: 'Bastián Rompecráneos',
    kind: 'axeman',
    town: 'Refugio de los Bandidos',
    wage: 55,
    greed: 0.6,
    loyalty: 25,
    story: 'Me buscan en tres pueblos. Acá nadie me busca. ¿Necesitás un brazo fuerte?',
  },
  {
    name: 'Itzel la Jaguar',
    kind: 'sellsword',
    town: 'Puerto Esmeralda',
    wage: 85,
    greed: 0.25,
    loyalty: 40,
    story: 'Crecí en la selva. Allá aprendí que la lealtad se gana, no se compra.',
  },
  {
    name: 'Tobías el Sereno',
    kind: 'battle-mage',
    town: 'Puerto Esmeralda',
    wage: 110,
    greed: 0.15,
    loyalty: 45,
    story: 'Estudio los rayos. Pelear me deja estudiarlos de cerca.',
  },
];

/** Cómo se siente, según su lealtad (lo que contesta si se le pregunta). */
export function mercenaryMood(loyalty: number): string {
  if (loyalty >= 90) return 'Daría la vida por vos, patrón.';
  if (loyalty >= LOYAL) return 'Estoy a gusto. Pagás bien y peleás mejor.';
  if (loyalty >= 40) return 'Todo bien, mientras siga llegando la paga.';
  if (loyalty >= 20) return 'Hm. Trabajo es trabajo.';
  return 'No me mires así. Hago lo que me pagás, ni más ni menos.';
}
