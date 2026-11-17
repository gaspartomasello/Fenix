import type { Topic } from './npc-lore';

/**
 * Lo que la gente sabe (o cree saber) del mundo: su historia, sus creencias,
 * sus costumbres, cuentos de tierras lejanas que resultan ser verdad, más
 * rumores y algunas frases secretas. Todo esto se suma a los temas de
 * siempre de `npc-lore`. Cada tema tiene varias respuestas: cada vecino
 * cuenta una (sale de su nombre), y con «contame más» sigue con las otras.
 */
export const WORLD_TOPICS: readonly Topic[] = [
  // ── La historia del mundo ──
  {
    words: /\b(imperio|emperador|emperadores|antiguos|los antiguos|ruinas)\b/,
    replies: [
      'Antes de los pueblos hubo un imperio. Hicieron caminos de piedra que todavía se pisan y ciudades que ya nadie encuentra. Cayó en una sola generación, y nadie se pone de acuerdo en por qué.',
      'Mi abuela decía que el imperio no cayó: que se fue. Que un día los emperadores bajaron a sus tumbas con toda la corte y cerraron la puerta por dentro.',
      'Los caminos empedrados gastados son del imperio. Seguí uno y vas a llegar a algo viejo. No siempre a algo bueno.',
      'En la selva del oeste quedan sus pirámides y sus cabezas de piedra. Los que viven ahí dicen que las cabezas miran hacia donde va a salir el mal.',
    ],
  },
  {
    words: /\b(reyes|rey|tumba|tumbas|faraon|momia|momias|desierto)\b/,
    replies: [
      'En el desierto está la Tumba de los Reyes. Bajaron con sus tesoros y sus sirvientes, y los sirvientes siguen ahí, cumpliendo. No les gusta que les toquen las cosas.',
      'Dicen que el último rey no está muerto del todo: que se hizo vendar vivo para esperar a que el imperio vuelva. Tiene paciencia. Tiene toda la del mundo.',
      'Un saqueador volvió de la tumba con un anillo y sin sombra. Vivió un mes. La sombra, dicen, sigue ahí abajo.',
    ],
  },
  {
    words: /\b(ceniza|tierras de ceniza|volcan|monte del fuego|lava)\b/,
    replies: [
      'Las Tierras de Ceniza eran un valle de viñedos. Una noche el Monte del Fuego se abrió y a la mañana no quedaba una parra. Puerto Brasa se salvó porque el viento sopló para el otro lado.',
      'En Puerto Brasa nadie le da la espalda al volcán. Es costumbre: hasta las camas miran para allá.',
      'El que duerme en el Monte del Fuego es más viejo que el imperio. Los herreros de Puerto Brasa templan el acero con ceniza de ahí y juran que sale mejor.',
    ],
  },
  {
    words: /\b(puerto ceniza|capital|fundacion|fundaron|fundadores)\b/,
    replies: [
      'A Puerto Ceniza la fundaron náufragos. El barco se les quemó en la bahía y con la ceniza marcaron dónde iba la primera casa. Por eso el nombre.',
      'El castillo es más nuevo que la ciudad. Primero fue el mercado, después la muralla y recién después alguien dijo «hace falta un rey». Hay quien dice que no hacía falta.',
      'Abajo de la capital hay túneles. Las alcantarillas son de ahora, pero más abajo hay piedra tallada que no pusimos nosotros.',
    ],
  },
  {
    words: /\b(roca alta|montana|montanas|cordillera|mina|minas|mineros)\b/,
    replies: [
      'Roca Alta nació por el hierro. Los primeros mineros dormían adentro de la mina, y dicen que alguno sigue adentro.',
      'En la cordillera, si oís picar de noche, no vayas a mirar. Los mineros de verdad duermen de noche.',
      'El Paso del Cuervo es el único camino fácil para cruzar la montaña. Por eso mismo ahí siempre hay alguien esperando.',
    ],
  },
  {
    words: /\b(junco verde|pantano|pantanos|cienaga|torre hueca)\b/,
    replies: [
      'Junco Verde se hizo sobre pilotes porque el pantano se traga lo que se apoya. Hasta los muertos: por eso el cementerio queda en lo alto.',
      'La Torre Hueca era de un mago que quiso no morirse nunca. Lo logró. Ese es el problema.',
      'En el pantano las luces que flotan no son faroles. No las sigas, por más que parezca que te esperan.',
    ],
  },
  {
    words: /\b(selva|jungla|puerto esmeralda|altamar|hombres jaguar|tribu|tribus)\b/,
    replies: [
      'Cruzando el mar al oeste está la selva. Puerto Esmeralda vive de lo que saca de ahí, y Altamar de llevárselo. Los de las tribus estaban antes y no le deben nada a nadie.',
      'Los hombres jaguar no atacan los pueblos. Atacan a los que entran a sus templos, que es distinto. Aunque para el que entra, da lo mismo.',
      'En la selva hay una ciudad entera que nadie encuentra dos veces. Los exploradores discuten si se mueve ella o los que la buscan.',
    ],
  },
  {
    words: /\b(portal|portales|portal lunar|circulo de piedras|piedras paradas|menhir|menhires)\b/,
    replies: [
      'Los portales lunares están en las afueras de las ciudades, en un círculo de piedras. Te parás en la luz y elegís adónde ir. Nadie sabe quién los prendió, y nadie quiere que se apaguen.',
      'Las piedras de los círculos ya estaban cuando llegaron los primeros. Las ciudades se hicieron cerca de los portales, no al revés.',
      'Mi tío cruzó un portal pensando en su casa y apareció en otro continente. Hay que pensar en lo que uno elige, no en lo que uno quiere.',
    ],
  },
  // ── Creencias y costumbres ──
  {
    words: /\b(dios|dioses|religion|rezar|rezo|santuario|santuarios|fe|templo|iglesia|capilla)\b/,
    replies: [
      'Acá cada uno le reza a lo que le sirve: los marineros al viento, los herreros al fuego, los granjeros a la lluvia. Los santuarios son de todos.',
      'El santuario de la plaza trae de vuelta a los que se fueron antes de tiempo. No pregunta a quién le rezabas.',
      'Dicen que los dioses viejos se cansaron de escuchar y se fueron. Los santuarios siguen andando igual, así que alguien quedó de guardia.',
      'La Capilla Olvidada era de una orden que juró cuidar algo. Se murieron todos sin decir qué.',
    ],
  },
  {
    words: /\b(muerte|morir|fantasma|fantasmas|alma|almas|resucitar|mas alla|espiritu|espiritus)\b/,
    replies: [
      'El que muere queda un rato de este lado, gris y sin poder tocar nada. Un santuario o un sanador lo traen de vuelta. Las cosas, eso sí, se quedan en el cuerpo.',
      'Los fantasmas de la gente no hacen nada. Los que hacen cosas son los otros: los que se murieron enojados.',
      'Mi madre decía que cada vez que volvés de la muerte dejás algo allá. Nunca supo decirme qué.',
    ],
  },
  {
    words: /\b(fiesta|fiestas|feria|carnaval|costumbre|costumbres|tradicion|tradiciones)\b/,
    replies: [
      'En la fiesta de la cosecha se quema un espantapájaros de fardos en cada granja. Si arde derecho, el año viene bueno.',
      'En Puerto Ceniza, cuando nace un chico, le ponen una pizca de ceniza en la frente. Para que se acuerde de dónde venimos.',
      'En las tabernas hay una regla: el que cuenta la mejor historia no paga. Por eso se oyen tantas mentiras.',
    ],
  },
  {
    words: /\b(comida|comer|plato|receta|cocina|guiso|vino|cerveza|hambre)\b/,
    replies: [
      'El mejor guiso es el de Roca Alta: cordero, papa y lo que haya. La peor cerveza también es de ahí.',
      'En Junco Verde se come anguila ahumada. Si no preguntás qué es, es riquísima.',
      'El vino bueno venía de las Tierras de Ceniza. Las botellas que quedan valen más que una espada.',
    ],
  },
  {
    words: /\b(musica|cancion|canciones|cantar|bardo|bardos|laud|trovador)\b/,
    replies: [
      'Hay una canción que dice que el fénix no es un pájaro: es todo lo que se quema y vuelve. La cantan en los velorios.',
      'Los bardos saben más historia que los escribas. Mienten más, también.',
      'Con un laúd y buena mano se calma hasta a un oso. Con mala mano se lo enoja más.',
    ],
  },
  {
    words: /\b(clima|tiempo|lluvia|frio|calor|nieve|invierno|verano|tormenta)\b/,
    replies: [
      'En el norte nieva todo el año. Si vas, llevá abrigo y no confíes en el hielo de los lagos.',
      'Cuando el viento viene del volcán, la ropa tendida queda gris. Acá le decimos «día de ceniza».',
      'Va a llover. Me lo dice la rodilla, que no se equivoca desde la guerra.',
    ],
  },
  {
    words: /\b(caminos|camino|encrucijada|encrucijadas|cruce|cruces|cartel|carteles|viajar)\b/,
    replies: [
      'En cada encrucijada hay un cartel: fijate en las flechas antes de elegir. Y si el cartel está torcido, alguien lo movió.',
      'Las encrucijadas tienen nombre por algo. Nadie le pone «del Ahorcado» a un cruce porque sí.',
      'Por los caminos andan buhoneras, peregrinos y cazadoras: gente de paz. Y cada tanto, los que viven de ellos.',
      'De noche, en el camino, mejor con antorcha. No espanta a los lobos, pero por lo menos los ves venir.',
    ],
  },
  {
    words:
      /\b(campamento|campamentos|posada|posadas|posta|caravana|caravanas|granja|granjas|caserio|aldea)\b/,
    replies: [
      'Fuera de los pueblos hay más gente de la que parece: granjas, caseríos, postas de caravanas. No figuran en ningún mapa, hay que ir y encontrarlos.',
      'Si ves humo de fogata al costado del camino, puede ser una posta o pueden ser salteadores. Las postas no tienen empalizada.',
      'En las granjas siempre hay algún problema: lobos, ladrones, un pozo seco. Preguntá si necesitan ayuda, suelen pagar con lo que tienen.',
    ],
  },
  {
    words: /\b(druida|druidas|hadas|hada|anillo de hadas|hongos|bosque encantado)\b/,
    replies: [
      'Los druidas tienen su círculo en el llano. Curan a cualquiera, pero no les talés un árbol cerca.',
      'Si encontrás hongos en ronda, no pises adentro. O pisá, pero después no digas que nadie te avisó.',
    ],
  },
  {
    words: /\b(orco|orcos|troll|trolls|ogro|goblin)\b/,
    replies: [
      'Los orcos no son tontos: atacan las caravanas, no los pueblos. Saben contar guardias.',
      'Un troll se cura mientras le pegás. Si no lo matás rápido, no lo matás.',
      'Los orcos tienen jefes, y los jefes tienen nombre. Cuando un orco tiene nombre, es porque mató a suficientes de los nuestros.',
    ],
  },
  {
    words:
      /\b(liche|liches|nigromante|nigromancia|esqueleto|esqueletos|zombi|zombis|no muertos|muertos vivos)\b/,
    replies: [
      'A los muertos que caminan no les gusta el ajo. Tampoco arregla mucho, pero molesta.',
      'Un liche es un mago que no quiso morirse. Guarda su vida en algún lado que no es su cuerpo. Por eso vuelve.',
      'Los esqueletos no se cansan y no tienen miedo. Lo bueno es que tampoco piensan.',
    ],
  },
  {
    words: /\b(tesoro|tesoros|mapa del tesoro|oro enterrado|cofre enterrado|pala)\b/,
    replies: [
      'Hay mapas de tesoros dando vueltas: a veces los lleva encima algún bicho que se comió al dueño. Hace falta una pala y saber leerlos.',
      'El que entierra un tesoro deja algo cuidándolo. Siempre. Cavá con la espada a mano.',
    ],
  },
  {
    words: /\b(karma|fama|reputacion|inocente|nombre azul|nombre rojo|nombre gris|seguro)\b/,
    replies: [
      'A la gente de bien se le ve en el nombre: azul. Gris el que hizo algo feo hace poco, rojo el que mató más de la cuenta.',
      'Lastimar a un inocente te marca. El juego... digo, la vida, te avisa antes: si igual seguís, es cosa tuya.',
      'La fama se gana haciendo cosas. El karma, haciéndolas bien. No es lo mismo, y los vecinos notan la diferencia.',
    ],
  },
  {
    words: /\b(casa|casas|terreno|construir|escritura|vivienda)\b/,
    replies: [
      'Con una escritura y un terreno libre te hacés la casa. El arquitecto del pueblo las vende. Buscá llano, sin árboles.',
      'Una casa propia es un cofre con techo: lo que dejás adentro, te espera.',
    ],
  },
  {
    words: /\b(habilidad|habilidades|entrenar|aprender|maestro|maestria|practicar)\b/,
    replies: [
      'Las cosas se aprenden haciéndolas. El que quiere pescar, pesca; el que quiere pelear, pelea. Y lo que no se usa, se olvida.',
      'Hay pergaminos de maestría que te enseñan de golpe lo que lleva meses. No se venden: se ganan resolviendo cosas viejas. Preguntá por rumores.',
    ],
  },
];

