import type { CreatureKind } from '../creatures/creature-catalog';
import type { NpcRole } from '../economy/vendors';
import type { ItemKind } from '../items/item-catalog';
import type { SkillKey } from '../skills/skill-catalog';

/**
 * Leyendas: misiones largas que nadie te ofrece de frente. Empiezan con un
 * rumor que cuenta algún vecino (si le preguntás por rumores), siguen
 * preguntándole a la persona indicada por la palabra justa, llevan a un
 * lugar peligroso donde espera alguien con nombre propio y terminan
 * devolviendo lo que guardaba. El premio es un pergamino de maestría (+5 en
 * una habilidad difícil). Nada se dice del todo: hay que prestar atención.
 */
export const LEGEND_IDS = ['silent-grimoire', 'buried-crown', 'hermit-diary', 'burnt-key'] as const;
export type LegendId = (typeof LEGEND_IDS)[number];

export interface Legend {
  readonly id: LegendId;
  readonly title: string;
  /** Quiénes saben el rumor y qué cuentan. */
  readonly rumor: { readonly roles: readonly NpcRole[]; readonly text: string };
  /** A quién hay que preguntarle, y por qué palabras (cualquiera sirve). */
  readonly contact: NpcRole;
  readonly keywords: readonly string[];
  /** Lo que cuenta el contacto al preguntarle (empieza la búsqueda). */
  readonly briefing: string;
  /** Dónde espera el que hay que vencer, quién es y qué deja. */
  readonly place: string;
  readonly boss: { readonly kind: CreatureKind; readonly name: string };
  readonly escort: readonly CreatureKind[];
  readonly relic: ItemKind;
  /** Lo que dice el contacto al recibirlo. */
  readonly thanks: string;
  readonly reward: { readonly scroll: ItemKind; readonly gold: number };
}

/** Pasos de una leyenda: 0 oíste el rumor; 1 sabés a dónde ir; 2 tenés la reliquia; 3 terminada. */
export const LEGEND_HEARD = 0;
export const LEGEND_SEEKING = 1;
export const LEGEND_FOUND = 2;
export const LEGEND_DONE = 3;

