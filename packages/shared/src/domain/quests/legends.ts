import type { CreatureKind } from '../creatures/creature-catalog';
import type { NpcRole } from '../economy/vendors';
import type { ItemKind } from '../items/item-catalog';
import type { SkillKey } from '../skills/skill-catalog';

/**
 * Leyendas: misiones largas que nadie te ofrece de frente. Empiezan con un
 * rumor que cuenta algún vecino (si le preguntás por rumores) y siguen paso a
 * paso: preguntarle a la persona indicada por la palabra justa, ir a un lugar
 * a buscar rastros, encontrar a alguien escondido, vencer a quien tiene lo
 * que se busca y devolverlo. El premio: un pergamino de maestría (+5 en una
 * habilidad), oro y algo más. Nada se dice del todo: hay que prestar atención.
 * La guía de cada una está en docs/MISIONES.md.
 */
export const LEGEND_IDS = [
  'silent-grimoire',
  'buried-crown',
  'hermit-diary',
  'burnt-key',
  'miller-daughter',
  'keeper-log',
  'poisoned-well',
  'orc-banner',
  'lost-cartographer',
  'crater-heart',
  'order-vow',
  'red-feather',
  'captain-schooner',
  'deserter-gate',
] as const;
export type LegendId = (typeof LEGEND_IDS)[number];

/** Un paso de una leyenda: lo que hay que hacer para pasar al siguiente. */
export type LegendStep =
  /** Preguntarle a alguien de un oficio (en cualquier pueblo) por alguna de las palabras. */
  | {
      readonly kind: 'ask';
      readonly role: NpcRole;
      /** Si hay que preguntarle a alguien en particular (un caminante), su nombre. */
      readonly person?: string;
      readonly keywords: readonly string[];
      readonly reply: string;
      readonly hint: string;
      /** Algo que te da para seguir (una carta, una pista). */
      readonly gives?: ItemKind;
    }
  /** Llegar a un lugar y encontrar un rastro. */
  | {
      readonly kind: 'visit';
      readonly place: string;
      readonly found: string;
      readonly hint: string;
      readonly gives?: ItemKind;
    }
  /** Encontrar a alguien escondido en un lugar (aparece al llegar) y hablarle. */
  | {
      readonly kind: 'meet';
      readonly place: string;
      readonly person: { readonly name: string; readonly role: NpcRole };
      readonly reply: string;
      readonly hint: string;
    }
  /** Vencer a alguien con nombre propio en su lugar: deja la reliquia. */
  | {
      readonly kind: 'slay';
      readonly place: string;
      readonly boss: { readonly kind: CreatureKind; readonly name: string };
      readonly escort: readonly CreatureKind[];
      readonly relic: ItemKind;
      readonly hint: string;
    }
  /** Devolver la reliquia a alguien de un oficio, o a la persona que se encontró. */
  | {
      readonly kind: 'return';
      readonly role: NpcRole;
      /** Si es a alguien en particular (el que se encontró en un paso `meet`). */
      readonly person?: string;
      readonly item: ItemKind;
      readonly thanks: string;
    }
  /**
   * El final con una decisión: lo que se encontró se le puede entregar a una
   * persona o a otra, y cada una termina la historia a su manera (con otro
   * premio y otro peso en la conciencia). Se elige con solo ir a hablarle.
   */
  | {
      readonly kind: 'choice';
      readonly item: ItemKind;
      readonly options: readonly LegendOption[];
    };

/** Una de las maneras de terminar una historia con decisión. */
export interface LegendOption {
  readonly role: NpcRole;
  /** Si es a alguien en particular (un caminante, o quien se encontró en un paso `meet`). */
  readonly person?: string;
  readonly thanks: string;
  /** Lo que queda anotado en el diario. */
  readonly ending: string;
  readonly gold: number;
  /** Cuánto sube (o baja) el karma. */
  readonly karma: number;
  readonly items?: readonly (readonly [ItemKind, number])[];
}

export interface Legend {
  readonly id: LegendId;
  readonly title: string;
  /** Quiénes saben el rumor y qué cuentan. */
  readonly rumor: { readonly roles: readonly NpcRole[]; readonly text: string };
  /** Los pasos en orden; el primero es preguntarle al que sabe. */
  readonly steps: readonly LegendStep[];
  readonly reward: {
    readonly scroll: ItemKind;
    readonly gold: number;
    readonly items?: readonly (readonly [ItemKind, number])[];
  };
}

/**
 * Avance de un jugador en una leyenda: el número del paso que le toca (0 =
 * oyó el rumor y tiene que preguntarle al que sabe). Terminada cuando llega a
 * la cantidad de pasos. Las cuatro primeras tienen tres pasos (preguntar,
 * vencer, devolver), y sus nombres de siempre:
 */
export const LEGEND_HEARD = 0;
export const LEGEND_SEEKING = 1;
export const LEGEND_FOUND = 2;
export const LEGEND_DONE = 3;

/** El paso en que una leyenda queda terminada. */
export function legendEnd(id: LegendId): number {
  return LEGENDS[id].steps.length;
}

/**
 * El número más alto que puede tener el avance de una leyenda: las que
 * terminan con una decisión guardan cuál fue (fin + número de la opción).
 */
export function legendMax(id: LegendId): number {
  const steps = LEGENDS[id].steps;
  const last = steps[steps.length - 1];
  return steps.length + (last?.kind === 'choice' ? last.options.length - 1 : 0);
}

/** El paso que le toca a quien va por `step` (null si ya terminó). */
export function legendStep(legend: Legend, step: number): LegendStep | null {
  return legend.steps[step] ?? null;
}