/**
 * Historias verdaderas de «tierras lejanas» (del mundo real), que los
 * viajeros cuentan y nadie les cree. Se piden con «contame una historia
 * verdadera», «una historia real» o «algo increíble».
 */
export const TRUE_STORIES: readonly string[] = [
  'Un marinero de muy lejos me juró esto: en las tumbas de unos reyes del desierto encontraron vasijas de miel de tres mil años, y todavía se podía comer. La miel no se echa a perder nunca.',
  'Me contaron que, en una ciudad lejana, una mujer se puso a bailar en la calle y no pudo parar. A la semana eran decenas, al mes cientos, bailando hasta caerse. Nadie supo nunca por qué.',
  'Hubo un imperio que hacía muelles con una mezcla de cal y ceniza de volcán. Dos mil años en el mar y siguen enteros: el agua salada, en vez de romperla, la endurece.',
  'En el fondo del mar encontraron una caja de bronce llena de engranajes, más vieja que cualquier reloj. Servía para saber dónde iban a estar el sol, la luna y los eclipses. Tardaron más de mil años en volver a hacer algo así.',
  'Unos navegantes del norte cruzaron el océano entero en barcos abiertos y llegaron a otro continente quinientos años antes que los que se llevaron la fama. Se volvieron porque hacía frío y los vecinos no los querían.',
  'Una vez, lejos de acá, el cielo explotó sobre un bosque. No dejó ni un pozo, pero tumbó árboles hasta donde daba la vista, todos acostados para el mismo lado.',
  'Existió una biblioteca donde querían tener todos los libros del mundo. A cada barco que llegaba al puerto le copiaban los suyos... y se quedaban con los originales.',
  'Hubo un fuego de guerra que ardía sobre el agua: cuanto más le tirabas, más prendía. La receta era tan secreta que se perdió, y hoy nadie sabe cómo se hacía.',
  'En una isla lejana hay cientos de cabezas de piedra enormes mirando tierra adentro. Lo que casi nadie sabe es que tienen cuerpo: está enterrado hasta los hombros.',
  'Un general cruzó una cordillera nevada con elefantes para caerle por atrás al enemigo. Perdió casi todos los elefantes, pero llegó, y durante años nadie pudo echarlo.',
  'Hay un bicho de mar, una medusa chiquita, que cuando se pone vieja vuelve a ser cría y empieza de nuevo. Mientras no se la coman, no se muere nunca.',
  'En un pueblo de montaña llovieron peces. No es cuento: una tromba los levantó de un lago y los soltó a leguas de ahí.',
  'Dicen que hubo una guerra que duró treinta y ocho minutos. Lo que tardó un palacio en rendirse cuando le apuntaron los barcos.',
  'Los pulpos tienen tres corazones y la sangre azul. Y si les das un frasco cerrado con un cangrejo adentro, aprenden a desenroscar la tapa.',
];

