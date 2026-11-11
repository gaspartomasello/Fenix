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
] as const;
export type LegendId = (typeof LEGEND_IDS)[number];

/** Un paso de una leyenda: lo que hay que hacer para pasar al siguiente. */
export type LegendStep =
  /** Preguntarle a alguien de un oficio (en cualquier pueblo) por alguna de las palabras. */
  | {
      readonly kind: 'ask';
      readonly role: NpcRole;
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
    };

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
};

/** Lo que pone el diario de misiones en cada paso (sin decir de más). */
export function legendHint(legend: Legend, step: number): string {
  if (step >= legend.steps.length) return 'Terminada.';
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
};

export function isLegendId(value: unknown): value is LegendId {
  return typeof value === 'string' && (LEGEND_IDS as readonly string[]).includes(value);
}