/** Las tres de siempre: preguntar al que sabe, vencer al jefe en su lugar y devolverle lo que dejó. */
function classic(spec: {
  contact: NpcRole;
  keywords: readonly string[];
  briefing: string;
  place: string;
  boss: { kind: CreatureKind; name: string };
  escort: readonly CreatureKind[];
  relic: ItemKind;
  thanks: string;
}): readonly LegendStep[] {
  return [
    {
      kind: 'ask',
      role: spec.contact,
      keywords: spec.keywords,
      reply: spec.briefing,
      hint: `Buscá a ${spec.boss.name} en ${spec.place}.`,
    },
    {
      kind: 'slay',
      place: spec.place,
      boss: spec.boss,
      escort: spec.escort,
      relic: spec.relic,
      hint: 'Tenés la reliquia: llevásela a quien te habló de ella.',
    },
    {
      kind: 'return',
      role: spec.contact,
      item: spec.relic,
      thanks: spec.thanks,
    },
  ];
}

export const LEGENDS: Readonly<Record<LegendId, Legend>> = {
  'silent-grimoire': {
    id: 'silent-grimoire',
    title: 'El grimorio del silencio',
    rumor: {
      roles: ['innkeeper', 'beggar', 'townsfolk'],
      text: 'Un viajero juró que en la Capilla Olvidada todavía reza un fraile... sin carne en los huesos. Dicen que el escriba daría cualquier cosa por el libro que ese fraile no suelta.',
    },
    steps: classic({
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
    }),
    reward: {
      scroll: 'mastery-magery',
      gold: 500,
      items: [
        ['blank-scroll', 20],
        ['black-pearl', 30],
      ],
    },
  },
  'buried-crown': {
    id: 'buried-crown',
    title: 'La corona enterrada',
    rumor: {
      roles: ['fisherman', 'innkeeper', 'beggar', 'shipwright'],
      text: 'Los viejos del puerto cuentan que en las Ruinas del Sol enterraron a un rey con su corona puesta. Y que el rey no quiso quedarse quieto. El joyero se pone pálido si se la nombrás.',
    },
    steps: classic({
      contact: 'jeweler',
      keywords: ['corona', 'rey', 'ruinas'],
      briefing:
        'Shh, no tan fuerte. La corona del Rey Sepultado es real: mi abuelo la vio. Está en las Ruinas del Sol, sobre una calavera que todavía da órdenes. Si me la traés, te doy algo que hace mejor guerrero a cualquiera.',
      place: 'Ruinas del Sol',
      boss: { kind: 'lich', name: 'el Rey Sepultado' },
      escort: ['skeleton', 'giant-spider'],
      relic: 'buried-crown',
      thanks: 'La corona... pesa más de lo que parece. Cumplo mi palabra: esto es tuyo.',
    }),
    reward: {
      scroll: 'mastery-tactics',
      gold: 800,
      items: [
        ['diamond', 2],
        ['ruby', 3],
      ],
    },
  },
  'hermit-diary': {
    id: 'hermit-diary',
    title: 'El diario del ermitaño',
    rumor: {
      roles: ['farmer', 'townsfolk', 'healer', 'innkeeper'],
      text: 'El ermitaño del bosque curaba con hierbas mejor que cualquier sanador. Un día dejó de bajar al pueblo. Hay quien dice que de noche se ve una luz pálida en su cabaña. La hermana Clara lo conocía bien.',
    },
    steps: classic({
      contact: 'healer',
      keywords: ['ermitaño', 'ermitano', 'diario', 'hierbas', 'cabaña'],
      briefing:
        'Fue mi maestro. Anotaba todo en un diario: cada hierba, cada herida. Si se convirtió en lo que temo, no va a querer soltarlo. La cabaña está en el bosque: la Casa del Ermitaño. Traeme el diario y te enseño lo que él me enseñó a mí.',
      place: 'Casa del Ermitaño',
      boss: { kind: 'wraith', name: 'el Ermitaño' },
      escort: ['zombie'],
      relic: 'hermit-diary',
      thanks: 'Su letra... Gracias. Que descanse. Esto lo escribió él para quien lo mereciera.',
    }),
    reward: {
      scroll: 'mastery-healing',
      gold: 400,
      items: [
        ['bandage', 50],
        ['healing-potion', 5],
      ],
    },
  },
  'burnt-key': {
    id: 'burnt-key',
    title: 'La llave de la granja quemada',
    rumor: {
      roles: ['beggar', 'farmer', 'townsfolk', 'guard'],
      text: 'La granja de los Velázquez no se quemó sola. El que la prendió fuego anda por ahí de noche, entre las cenizas, buscando algo. El herrero hizo las cerraduras de esa casa: él sabe qué.',
    },
    steps: classic({
      contact: 'blacksmith',
      keywords: ['granja', 'quemada', 'llave', 'incendio', 'cerradura', 'lazaro', 'velazquez'],
      briefing:
        'Lázaro... le hice una llave a pedido para el cofre de los Velázquez, el que tenía todo su oro. Esa misma noche ardió la granja. Todavía ronda las cenizas de la Granja Quemada, buscando el cofre. Si tiene la llave, sacásela: es la única copia. Y te enseño lo que sé de cerraduras, que no es poco.',
      place: 'Granja Quemada',
      boss: { kind: 'ghoul', name: 'Lázaro el incendiario' },
      escort: ['ghoul'],
      relic: 'burnt-key',
      thanks: 'Mi llave. Ahora se va a fundir en la forja, como debió ser. Tomá, te lo ganaste.',
    }),
    reward: {
      scroll: 'mastery-lockpicking',
      gold: 450,
      items: [
        ['lockpick', 20],
        ['iron-ingot', 40],
      ],
    },
  },
  'miller-daughter': {
    id: 'miller-daughter',
    title: 'La hija del molinero',
    rumor: {
      roles: ['innkeeper', 'townsfolk', 'baker', 'tailor'],
      text: 'La hija del molinero de la Chacra del Molino desapareció hace una semana. El padre no duerme ni come. Dicen que la vieron irse con un forastero que decía ser pescador. Los granjeros saben más de lo que cuentan.',
    },
    steps: [
      {
        kind: 'ask',
        role: 'farmer',
        keywords: ['hija', 'desaparecida', 'molinero', 'marta', 'molino'],
        reply:
          'Marta... mi Marta. Se fue con un muchacho que decía llamarse Nicanor, pescador de Puerto Brasa. ¡Mentira! Ningún pescador tiene esas manos. Preguntale a los pescadores: entre ellos se conocen todos.',
        hint: 'Preguntale a un pescador por Nicanor y por Marta, la hija del molinero.',
      },
      {
        kind: 'ask',
        role: 'fisherman',
        keywords: ['nicanor', 'marta', 'molinero', 'hija', 'forastero', 'muchacho'],
        reply:
          '¿Nicanor? No es de los nuestros. Lo vi una noche cargando una chica en un carro, rumbo a la Granja del Arroyo. Ella iba atada. No dije nada... tenía miedo. Andá vos, que tenés espada.',
        hint: 'Buscá rastros de Marta en la Granja del Arroyo.',
      },
      {
        kind: 'visit',
        place: 'Granja del Arroyo',
        found:
          'Junto al arroyo hay un carro volcado, cuerdas cortadas y una cinta azul enganchada en un clavo. Unas pisadas chicas, descalzas, se alejan corriendo hacia el Cementerio Viejo. Se escapó.',
        hint: 'Seguí las pisadas descalzas hasta el Cementerio Viejo.',
        gives: 'blue-ribbon',
      },
      {
        kind: 'meet',
        place: 'Cementerio Viejo',
        person: { name: 'Marta', role: 'beggar' },
        reply:
          '¡No me lastimes! ¿Te manda mi padre? Esa cinta es mía... Me escapé de Nicanor: no es pescador, es el jefe de los bandoleros. Me quería vender en el sur. Se llevó el relicario de mi madre. Mientras él ande suelto no puedo volver: está en la Guarida de Bandoleros.',
        hint: 'Vencé a Nicanor en la Guarida de Bandoleros y recuperá el relicario de Marta.',
      },
      {
        kind: 'slay',
        place: 'Guarida de Bandoleros',
        boss: { kind: 'brigand', name: 'Nicanor el falso pescador' },
        escort: ['brigand', 'brigand'],
        relic: 'marta-locket',
        hint: 'Llevale el relicario al molinero (un granjero) para que sepa que Marta está a salvo.',
      },
      {
        kind: 'return',
        role: 'farmer',
        item: 'marta-locket',
        thanks:
          '¡El relicario de su madre! Entonces es verdad: Marta está a salvo y ese canalla no vuelve más. No tengo mucho, pero tomá: era de mi abuelo, que fue soldado del rey.',
      },
    ],
    reward: {
      scroll: 'mastery-swordsmanship',
      gold: 900,
      items: [
        ['plate-helm', 1],
        ['healing-potion', 5],
      ],
    },
  },
  'keeper-log': {
    id: 'keeper-log',
    title: 'La luz del Faro del Cabo',
    rumor: {
      roles: ['fisherman', 'shipwright', 'innkeeper', 'beggar'],
      text: 'El farero del Faro del Cabo dejó de prender la luz hace tres lunas. Desde entonces se hunden barcos en las rocas, uno por semana. El que hace los barcos dice que no es casualidad.',
    },
    steps: [
      {
        kind: 'ask',
        role: 'shipwright',
        keywords: ['faro', 'farero', 'barcos', 'luz', 'hundidos', 'naufragio'],
        reply:
          'El farero se llamaba Bruno. La última vez que bajó me contó, borracho, que alguien le ofrecía oro por apagar la luz. Al otro día no lo vimos más. Si dejó algo escrito, está en su bitácora, allá arriba en el faro.',
        hint: 'Subí al Faro del Cabo y buscá la bitácora del farero.',
      },
      {
        kind: 'visit',
        place: 'Faro del Cabo',
        found:
          'Entre vidrios rotos y aceite seco encontrás la bitácora de Bruno. La última página dice: «Pagan bien. Que Dios me perdone.» Hay renglones que no se leen, escritos con algo transparente.',
        hint: 'Llevale la bitácora a un escriba: él sabe leer lo que no se ve.',
        gives: 'keeper-log',
      },
      {
        kind: 'ask',
        role: 'scribe',
        keywords: ['bitacora', 'farero', 'faro', 'bruno', 'leer', 'escrito'],
        reply:
          'Tinta de limón: con calor aparece. A ver... «Ulises el corsario. Cada luna nueva. Cala de los Piratas.» Ese Ulises le pagaba para que los barcos encallaran y después los saqueaba. Bruno no se fue: lo callaron.',
        hint: 'Vencé al corsario Ulises en la Cala de los Piratas.',
      },
      {
        kind: 'slay',
        place: 'Cala de los Piratas',
        boss: { kind: 'corsair', name: 'Ulises el corsario' },
        escort: ['pirate', 'pirate'],
        relic: 'ulises-spyglass',
        hint: 'Llevale el catalejo de Ulises al que hace barcos.',
      },
      {
        kind: 'return',
        role: 'shipwright',
        item: 'ulises-spyglass',
        thanks:
          'El catalejo de Ulises... con esto miraba los barcos que iba a hundir. Lo voy a colgar en el astillero, para que nadie se olvide. Tomá: los marineros juntamos esto para quien lo vengara.',
      },
    ],
    reward: {
      scroll: 'mastery-fishing',
      gold: 800,
      items: [
        ['sapphire', 4],
        ['refresh-potion', 5],
      ],
    },
  },
  'poisoned-well': {
    id: 'poisoned-well',
    title: 'El pozo envenenado',
    rumor: {
      roles: ['healer', 'farmer', 'baker', 'butcher'],
      text: 'En la Granja de los Olmos se murieron todos los animales en una noche. La sanadora dice que fue el agua del pozo... y que el agua no se envenena sola.',
    },
    steps: [
      {
        kind: 'ask',
        role: 'healer',
        keywords: ['pozo', 'envenenado', 'veneno', 'agua', 'olmos', 'animales'],
        reply:
          'Probé el agua: raíz de mandrágora y algo oscuro, de nigromante. Ese veneno lo preparó alguien que sabe. Antes de acusar a nadie, mirá el pozo de la Granja de los Olmos: el que lo hizo tuvo que dejar algún rastro.',
        hint: 'Revisá el pozo de la Granja de los Olmos.',
      },
      {
        kind: 'visit',
        place: 'Granja de los Olmos',
        found:
          'En el borde del pozo hay polvo negro y huellas de botas finas, de ciudad. Un pedazo de papel quemado dice «...drágora, doce raíces. Pagado.» Es una cuenta de alguna tienda.',
        hint: 'Preguntale a un alquimista quién compró doce raíces de mandrágora.',
      },
      {
        kind: 'ask',
        role: 'alchemist',
        keywords: ['mandragora', 'veneno', 'pozo', 'compro', 'raices', 'cuenta'],
        reply:
          '¿Doce raíces? Severino, el aprendiz que echaron de la torre de magos. Flaco, ojeroso, con olor a azufre. Decía que iba a volver a la Torre Hueca a terminar sus experimentos... con seres vivos. Ahora entiendo.',
        hint: 'Buscá a Severino en la Torre Hueca.',
      },
      {
        kind: 'slay',
        place: 'Torre Hueca',
        boss: { kind: 'skeleton-mage', name: 'Severino el envenenador' },
        escort: ['zombie', 'giant-spider'],
        relic: 'poison-vial',
        hint: 'Llevale el frasco de veneno a la sanadora.',
      },
      {
        kind: 'return',
        role: 'healer',
        item: 'poison-vial',
        thanks:
          'Su frasco... con esto puedo preparar el antídoto para las otras granjas. Salvaste más vidas de las que te imaginás. Tomá: es lo mejor que tengo.',
      },
    ],
    reward: {
      scroll: 'mastery-alchemy',
      gold: 700,
      items: [
        ['cure-potion', 6],
        ['healing-potion', 6],
      ],
    },
  },
  'orc-banner': {
    id: 'orc-banner',
    title: 'La capa del capitán',
    rumor: {
      roles: ['guard', 'innkeeper', 'bowyer', 'stablemaster'],
      text: 'Los orcos del Campamento de los Colmillos atacan las caravanas con un estandarte hecho con la capa del capitán Ramiro, el de la guardia. El capitán nunca volvió. A los guardias no les gusta hablar de eso.',
    },
    steps: [
      {
        kind: 'ask',
        role: 'guard',
        keywords: ['capitan', 'ramiro', 'orcos', 'colmillos', 'estandarte', 'capa', 'caravana'],
        reply:
          'Ramiro era mi capitán. Que su capa flamee en ese campamento es una vergüenza para toda la guardia. Pero no vayas a ciegas: el flechero del pueblo vio la última pelea desde los árboles. Preguntale cómo cayó.',
        hint: 'Preguntale a un flechero (el que hace arcos) cómo cayó el capitán Ramiro.',
      },
      {
        kind: 'ask',
        role: 'bowyer',
        keywords: ['ramiro', 'capitan', 'pelea', 'orcos', 'emboscada', 'cayo'],
        reply:
          'Lo vi caer, sí. No fue un orco cualquiera: Grushk, el jefe, uno con un colmillo de oro, que pega con las dos manos. Lo rodearon entre cuatro. Si vas, que no te rodeen: peleá de espaldas a algo y llevá vendas.',
        hint: 'Vencé a Grushk Colmillo de Oro en el Campamento de los Colmillos.',
      },
      {
        kind: 'slay',
        place: 'Campamento de los Colmillos',
        boss: { kind: 'orc', name: 'Grushk Colmillo de Oro' },
        escort: ['orc', 'orc', 'orc'],
        relic: 'ramiro-banner',
        hint: 'Devolvele la capa del capitán a un guardia.',
      },
      {
        kind: 'return',
        role: 'guard',
        item: 'ramiro-banner',
        thanks:
          'La capa del capitán. Vamos a enterrarla con honores. Y esto... era su coraza: él habría querido que la lleve alguien como vos.',
      },
    ],
    reward: {
      scroll: 'mastery-anatomy',
      gold: 700,
      items: [
        ['plate-chest', 1],
        ['bandage', 30],
      ],
    },
  },
  'lost-cartographer': {
    id: 'lost-cartographer',
    title: 'El cartógrafo perdido',
    rumor: {
      roles: ['scribe', 'provisioner', 'mage', 'banker'],
      text: 'Un cartógrafo salió a dibujar el norte helado y no volvió. Dejó pagada la cuenta de la taberna por un año: pensaba volver. El tabernero todavía le guarda la pieza.',
    },
    steps: [
      {
        kind: 'ask',
        role: 'innkeeper',
        keywords: ['cartografo', 'mapas', 'norte', 'cuenta', 'pieza', 'viajero'],
        reply:
          'Anselmo Ríos, sí. Buen tipo, pagaba siempre. Antes de irse compró de todo para el frío: abrigo, sogas, linternas. El proveedor del pueblo seguro sabe a dónde iba.',
        hint: 'Preguntale a un proveedor (el de la tienda) por Anselmo, el cartógrafo.',
      },
      {
        kind: 'ask',
        role: 'provisioner',
        keywords: ['anselmo', 'cartografo', 'compro', 'abrigo', 'norte', 'sogas'],
        reply:
          'Anselmo... iba al Refugio Helado, a dibujar los glaciares. Le dije que en esta época de ahí no vuelve nadie. Si está vivo, está ahí. Llevate algo caliente.',
        hint: 'Andá al Refugio Helado y buscá a Anselmo Ríos.',
      },
      {
        kind: 'meet',
        place: 'Refugio Helado',
        person: { name: 'Anselmo Ríos', role: 'beggar' },
        reply:
          '¡Una persona! Llevo semanas encerrado. Un yeti enorme, blanco como la nieve, ronda el refugio. Una noche entró y se llevó mi cuaderno, con todos los mapas del norte. Sin él, el viaje no sirvió de nada. Anda por acá cerca, lo oigo de noche.',
        hint: 'Vencé al Yeti Blanco cerca del Refugio Helado y recuperá el cuaderno de Anselmo.',
      },
      {
        kind: 'slay',
        place: 'Refugio Helado',
        boss: { kind: 'yeti', name: 'el Yeti Blanco' },
        escort: ['wolf', 'wolf'],
        relic: 'map-notebook',
        hint: 'Devolvele el cuaderno a Anselmo Ríos, en el Refugio Helado.',
      },
      {
        kind: 'return',
        role: 'beggar',
        person: 'Anselmo Ríos',
        item: 'map-notebook',
        thanks:
          '¡Mis mapas! Un poco mordidos, pero están todos. Ahora sí puedo volver. Tomá: en mis viajes encontré esto... un mapa que no es mío. Marca un tesoro. Te lo regalo, y también lo que sé de seguir huellas.',
      },
    ],
    reward: {
      scroll: 'mastery-tracking',
      gold: 600,
      items: [
        ['treasure-map', 1],
        ['shovel', 1],
      ],
    },
  },
  'crater-heart': {
    id: 'crater-heart',
    title: 'El corazón del cráter',
    rumor: {
      roles: ['mage', 'alchemist', 'jeweler', 'innkeeper'],
      text: 'Hace un año cayó una piedra del cielo en el Cráter Humeante. Desde entonces el cráter no deja de echar humo. La maga del pueblo paga fortunas por cualquier pedazo, pero los que fueron no volvieron.',
    },
    steps: [
      {
        kind: 'ask',
        role: 'mage',
        keywords: ['piedra', 'cielo', 'crater', 'humo', 'fortuna', 'cayo'],
        reply:
          'No es una piedra: es un corazón de fuego, puro maná. Un dragón joven, Brasaviva, se echó a dormir encima y no deja que nadie se acerque. Pero cuidado: antes de ir, preguntale al joyero qué pasó con el último que lo intentó.',
        hint: 'Preguntale a un joyero por el último que fue al Cráter Humeante.',
      },
      {
        kind: 'ask',
        role: 'jeweler',
        keywords: ['crater', 'dragon', 'brasaviva', 'corazon', 'piedra', 'ultimo'],
        reply:
          'Teodoro, un cazador de dragones. Me trajo una escama y me dijo: «El fuego no es lo peor; lo peor son los que lo cuidan.» Volvió a ir y no volvió. Llevá pociones y no pelees solo, si podés.',
        hint: 'Vencé a Brasaviva en el Cráter Humeante.',
      },
      {
        kind: 'slay',
        place: 'Cráter Humeante',
        boss: { kind: 'drake', name: 'Brasaviva' },
        escort: ['fire-elemental'],
        relic: 'fire-heart',
        hint: 'Llevale el corazón de fuego a la maga.',
      },
      {
        kind: 'return',
        role: 'mage',
        item: 'fire-heart',
        thanks:
          'Está latiendo... Con esto puedo estudiar diez años. Te prometí una fortuna y la cumplo. Y te enseño a calmar la mente para que el maná vuelva solo.',
      },
    ],
    reward: {
      scroll: 'mastery-meditation',
      gold: 1200,
      items: [
        ['ruby', 4],
        ['diamond', 2],
      ],
    },
  },
  'order-vow': {
    id: 'order-vow',
    title: 'Lo que cuidaba la orden',
    rumor: {
      roles: ['wanderer', 'healer', 'scribe', 'innkeeper'],
      text: 'Anda un fraile por las encrucijadas, Fray Lupercio, el último de la orden de la Capilla Olvidada. Dice que juraron cuidar algo y que se murieron todos sin decirle qué. Pregunta por eso a todo el que pasa.',
    },
    steps: [
      {
        kind: 'ask',
        role: 'wanderer',
        person: 'Fray Lupercio',
        keywords: ['orden', 'capilla', 'cuidaban', 'cuidar', 'juramento', 'llave', 'secreto'],
        reply:
          'Lo único que sé: había una llave, y el hermano Anselmo la llevaba al cuello. Lo enterramos con ella en el Cementerio Viejo, en la tumba del fondo, la de la cruz torcida. Yo no tengo estómago para abrir la tumba de un amigo. Si vos sí... mirá sin romper.',
        hint: 'Andá al Cementerio Viejo y buscá la tumba del hermano Anselmo.',
      },
      {
        kind: 'visit',
        place: 'Cementerio Viejo',
        found:
          'La tumba de la cruz torcida ya está abierta. Tierra fresca: fue hace poco. No hay llave. En el barro, huellas de botas finas, de ciudad, y una moneda de las que se le dan a alguien para que mire para otro lado.',
        hint: 'Alguien pagó para que no lo vieran en el cementerio. Preguntale a un sanador: ellos entierran a los muertos y saben quién anduvo por ahí.',
      },
      {
        kind: 'ask',
        role: 'healer',
        keywords: ['cementerio', 'tumba', 'anselmo', 'llave', 'moneda', 'huellas', 'abrieron'],
        reply:
          'Bajá la voz. Sí, vino uno, de túnica gris, sin cara que uno pueda recordar. Pagó en oro viejo para que nadie pasara esa noche. Olía a pantano y a vela. Así huelen los que sirven en la Torre Hueca. Yo no te dije nada.',
        hint: 'El que se llevó la llave sirve en la Torre Hueca. Recuperala.',
      },
      {
        kind: 'slay',
        place: 'Torre Hueca',
        boss: { kind: 'skeleton-mage', name: 'el Aprendiz Sin Rostro' },
        escort: ['skeleton', 'skeleton', 'zombie'],
        relic: 'order-key',
        hint: 'Llevá la llave a la Capilla Olvidada y buscá qué abre.',
      },
      {
        kind: 'visit',
        place: 'Capilla Olvidada',
        found:
          'La llave entra en una losa detrás del altar. Abajo hay un cofre de plomo, soldado, y una tablilla: «No es un tesoro. Es una promesa. No abrir, no vender, no acercar al pantano.» El cofre está tibio. Adentro, algo late despacio.',
        hint: 'Un escriba puede leer lo que dice la tablilla del cofre. Preguntale qué es.',
        gives: 'lead-casket',
      },
      {
        kind: 'ask',
        role: 'scribe',
        keywords: ['cofre', 'plomo', 'tablilla', 'promesa', 'late', 'orden', 'capilla'],
        reply:
          'Dejame ver... Esto es letra del imperio. Dice que el mago de la Torre Hueca, para no morir, sacó su vida del cuerpo y la guardó aparte. La orden se la robó y juró tenerla lejos: mientras no la recupere, el liche no puede salir del pantano. Si se rompe el cofre, él se termina para siempre. Y si llega a manos de un mago... un mago pagaría lo que le pidas. Pensá bien a quién se lo llevás.',
        hint: 'Decidí: llevale el cofre a Fray Lupercio, para que la orden cumpla su promesa, o vendéselo a un mago.',
      },
      {
        kind: 'choice',
        item: 'lead-casket',
        options: [
          {
            role: 'wanderer',
            person: 'Fray Lupercio',
            thanks:
              'Así que era esto. Cuarenta hermanos, doscientos años, cuidando que un muerto no terminara de volver. Dámelo. Sé dónde hay un horno de herrero que no pregunta. ...Gracias. Ya me acordé de qué era lo que cuidábamos: era a todos ustedes.',
            ending: 'Le diste el cofre a Fray Lupercio. La orden cumplió su promesa.',
            gold: 500,
            karma: 600,
            items: [['healing-potion', 5]],
          },
          {
            role: 'mage',
            thanks:
              '¿Sabés lo que es esto? No, claro que no, si supieras no me lo venderías. Tomá, y no cuentes las monedas acá. Lo voy a... estudiar. Con mucho cuidado. Andate tranquilo.',
            ending: 'Le vendiste el cofre a un mago. Nadie sabe qué hizo con él.',
            gold: 2500,
            karma: -500,
          },
        ],
      },
    ],
    reward: { scroll: 'mastery-magic-resist', gold: 0 },
  },
  'red-feather': {
    id: 'red-feather',
    title: 'La pluma roja',
    rumor: {
      roles: ['wanderer', 'farmer', 'provisioner', 'townsfolk'],
      text: 'En una encrucijada hay una nena sola, Abril, esperando al padre. Dice que es un buhonero de sombrero con pluma roja y que vuelve antes de que baje el sol. Hace días que dice lo mismo.',
    },
    steps: [
      {
        kind: 'ask',
        role: 'wanderer',
        person: 'la Niña Abril',
        keywords: ['papa', 'padre', 'evaristo', 'buhonero', 'sombrero', 'pluma'],
        reply:
          'Se fue para las granjas, a vender el tónico. Siempre pasa primero por las granjas, porque ahí le compran. ¿Lo vas a buscar? Decile que no me moví. Bueno, me moví un poquito, pero volví.',
        hint: 'Preguntale a un granjero si vio a Evaristo, el buhonero de la pluma roja.',
      },
      {
        kind: 'ask',
        role: 'farmer',
        keywords: ['evaristo', 'buhonero', 'pluma', 'tonico', 'sombrero'],
        reply:
          'El del tónico, sí. Me vendió un frasco que no cura nada. Se fue con dos tipos de capa que le prometieron comprarle la carga entera. Iban para el lado de la Guarida de Bandoleros. Yo le hice señas, pero el hombre veía monedas, no capas.',
        hint: 'Andá a la Guarida de Bandoleros y buscá algún rastro de Evaristo.',
      },
      {
        kind: 'visit',
        place: 'Guarida de Bandoleros',
        found:
          'Junto a una fogata apagada hay un sombrero pisoteado, con una pluma roja. Adentro de la copa, un papel: «Malena: te debo, ya sé. Me escondo donde el ermitaño hasta juntar. No toques a la nena.» No es letra de alguien secuestrado.',
        hint: 'Evaristo se esconde en la Casa del Ermitaño. Andá a buscarlo.',
        gives: 'red-feather-hat',
      },
      {
        kind: 'meet',
        place: 'Casa del Ermitaño',
        person: { name: 'Evaristo el buhonero', role: 'beggar' },
        reply:
          '¿Te manda Malena? ¿No? ...¿Abril? ¿Sigue en el cruce? Soy una basura. No me secuestró nadie: aposté el anillo de su madre, lo único que le quedaba de ella, y lo perdí con la Tuerta Malena, la que manda en la guarida. No puedo mirar a mi hija sin ese anillo. Traémelo y vuelvo. Y por favor... a ella decile que me tenían preso.',
        hint: 'Recuperá el anillo: lo tiene la Tuerta Malena, en la Guarida de Bandoleros.',
      },
      {
        kind: 'slay',
        place: 'Guarida de Bandoleros',
        boss: { kind: 'brigand', name: 'la Tuerta Malena' },
        escort: ['brigand', 'brigand', 'brigand'],
        relic: 'mother-ring',
        hint: 'Decidí: llevale el anillo a Evaristo (y guardale el secreto), o dáselo a la Niña Abril y contale la verdad.',
      },
      {
        kind: 'choice',
        item: 'mother-ring',
        options: [
          {
            role: 'beggar',
            person: 'Evaristo el buhonero',
            thanks:
              'El anillo... Gracias. Vuelvo hoy mismo. Le voy a contar que me tuvieron atado y que un valiente me soltó. Vos y yo sabemos que no fue así. Tomá, es todo lo que junté escondido acá. No vuelvo a tocar un dado, te lo juro por ella.',
            ending:
              'Le llevaste el anillo a Evaristo y le guardaste el secreto. Volvió con su hija.',
            gold: 700,
            karma: 150,
            items: [['healing-potion', 3]],
          },
          {
            role: 'wanderer',
            person: 'la Niña Abril',
            thanks:
              '¡El anillo de mamá! ...¿Lo apostó? (Se queda callada un rato largo.) Yo ya sabía que no vendía tanto tónico. Gracias por no mentirme: todos los grandes me mienten. Voy a ir a buscarlo yo. Tomá, es mi piedra de la suerte. A mí ya no me hace falta: ahora tengo el anillo.',
            ending:
              'Le diste el anillo a Abril y le contaste la verdad. Fue ella a buscar a su padre.',
            gold: 150,
            karma: 500,
            items: [['emerald', 2]],
          },
        ],
      },
    ],
    reward: { scroll: 'mastery-archery', gold: 0 },
  },
  'captain-schooner': {
    id: 'captain-schooner',
    title: 'La goleta del capitán',
    rumor: {
      roles: ['wanderer', 'fisherman', 'shipwright', 'innkeeper'],
      text: 'Hay un capitán sin barco caminando tierra adentro, Olegario. Perdió su goleta a los dados contra un pirata: sacó uno siete veces seguidas. Siete. Hasta los piratas se rieron.',
    },
    steps: [
      {
        kind: 'ask',
        role: 'wanderer',
        person: 'Capitán Olegario Sinbarco',
        keywords: ['goleta', 'barco', 'dados', 'barbas', 'pirata', 'apuesta', 'golondrina'],
        reply:
          'La Golondrina. Veinte años juntos. Barbas puso los dados, yo puse la goleta: siete unos al hilo. Nadie tiene tanta mala suerte... ni yo. Uno de los hombres de Barbas dejó la piratería esa misma noche, de vergüenza, dicen. Hoy es pescador. Si alguien sabe algo de esos dados, es él.',
        hint: 'Preguntale a un pescador por los dados de Barbas.',
      },
      {
        kind: 'ask',
        role: 'fisherman',
        keywords: ['barbas', 'dados', 'pirata', 'goleta', 'olegario', 'golondrina'],
        reply:
          'No digas mi nombre cerca del agua. Sí, yo estaba. Los dados tienen plomo adentro: caen en uno si los tirás con la zurda. Barbas los lleva siempre encima. Vuelve a la Cala de los Piratas con cada luna, pero no sé cuál. El farero anota todo barco que pasa: mirá su bitácora.',
        hint: 'Andá al Faro del Cabo y mirá cuándo fondea la Golondrina.',
      },
      {
        kind: 'visit',
        place: 'Faro del Cabo',
        found:
          'En la bitácora del faro, entre barcos mercantes, una línea se repite: «Goleta de velas remendadas, sin bandera, rumbo a la cala. Vuelve cada luna.» La última anotación es de anoche. La Golondrina está fondeada.',
        hint: 'Barbas está en la Cala de los Piratas. Sacale los dados.',
      },
      {
        kind: 'slay',
        place: 'Cala de los Piratas',
        boss: { kind: 'corsair', name: 'Barbas el Tramposo' },
        escort: ['pirate', 'pirate', 'pirate'],
        relic: 'loaded-dice',
        hint: 'Mostrale los dados a un carpintero de barcos: él sabe si están cargados y qué dice la ley del puerto.',
      },
      {
        kind: 'ask',
        role: 'shipwright',
        keywords: ['dados', 'cargados', 'plomo', 'goleta', 'golondrina', 'ley', 'apuesta'],
        reply:
          'A ver... (Los hace rodar. Uno. Uno. Uno.) Plomo, sí. Por la ley del puerto, una apuesta con dados cargados no vale: la Golondrina nunca dejó de ser de Olegario. Ahora, entre nosotros: Barbas ya no la reclama y los papeles están en blanco. El que me traiga estos dados como prueba, firma. Puede ser el capitán... o podés ser vos. Yo no vi nada.',
        hint: 'Decidí: llevale los dados al Capitán Olegario, para que recupere su goleta, o dáselos al carpintero de barcos y quedate vos con el barco.',
      },
      {
        kind: 'choice',
        item: 'loaded-dice',
        options: [
          {
            role: 'wanderer',
            person: 'Capitán Olegario Sinbarco',
            thanks:
              '¡Plomo! ¡Lo sabía! ¡Siete unos, las pelotas! Con esto la Golondrina vuelve a ser mía por ley. Mirá, me tiemblan las manos. Tomá: es lo que tenía guardado para comprar un bote. Ya no me hace falta. Y si alguna vez necesitás cruzar el mar, mi cubierta es tu casa.',
            ending: 'Le llevaste los dados al Capitán Olegario. Recuperó la Golondrina.',
            gold: 900,
            karma: 500,
            items: [['fish-steak', 10]],
          },
          {
            role: 'shipwright',
            thanks:
              'Entonces firmás vos. Acá, y acá. Listo: tenés barco. Los dados me los quedo yo, que no anden dando vueltas. El viejo Olegario va a seguir caminando, pero bueno... la mala suerte es de él, no tuya. ¿No?',
            ending: 'Te quedaste con el barco del capitán. Olegario sigue caminando.',
            gold: 0,
            karma: -600,
            items: [['sloop-deed', 1]],
          },
        ],
      },
    ],
    reward: { scroll: 'mastery-fencing', gold: 0 },
  },
  'deserter-gate': {
    id: 'deserter-gate',
    title: 'La puerta abierta',
    rumor: {
      roles: ['wanderer', 'guard', 'innkeeper', 'blacksmith'],
      text: 'En un cruce hay un hombre con capa de la guardia que no es guardia: Belisario. Dicen que desertó la noche que ardió la Granja Quemada. Él no cuenta nada, pero pregunta a todos si saben cuánta gente se salvó.',
    },
    steps: [
      {
        kind: 'ask',
        role: 'wanderer',
        person: 'Belisario el desertor',
        keywords: ['puerta', 'granja quemada', 'orden', 'capitan', 'desertor', 'salvaron', 'noche'],
        reply:
          'Era un caserío con empalizada. Venían los orcos y el capitán Valdivia ordenó cerrar con media aldea todavía afuera. Yo dejé la lanza y abrí. Después corrí, como un cobarde, y no supe más. Si vas a la Granja Quemada... fijate. Solo quiero saber si sirvió de algo.',
        hint: 'Andá a la Granja Quemada y buscá qué pasó esa noche.',
      },
      {
        kind: 'visit',
        place: 'Granja Quemada',
        found:
          'Entre las cenizas del puesto de guardia hay un parte a medio quemar: «...la puerta quedó abierta por un desertor. Entraron once antes del fuego. El capitán V. ordenó no perseguir a los orcos y retirarse sin pelear, según lo conv...» El resto se quemó.',
        hint: 'Once se salvaron. Y el capitán se retiró «según lo convenido». Preguntale a un guardia por el capitán Valdivia.',
        gives: 'burnt-order',
      },
      {
        kind: 'ask',
        role: 'guard',
        keywords: ['valdivia', 'capitan', 'granja quemada', 'parte', 'orcos', 'convenido'],
        reply:
          '¿De dónde sacaste eso? Guardalo. Valdivia ya no es capitán: es comandante, y a los que preguntan por esa noche los mandan a cuidar el pantano. Yo no sé nada. Pero una de los once que entraron no se quedó a que le dijeran qué contar. El tabernero le fiaba; él sabe para dónde se fue.',
        hint: 'Preguntale a un tabernero por la sobreviviente de la Granja Quemada.',
      },
      {
        kind: 'ask',
        role: 'innkeeper',
        keywords: ['sobreviviente', 'granja quemada', 'once', 'valdivia', 'se fue', 'fiaba'],
        reply:
          'Jimena. Tomaba sola, mirando la puerta. Una noche dijo: «Acá los que mandan son los mismos que nos vendieron», pagó todo lo que debía y se fue al norte, donde no llega ni la guardia ni la ley: al Refugio Helado.',
        hint: 'Andá al Refugio Helado y buscá a Jimena.',
      },
      {
        kind: 'meet',
        place: 'Refugio Helado',
        person: { name: 'Jimena la sobreviviente', role: 'townsfolk' },
        reply:
          '¿Belisario vive? Decile que entramos once. Que mi hijo es uno. ...Valdivia nos vendió: los orcos le pagaron para que la guardia se retirara, yo vi cuando le daban la bolsa. Los orcos anotan todo lo que pagan, son así. El que lleva las cuentas es Urzog, en el Campamento de los Colmillos. Ese libro es la soga de Valdivia.',
        hint: 'Conseguí el libro de pagos: lo tiene Urzog, en el Campamento de los Colmillos.',
      },
      {
        kind: 'slay',
        place: 'Campamento de los Colmillos',
        boss: { kind: 'orc', name: 'Urzog el Pagador' },
        escort: ['orc', 'orc', 'orc', 'troll'],
        relic: 'orc-ledger',
        hint: 'Decidí: llevale el libro a un guardia, para que juzguen a Valdivia, o dáselo a Belisario y que él haga lo que crea.',
      },
      {
        kind: 'choice',
        item: 'orc-ledger',
        options: [
          {
            role: 'guard',
            thanks:
              'Esto es... la letra de un orco y el sello de Valdivia. Con esto no lo salva nadie. Lo van a juzgar en la plaza, con los once mirando. Y al desertor se le va a levantar la pena: el que abrió esa puerta hizo lo que debía hacer la guardia. Tomá, de la caja del cuartel. Esta vez la justicia paga.',
            ending:
              'Le llevaste el libro a la guardia. Valdivia fue juzgado y Belisario, perdonado.',
            gold: 1200,
            karma: 600,
            items: [['bandage', 30]],
          },
          {
            role: 'wanderer',
            person: 'Belisario el desertor',
            thanks:
              'Once. Entraron once. ...Y él cobró por los que no. Dame ese libro. No, no se lo voy a llevar a ningún juez: los jueces comen en su mesa. Lo voy a ir a buscar yo, con esto en una mano y la lanza en la otra. Tomá mi capa de guardia, ya no la quiero. Y gracias. Ahora sé que sirvió.',
            ending: 'Le diste el libro a Belisario. Fue a buscar a Valdivia por su cuenta.',
            gold: 300,
            karma: -100,
            items: [['cloak', 1]],
          },
        ],
      },
    ],
    reward: { scroll: 'mastery-parrying', gold: 0 },
  },
};