/** Más rumores sueltos (se suman a los de siempre). */
export const MORE_RUMORS: readonly string[] = [
  'Dicen que hay un mago medio loco que vive solo en una torre, lejos de todo, y que se le escapan los experimentos.',
  'Un caminante juró que vio una ronda de hongos donde no crece el pasto adentro. Dice que oyó risas.',
  'En el desierto hay un oasis con un mercader que vende agua más cara que el vino. Y se la compran.',
  'Hay una posada en el camino donde nadie quiere la pieza del fondo. El posadero dice que es por la humedad.',
  'Cuentan que en un llano quedaron las armas de una batalla que nadie recuerda quién ganó. De noche siguen peleando.',
  'Los leñadores no entran más a una parte del bosque. Dicen que algo teje entre los árboles.',
  'Vi un árbol seco en medio del campo con una soga colgando. Nadie del pueblo quiere decir de quién era.',
  'Hay gente que anda sola por los caminos, lejos de todo, y sabe cosas. Si ves a alguien de nombre azul sentado en un cruce, saludalo: capaz te cuenta algo que valga la pena.',
  'Dicen que una chica de un caserío habla con los lobos. El padre dice que son perros grandes.',
  'El herrero jura que el mineral del norte canta cuando lo fundís. Yo creo que el que canta es él, después de la cerveza.',
  'Hay quien dice que las encrucijadas de noche tienen un cartel más que de día.',
  'Un pescador sacó una botella con un mapa adentro. Lo vendió por dos monedas. El que se lo compró no volvió a trabajar en su vida.',
];