export const LEGENDS: Readonly<Record<LegendId, Legend>> = {
  'silent-grimoire': {
    id: 'silent-grimoire',
    title: 'El grimorio del silencio',
    rumor: {
      roles: ['innkeeper', 'beggar', 'townsfolk'],
      text: 'Un viajero juró que en la Capilla Olvidada todavía reza un fraile... sin carne en los huesos. Dicen que el escriba daría cualquier cosa por el libro que ese fraile no suelta.',
    },
    contact: 'scribe',
    keywords: ['grimorio', 'fraile', 'capilla', 'libro'],
    briefing:
      '¿Quién te habló del fraile? Se llamaba Osvaldo. Robó el Grimorio del Silencio de esta misma escribanía y se encerró en la Capilla Olvidada a leerlo hasta morir... y siguió leyendo. Traémelo y te enseño algo que no está escrito en ningún otro lado.',
    place: 'Capilla Olvidada',
    boss: { kind: 'skeleton-mage', name: 'Fray Osvaldo el Hueco' },
    escort: ['skeleton', 'skeleton'],
    relic: 'silent-grimoire',
    thanks:
      'El Grimorio... todavía está tibio. Tomá: este pergamino vale más que todo el oro que tengo.',
    reward: { scroll: 'mastery-magery', gold: 300 },
  },
  'buried-crown': {
    id: 'buried-crown',
    title: 'La corona enterrada',
    rumor: {
      roles: ['fisherman', 'innkeeper', 'beggar', 'shipwright'],
      text: 'Los viejos del puerto cuentan que en las Ruinas del Sol enterraron a un rey con su corona puesta. Y que el rey no quiso quedarse quieto. El joyero se pone pálido si se la nombrás.',
    },
    contact: 'jeweler',
    keywords: ['corona', 'rey', 'ruinas'],
    briefing:
      'Shh, no tan fuerte. La corona del Rey Sepultado es real: mi abuelo la vio. Está en las Ruinas del Sol, sobre una calavera que todavía da órdenes. Si me la traés, te doy algo que hace mejor guerrero a cualquiera.',
    place: 'Ruinas del Sol',
    boss: { kind: 'lich', name: 'el Rey Sepultado' },
    escort: ['skeleton', 'giant-spider'],
    relic: 'buried-crown',
    thanks: 'La corona... pesa más de lo que parece. Cumplo mi palabra: esto es tuyo.',
    reward: { scroll: 'mastery-tactics', gold: 400 },
  },
  'hermit-diary': {
    id: 'hermit-diary',
    title: 'El diario del ermitaño',
    rumor: {
      roles: ['farmer', 'townsfolk', 'healer', 'innkeeper'],
      text: 'El ermitaño del bosque curaba con hierbas mejor que cualquier sanador. Un día dejó de bajar al pueblo. Hay quien dice que de noche se ve una luz pálida en su cabaña. La hermana Clara lo conocía bien.',
    },
    contact: 'healer',
    keywords: ['ermitaño', 'ermitano', 'diario', 'hierbas', 'cabaña'],
    briefing:
      'Fue mi maestro. Anotaba todo en un diario: cada hierba, cada herida. Si se convirtió en lo que temo, no va a querer soltarlo. La cabaña está en el bosque: la Casa del Ermitaño. Traeme el diario y te enseño lo que él me enseñó a mí.',
    place: 'Casa del Ermitaño',
    boss: { kind: 'wraith', name: 'el Ermitaño' },
    escort: ['zombie'],
    relic: 'hermit-diary',
    thanks: 'Su letra... Gracias. Que descanse. Esto lo escribió él para quien lo mereciera.',
    reward: { scroll: 'mastery-healing', gold: 200 },
  },
  'burnt-key': {
    id: 'burnt-key',
    title: 'La llave de la granja quemada',
    rumor: {
      roles: ['beggar', 'farmer', 'townsfolk', 'guard'],
      text: 'La granja de los Velázquez no se quemó sola. El que la prendió fuego anda por ahí de noche, entre las cenizas, buscando algo. El herrero hizo las cerraduras de esa casa: él sabe qué.',
    },
    contact: 'blacksmith',
    keywords: ['granja', 'quemada', 'llave', 'incendio', 'cerradura'],
    briefing:
      'Lázaro... le hice una llave a pedido para el cofre de los Velázquez, el que tenía todo su oro. Esa misma noche ardió la granja. Si todavía la tiene, sacásela: es la única copia. Y te enseño lo que sé de cerraduras, que no es poco.',
    place: 'Granja Quemada',
    boss: { kind: 'ghoul', name: 'Lázaro el incendiario' },
    escort: ['ghoul'],
    relic: 'burnt-key',
    thanks: 'Mi llave. Ahora se va a fundir en la forja, como debió ser. Tomá, te lo ganaste.',
    reward: { scroll: 'mastery-lockpicking', gold: 250 },
  },
};

/** Lo que pone el diario de misiones en cada paso (sin decir de más). */
export function legendHint(legend: Legend, step: number): string {
  if (step >= LEGEND_DONE) return 'Terminada.';
  if (step === LEGEND_FOUND) return 'Tenés la reliquia: llevásela a quien te habló de ella.';
  if (step === LEGEND_SEEKING) return `Buscá a ${legend.boss.name} en ${legend.place}.`;
  return `Un rumor: "${legend.rumor.text}"`;
}

/** Pergaminos de maestría: cuánto suben (en décimas) y qué habilidad. */
export const MASTERY_GAIN = 50;
export const MASTERY_SCROLLS: Readonly<Partial<Record<ItemKind, SkillKey>>> = {
  'mastery-magery': 'magery',
  'mastery-tactics': 'tactics',
  'mastery-healing': 'healing',
  'mastery-lockpicking': 'lockpicking',
};

export function isLegendId(value: unknown): value is LegendId {
  return typeof value === 'string' && (LEGEND_IDS as readonly string[]).includes(value);
}