/** Lo que pone el diario de misiones en cada paso (sin decir de más). */
export function legendHint(legend: Legend, step: number): string {
  if (step >= legend.steps.length) {
    // Las historias con decisión recuerdan cómo terminaron.
    const last = legend.steps[legend.steps.length - 1];
    const ending =
      last?.kind === 'choice' ? last.options[step - legend.steps.length]?.ending : undefined;
    return ending ? `Terminada. ${ending}` : 'Terminada.';
  }
  if (step === 0) return `Un rumor: "${legend.rumor.text}"`;
  // Cada paso deja anotado lo que hay que hacer después (lo que te dijeron o encontraste).
  const before = legend.steps[step - 1];
  return before && 'hint' in before ? before.hint : '';
}

/** El lugar al que hay que ir en el paso que toca (para marcarlo en el mapa), si hay uno. */
export function legendPlace(legend: Legend, step: number): string | null {
  const current = legend.steps[step];
  if (!current || step === 0) return null;
  return current.kind === 'visit' || current.kind === 'meet' || current.kind === 'slay'
    ? current.place
    : null;
}

/** Pergaminos de maestría: cuánto suben (en décimas) y qué habilidad. */
export const MASTERY_GAIN = 50;
export const MASTERY_SCROLLS: Readonly<Partial<Record<ItemKind, SkillKey>>> = {
  'mastery-magery': 'magery',
  'mastery-tactics': 'tactics',
  'mastery-healing': 'healing',
  'mastery-lockpicking': 'lockpicking',
  'mastery-swordsmanship': 'swordsmanship',
  'mastery-fishing': 'fishing',
  'mastery-alchemy': 'alchemy',
  'mastery-anatomy': 'anatomy',
  'mastery-tracking': 'tracking',
  'mastery-meditation': 'meditation',
  'mastery-stealth': 'stealth',
  'mastery-magic-resist': 'magic-resist',
  'mastery-parrying': 'parrying',
  'mastery-archery': 'archery',
  'mastery-fencing': 'fencing',
};

export function isLegendId(value: unknown): value is LegendId {
  return typeof value === 'string' && (LEGEND_IDS as readonly string[]).includes(value);
}