/** Frases secretas: quien las dice se lleva una respuesta que no espera. */
export const SECRETS: readonly { readonly words: RegExp; readonly replies: readonly string[] }[] = [
  {
    words: /\b(sentido de la vida|respuesta a todo|cuarenta y dos|42)\b/,
    replies: [
      'Cuarenta y dos. No me preguntes la pregunta, que esa parte no la sé.',
      'Un sabio lo calculó durante años y le dio cuarenta y dos. Todavía está buscando qué era lo que había preguntado.',
    ],
  },
  {
    words: /\b(arriba arriba abajo abajo|izquierda derecha izquierda derecha)\b/,
    replies: [
      'No sé qué baile es ese, pero me dieron ganas de regalarte treinta vidas. Lástima que no tengo.',
    ],
  },
  {
    words: /\b(quien hizo (este|el) mundo|quien creo (este|el) mundo|el creador|los creadores)\b/,
    replies: [
      'Dicen que este mundo lo soñó un tal Gaspar, y que una máquina que escribe lo fue armando de a poco, etapa por etapa. Cuentos de taberna.',
      'Mi abuelo decía que el mundo se hizo de a etapas, y que todavía no está terminado. Por eso cada tanto aparece un camino donde no había.',
    ],
  },
  {
    words: /\b(fenix|ave fenix)\b/,
    replies: [
      'El fénix se quema entero y vuelve a nacer de la ceniza. Por algo la capital se llama como se llama.',
      'Dicen que este mundo ya se terminó una vez, y volvió. Que por eso se llama así. Yo no estaba, no me consta.',
    ],
  },
  {
    words: /\b(abracadabra|abrete sesamo|hocus pocus|pata de cabra)\b/,
    replies: [
      'Eso no es magia, eso es un cuento. La magia de verdad gasta reactivos y a veces te explota en la cara.',
      '...No pasó nada. ¿Tenía que pasar algo?',
    ],
  },
  {
    words: /\b(tirar los dados|tiro los dados|tirada de dados|un veinte|veinte natural)\b/,
    replies: [
      'Yo siempre saco uno. Siempre. Por eso me quedé en el pueblo.',
      'Un veinte natural... con eso convencés a un dragón de que te preste plata.',
    ],
  },
  {
    words:
      /\b(es un juego|estamos en un juego|esto es un juego|sos un programa|sos real|eres real)\b/,
    replies: [
      '¿Un juego? Qué idea rara. Yo me levanto, trabajo y me acuesto. Aunque ahora que lo decís... nunca me acuerdo de haber dormido.',
      'A veces siento que digo siempre las mismas cosas. Después se me pasa.',
    ],
  },
  {
    words: /\b(flecha en la rodilla|era aventurero|eras aventurero)\b/,
    replies: [
      'Yo también salía a los caminos. Después uno se pone grande, le duele todo y descubre que en el pueblo hay sopa caliente.',
    ],
  },
  {
    words: /\b(hola mundo)\b/,
    replies: ['Hola, mundo. Qué saludo raro, pero me gusta: suena a que algo recién empieza.'],
  },
  {
    words: /\b(te quiero|te amo|casate conmigo|me caso con vos)\b/,
    replies: [
      'Epa. Primero invitame una cerveza, por lo menos.',
      'Sos el tercero que me lo dice esta semana. Los otros dos tampoco trajeron anillo.',
    ],
  },
  {
    words: /\b(dragon ball|kamehameha|que la fuerza|la fuerza te acompane|un anillo para)\b/,
    replies: ['No sé de qué tierra venís, pero allá deben contar unas historias bárbaras.'],
  },
];
