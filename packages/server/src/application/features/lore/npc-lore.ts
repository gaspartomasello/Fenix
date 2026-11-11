import type { NpcRole } from '@fenix/shared/economy/vendors';

/**
 * Lo que saben y cuentan los vecinos además de su oficio: una historia propia
 * (cada uno la suya, según su nombre) y lo que opinan de los temas de los que
 * se habla en cualquier taberna. Son datos: la charla está en `NpcTalk`.
 */

/** Historias de vida, por oficio. Cada vecino cuenta una (siempre la misma). */
export const STORIES: Readonly<Partial<Record<NpcRole, readonly string[]>>> = {
  blacksmith: [
    'Mi padre era herrero, y el suyo también. Yo quería ser marinero, pero el yunque tira más que el mar.',
    'Una vez forjé una espada para un caballero que nunca volvió a buscarla. Todavía la tengo colgada, esperando.',
    'Perdí dos dedos en esta forja. Aprendí más esa tarde que en diez años.',
  ],
  mage: [
    'Estudié veinte años en una torre del norte. Me echaron por hacer preguntas que no tenían que hacerse.',
    'La magia no se aprende: se sufre. Cada hechizo que sé me costó una noche sin dormir.',
    'Tuve un aprendiz muy talentoso. Demasiado. Un día se fue y ahora prefiero no saber en qué anda.',
  ],
  innkeeper: [
    'Heredé esta taberna de mi tía. Ella decía que una cerveza bien tirada arregla más que un sanador.',
    'Por esta puerta pasaron reyes, ladrones y un dragón disfrazado de viajero. Bueno, eso dicen.',
    'Me casé tres veces. Todas en esta misma taberna. Las tres veces pagó la casa.',
  ],
  banker: [
    'Empecé contando monedas para un usurero. Aprendí a desconfiar de todos... menos de los números.',
    'Nunca perdí una moneda de un cliente. Una vez casi pierdo la vida defendiendo una.',
  ],
  stablemaster: [
    'Crié mi primer potro a los siete años. Se llamaba Trueno y me sigue en sueños.',
    'Un caballo te dice todo de su dueño. Los que gritan tienen caballos nerviosos.',
  ],
  woodcutter: [
    'Llevo treinta inviernos en el bosque. Los árboles viejos hablan, si sabés escuchar.',
    'Una vez un oso me persiguió hasta el pueblo. Desde entonces, siempre ando con el hacha afilada.',
  ],
  carpenter: [
    'Hice la cuna de la mitad de los chicos de este pueblo. Y algún que otro cajón, también.',
    'La madera tiene memoria: si la tratás mal, se tuerce. Como la gente.',
  ],
  provisioner: [
    'Antes viajaba con las caravanas. Ahora vendo lo que me hubiera gustado tener en el camino.',
    'Vendo de todo, y de todo me sobra un poco. Menos clientes: de eso siempre falta.',
  ],
  tailor: [
    'Cosí el vestido de bodas de la hija del alcalde. Nunca vi a nadie llorar tanto de alegría.',
    'Mi aguja es más rápida que la espada de muchos. Y deja menos sangre.',
  ],
  shipwright: [
    'Naufragué dos veces. Por eso hago barcos: para que el próximo no se hunda.',
    'Mi galeón más grande tardó tres años. Lo hundieron los piratas en tres minutos.',
  ],
  alchemist: [
    'Mi primera poción me dejó el pelo verde por un mes. La segunda me salvó la vida.',
    'Todo es veneno, todo es remedio: depende de cuánto. Eso lo aprendí a la mala.',
  ],
  healer: [
    'Curé soldados en la última guerra. Vi lo peor de la gente, y también lo mejor.',
    'Mi madre era partera. Yo ayudé a nacer a gente que ahora es abuela.',
  ],
  bowyer: [
    'Gané el torneo de arquería del reino tres años seguidos. Al cuarto me dio vergüenza seguir.',
    'Un buen arco se hace con paciencia: la madera tiene que secarse un año entero.',
  ],
  baker: [
    'Me levanto antes que el sol, todos los días desde hace veinte años. El pan no espera.',
    'La receta de mi pan de miel es secreta. Ni a mi marido se la conté.',
  ],
  butcher: [
    'Mi abuelo era cazador. Yo prefiero que me traigan la carne: los lobos me ponen nervioso.',
    'Tengo mano firme y corazón blando. Los perros del pueblo lo saben bien.',
  ],
  fisherman: [
    'El mar me quitó a mi hermano. Igual vuelvo todos los días: es lo único que sé hacer.',
    'Una vez saqué un pescado tan grande que comió todo el pueblo. Nadie me cree, pero es verdad.',
    'De noche, en alta mar, se ven luces debajo del agua. No sé qué son, y no quiero saber.',
  ],
  jeweler: [
    'Distingo un diamante de un vidrio con los ojos cerrados. Con los abiertos, a veces me cuesta.',
    'Una vez me trajeron una piedra que brillaba sola en la oscuridad. La vendí y me arrepiento todos los días.',
  ],
  scribe: [
    'Copié más de mil libros. De algunos me acuerdo palabra por palabra; de otros, preferiría olvidarme.',
    'Escribo las cartas de los que no saben escribir. Sé más secretos que el confesor.',
  ],
  architect: [
    'Diseñé la mitad de las casas de este pueblo. La otra mitad la hicieron sin planos, y se nota.',
  ],
  farmer: [
    'La tierra es buena si la tratás bien. El año pasado la sequía casi nos mata a todos.',
    'Tengo seis hijos y una vaca que se llama Duquesa. La vaca da menos trabajo.',
    'Una vez los lobos se llevaron todas mis ovejas en una noche. Ahora duermo con un ojo abierto.',
  ],
  townsfolk: [
    'Nací acá y nunca salí más allá del cementerio. Dicen que el mundo es grande; yo no lo necesito.',
    'Mi marido se fue a buscar fortuna a las minas. Hace dos años que no escribe.',
    'De chico soñaba con ser caballero. Ahora vendo lo que puedo y cuido a mi madre.',
    'Perdí todo en un incendio. Volví a empezar de cero, y acá estoy.',
    'Trabajé en el puerto, en la mina y en el campo. Lo único que no probé es ser rico.',
  ],
  guard: [
    'Hace quince años que hago guardia en esta puerta. Vi pasar de todo, y casi todo lo dejé pasar.',
    'Perdí a mi capitán en una emboscada de orcos. Desde entonces no le doy la espalda al bosque.',
    'Me ofrecieron oro por mirar para otro lado. Dije que no. Todavía me lo reprocho cuando no llego a fin de mes.',
  ],
  mercenary: [
    'Peleé en tres guerras, para tres reyes distintos. Ninguno me pagó a tiempo; por eso ahora cobro por adelantado.',
    'Tengo gente leal y gente codiciosa. Aprendé a distinguirlas antes de que lo aprendas por las malas.',
  ],
  beggar: [
    'Fui mercader, ¿sabés? Tenía tres barcos. Una tormenta y un mal socio, y acá me ves.',
    'Nadie mira a un mendigo. Por eso veo todo lo que pasa en este pueblo.',
    'Perdí la pierna en la guerra del rey. El rey no perdió nada.',
  ],
};

/** Temas sueltos: palabras que se entienden y lo que contesta cualquiera (según su carácter). */
export interface Topic {
  readonly words: RegExp;
  readonly replies: readonly string[];
}

export const TOPICS: readonly Topic[] = [
  {
    words: /\b(guardia|guardias|ley|justicia)\b/,
    replies: [
      'Los guardias cuidan los pueblos: el que ataca a un inocente adentro, lo pagan caro.',
      'Afuera de las murallas no hay guardias que valgan. Allá cada uno se cuida solo.',
    ],
  },
  {
    words: /\b(asesino|asesinos|criminal|criminales|ladron|ladrones|bandido|bandidos)\b/,
    replies: [
      'Los asesinos tienen el nombre rojo: si ves uno, corré. Los guardias no los dejan entrar.',
      'Dicen que los bandidos tienen un refugio propio, en una isla, donde no entra ningún guardia. Ahí se compra cualquier cosa... hasta una muerte.',
      'Un ladrón me vació la bolsa en la plaza y ni lo sentí. Desde entonces la llevo atada al cuello.',
    ],
  },
  {
    words: /\b(dragon|dragones)\b/,
    replies: [
      'Hay un dragón en las Tierras de Ceniza. Dicen que duerme sobre una montaña de oro.',
      '¿Dragones? Mi abuelo vio uno. Dice que el calor se sentía a una legua.',
    ],
  },
  {
    words: /\b(magia|hechizo|hechizos|mago|maga)\b/,
    replies: [
      'La magia se aprende con libro, reactivos y mucha paciencia. La maga del pueblo vende todo eso.',
      'Yo de magia no entiendo nada. Una vez vi a una maga prender fuego un muro con la mano.',
    ],
  },
  {
    words: /\b(oro|plata|dinero|rico|riqueza)\b/,
    replies: [
      'El oro va y viene. Lo que se guarda en el banco, por lo menos, no se lo lleva un ladrón.',
      'Si querés hacerte rico, las leyendas pagan mejor que cualquier trabajo. Si sobrevivís.',
    ],
  },
  {
    words: /\b(clima|lluvia|tiempo hace|frio|calor)\b/,
    replies: [
      'Va a llover, me duelen las rodillas. Nunca fallan.',
      'En el norte hace un frío que corta. Acá, por suerte, el clima es bueno casi siempre.',
    ],
  },
  {
    words: /\b(noche|oscuridad|oscuro)\b/,
    replies: [
      'De noche salen cosas que de día se esconden. Llevá una linterna o una antorcha.',
      'Yo de noche no salgo del pueblo ni loco.',
    ],
  },
  {
    words: /\b(comida|hambre|comer|pan)\b/,
    replies: [
      'Si tenés hambre, el panadero y el carnicero tienen de todo. La taberna también sirve platos.',
      'Con la panza vacía no se pelea bien. Comé algo antes de salir.',
    ],
  },
  {
    words: /\b(cerveza|vino|beber|tomar algo|taberna)\b/,
    replies: [
      'La taberna es el mejor lugar para enterarse de las cosas. Y para olvidarse de otras.',
      'Una cerveza no le hace mal a nadie. Diez, sí.',
    ],
  },
  {
    words: /\b(mar|barco|barcos|navegar|puerto)\b/,
    replies: [
      'Para navegar hace falta un barco: el carpintero de barcos los vende, si tenés el oro.',
      'Al otro lado del mar dicen que hay una selva llena de pirámides y gente con máscaras de jaguar.',
    ],
  },
  {
    words: /\b(gremio|gremios|hermandad)\b/,
    replies: [
      'Los gremios se juntan en sus propias casas. Hay uno del que nadie habla en voz alta...',
      'Dicen que en el Refugio de los Bandidos hay una mendiga ciega que ve demasiado. Si le hablás de «la sombra», capaz te contesta.',
      'Un gremio te cuida las espaldas. Siempre que no se las des vuelta.',
    ],
  },
  {
    words: /\b(rey|reina|castillo|capital)\b/,
    replies: [
      'El castillo de la capital es enorme. Yo solo lo vi de lejos, en una feria.',
      'Del rey se habla poco y bajito. Mejor así.',
    ],
  },
  {
    words: /\b(muerte|muertos|fantasma|fantasmas|cementerio)\b/,
    replies: [
      'Cada pueblo tiene su cementerio, y en cada cementerio algo se mueve de noche.',
      'Si te morís, tu espíritu vaga hasta que un sanador te devuelve a la vida.',
    ],
  },
  {
    words: /\b(amor|novia|novio|casado|casada|esposa|esposo)\b/,
    replies: [
      '¿Amor? Uf, eso es más peligroso que un dragón.',
      'Estuve enamorado una vez. Se fue con un bardo. Nunca más confié en un laúd.',
    ],
  },
  {
    words: /\b(mercenario|mercenarios|contratar|escolta)\b/,
    replies: [
      'Los mercenarios pelean por oro, no por amor. Pagales a tiempo y cuidá el botín.',
      'Un mercenario leal vale su peso en oro. Uno codicioso te clava un puñal mientras dormís.',
    ],
  },
];

/** Insultos: el vecino se ofende y por un rato no quiere saber nada. */
export const INSULT =
  /\b(idiota|tonto|tonta|estupido|estupida|imbecil|inutil|feo|fea|gil|bobo|boba|basura)\b/;
/** Elogios: le gusta y lo recuerda. */
export const PRAISE =
  /\b(lindo|linda|hermoso|hermosa|genial|groso|grosa|crack|sabio|sabia|valiente|amable|te quiero)\b/;
