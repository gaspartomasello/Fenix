/**
 * Los caminantes: gente con nombre propio que anda por el continente, lejos
 * de los pueblos (en las encrucijadas y al costado de los caminos). Tienen el
 * nombre azul, no pelean y no venden nada: cuentan. Cada uno tiene su
 * presentación, su historia y un puñado de temas propios; además saben de lo
 * que hay cerca (lo que no figura en los mapas). Como son gente de los
 * caminos, también saben los rumores de las historias largas.
 */
export interface Wanderer {
  readonly name: string;
  /** Lo que dice al saludarlo. */
  readonly intro: string;
  /** Su historia («¿quién sos?», «contame tu historia»). */
  readonly story: string;
  /** Temas propios: palabras (sin acentos) y lo que contesta. */
  readonly topics: readonly { readonly words: RegExp; readonly reply: string }[];
  /** Si adivina la suerte: lo que puede salir. */
  readonly fortunes?: readonly string[];
}

export const WANDERERS: readonly Wanderer[] = [
  {
    name: 'Baltasar el Ciego',
    intro:
      'Pasos livianos, botas buenas... no sos de por acá. Sentate si querés. No veo, pero escucho todo lo que pasa por este cruce.',
    story:
      'Fui sargento de la guardia treinta años. Los ojos los dejé en el Paso del Cuervo, por una antorcha de orco. Desde entonces me siento en los cruces: por los pasos sé quién pasa, cuánto pesa y si viene con miedo.',
    topics: [
      {
        words: /\b(guerra|batalla|orcos|paso del cuervo|sargento|guardia)\b/,
        reply:
          'En el Paso éramos cuarenta contra no sé cuántos. Aguantamos tres días. El capitán nos dijo que venían refuerzos. No venía nadie: lo dijo para que aguantáramos. Y aguantamos.',
      },
      {
        words: /\b(ciego|ojos|ver|escuchar|pasos|oido)\b/,
        reply:
          'El que ve, mira y se distrae. Yo escucho. Vos, por ejemplo, llevás algo de metal que golpea contra la hebilla. Atalo, que un salteador también tiene oídos.',
      },
      {
        words: /\b(consejo|pelear|pelea|combate|ensenar)\b/,
        reply:
          'Nunca pelees cuesta arriba, nunca pelees con hambre y nunca pelees por orgullo. Las tres veces que rompí esas reglas me costaron un amigo.',
      },
    ],
  },
  {
    name: 'Ña Rosenda la yuyera',
    intro:
      'Cuidado donde pisás, m’hijo, que eso que está ahí es ruda y me costó encontrarla. ¿Te duele algo? Tenés cara de que te duele algo.',
    story:
      'Mi madre era yuyera, mi abuela era yuyera, y la abuela de mi abuela curó a un rey de un mal de amores con un té de cedrón. Yo junto yuyos por los caminos y se los llevo a los alquimistas, que pagan poco y preguntan mucho.',
    topics: [
      {
        words:
          /\b(yuyo|yuyos|hierba|hierbas|planta|plantas|reactivo|reactivos|ginseng|ajo|mandragora)\b/,
        reply:
          'El ginseng quiere sombra y tierra negra. La mandrágora grita cuando la sacás, así que sacala de un tirón. Y el ajo... el ajo se compra, m’hijo, no seas vago.',
      },
      {
        words: /\b(curar|remedio|remedios|enfermo|duele|dolor|veneno|te)\b/,
        reply:
          'Para el veneno, nada como una poción de las verdes. Y si no tenés, vendate rápido y rezá. El té de cedrón no cura nada, pero uno se muere más tranquilo.',
      },
      {
        words: /\b(hongo|hongos|ronda|hadas)\b/,
        reply:
          'Los hongos en ronda no se juntan. Mi abuela juntó uno y estuvo tres días hablando al revés.',
      },
    ],
  },
  {
    name: 'Fray Lupercio',
    intro:
      'La paz sea contigo, hermano. O hermana. Disculpá, ando sin anteojos y sin fe: las dos cosas se me perdieron en el mismo viaje.',
    story:
      'Fui de la orden de la Capilla Olvidada. Juramos cuidar algo y no decir qué. Los hermanos se fueron muriendo y un día me di cuenta de que yo era el último, y de que nadie me había dicho qué era lo que cuidábamos. Ahora camino. A ver si me acuerdo.',
    topics: [
      {
        words: /\b(capilla|orden|juramento|cuidar|secreto|hermanos)\b/,
        reply:
          'Sé que estaba abajo. Sé que había una llave y que el hermano Anselmo la llevaba al cuello. A Anselmo lo enterramos con todo puesto. Saque usted sus conclusiones.',
      },
      {
        words: /\b(fe|dios|dioses|rezar|creer|religion)\b/,
        reply:
          'Antes rezaba y nadie contestaba, y me parecía bien. Ahora no rezo y a veces alguien contesta. Eso me preocupa bastante más.',
      },
      {
        words: /\b(pecado|perdon|confesar|confesion)\b/,
        reply:
          'Confesate tranquilo: se me olvida todo antes del próximo cruce. Es lo más parecido al perdón que conozco.',
      },
    ],
  },
  {
    name: 'Catalina Dos Espadas',
    intro:
      'Si venís a retarme, llegás diez años tarde: ya no acepto. Si venís a charlar, sentate. Si venís a robarme... bueno, probá.',
    story:
      'Gané cuarenta y un duelos en la plaza de Puerto Ceniza. El cuarenta y dos lo iba ganando cuando me di cuenta de que el otro tenía dieciséis años y estaba llorando. Bajé las espadas y no las volví a levantar por plata.',
    topics: [
      {
        words: /\b(duelo|duelos|espada|espadas|esgrima|pelear|ensenar)\b/,
        reply:
          'Todo el mundo mira la espada. Mirá los pies. La espada miente; los pies no saben mentir.',
      },
      {
        words: /\b(dos espadas|dos manos|izquierda|zurda)\b/,
        reply:
          'La segunda espada no es para pegar: es para que el otro piense en ella. Mientras la mira, la primera ya llegó.',
      },
      {
        words: /\b(chico|muchacho|cuarenta y dos|ultimo duelo)\b/,
        reply:
          'Hoy es herrero en Roca Alta. Me manda un cuchillo nuevo cada invierno. Son cuchillos horribles. Los guardo todos.',
      },
    ],
  },
  {
    name: 'el Mudo Zenón',
    intro: '(Te mira, levanta una mano a modo de saludo y señala el camino con el mentón.)',
    story:
      '(Se señala la boca, niega con la cabeza. Después dibuja en la tierra, con un palo: una torre, un rayo, un hombre chiquito corriendo. Te mira para ver si entendiste.)',
    topics: [
      {
        words: /\b(torre|mago|rayo|dibujo|que paso)\b/,
        reply:
          '(Dibuja otra vez la torre y, al lado, un frasco roto. Se toca la garganta. Después borra todo con el pie, rápido, y mira para los costados.)',
      },
      {
        words: /\b(camino|donde|norte|sur|este|oeste|lugar)\b/,
        reply:
          '(Piensa. Dibuja una flecha larga en la tierra y, al final, algo que puede ser una casa o un sombrero. Se encoge de hombros: es lo mejor que le sale.)',
      },
      {
        words: /\b(gracias|amigo|buena gente)\b/,
        reply: '(Sonríe por primera vez y te da una palmada en el hombro que casi te tira.)',
      },
    ],
  },
  {
    name: 'Maese Ireneo el cartógrafo',
    intro:
      '¡No pises ahí! Ah, no, perdón, es que acabo de medir ese pedazo. ¿Sabías que este cruce está veinte pasos más al norte que en todos los mapas?',
    story:
      'Llevo doce años dibujando el mapa verdadero del reino. Los que venden en las tiendas están mal: copian al que copió al que copió a uno que nunca salió de la capital. El mío va a estar bien. Me faltan... calculo que otros doce años.',
    topics: [
      {
        words: /\b(mapa|mapas|dibujar|medir|cartografo|cartografia)\b/,
        reply:
          'Un mapa no te dice dónde están las cosas: te dice dónde estaban cuando pasó el que lo dibujó. Las granjas se mudan, los caminos se tapan. Los únicos que no se mueven son los portales.',
      },
      {
        words: /\b(error|errores|mal|equivocado|mentira)\b/,
        reply:
          'El error más lindo que encontré: un lago que figuraba en seis mapas y no existe. Alguien manchó el original con vino.',
      },
      {
        words: /\b(ciudad perdida|selva|oeste)\b/,
        reply:
          'La Ciudad Perdida la marqué tres veces en tres lugares distintos. O yo mido mal, o ella no se queda quieta. Y yo no mido mal.',
      },
    ],
  },
  {
    name: 'Tomasa la del burro',
    intro:
      'Buenas. Este es Filósofo. No lo toques, que muerde. Bah, no muerde, pero te mira de una manera que es peor.',
    story:
      'Vendo quesos de granja en granja. El burro se llama Filósofo porque se para en medio del camino a pensar y no hay quien lo mueva. Una vez se paró y no avanzó en todo el día. A la noche supe que más adelante había una emboscada. Desde entonces, si él para, yo paro.',
    topics: [
      {
        words: /\b(burro|filosofo|animal|mula)\b/,
        reply:
          'Sabe más que yo. Si mueve la oreja izquierda, llueve. Si mueve la derecha, viene gente. Si mueve las dos, mejor salí del camino.',
      },
      {
        words: /\b(queso|quesos|granja|granjas|leche)\b/,
        reply:
          'El mejor queso es el de las chacras del llano. Si pasás por alguna, preguntá si necesitan una mano: siempre tienen algún lío, y pagan con comida.',
      },
      {
        words: /\b(emboscada|salteadores|bandidos|peligro)\b/,
        reply:
          'Los salteadores no asaltan a la gente como yo: ¿qué me van a sacar, un queso? Asaltan al que camina derecho y con la bolsa llena. Como vos.',
      },
    ],
  },
  {
    name: 'Lázaro Vuelveatrás',
    intro:
      'No te asustes por la cara. Es que me morí siete veces, y cada vez uno vuelve un poquito peor.',
    story:
      'La primera vez fue un lobo. La segunda, un puente. La tercera prefiero no contarla. A la séptima, el sanador me dijo: «Lázaro, vos no tenés mala suerte: vos no aprendés». Tenía razón. Ahora miro dos veces antes de todo.',
    topics: [
      {
        words: /\b(morir|muerte|mori|fantasma|otro lado|mas alla|resucitar)\b/,
        reply:
          'Del otro lado es todo gris y nadie te contesta. Lo peor no es el miedo: es el aburrimiento. Y ver tu cuerpo ahí tirado, con todas tus cosas, sin poder agarrar nada.',
      },
      {
        words: /\b(consejo|aprender|cuidarme|sobrevivir)\b/,
        reply:
          'Elegí un santuario como hogar antes de salir. Llevá vendas. Y si algo tiene nombre propio y vos no, no lo ataques.',
      },
      {
        words: /\b(tercera|tercera vez)\b/,
        reply: 'Había una gallina involucrada. No pregunto más y vos tampoco.',
      },
    ],
  },
  {
    name: 'Doña Úrsula la adivina',
    intro:
      'Te estaba esperando. Bueno, a vos o a cualquiera. Dame la mano... no, la otra. Decime «leeme la suerte» y vemos qué sale.',
    story:
      'Leo manos, borra de mate y vuelos de pájaros. Acierto una de cada tres, que es más que los médicos. El secreto es decir cosas que le pasan a todo el mundo, con cara de que solo te pasan a vos.',
    topics: [
      {
        words: /\b(futuro|destino|adivinar|adivina|manos|borra)\b/,
        reply:
          'El futuro no está escrito. Está garabateado, que es peor: se entiende la mitad y la otra mitad la inventa una.',
      },
      {
        words: /\b(amor|pareja|casar|novia|novio)\b/,
        reply: 'Veo a alguien alto... o bajo. Te mira. O miraba. Es difícil con esta luz.',
      },
    ],
    fortunes: [
      'Veo un camino largo y una decisión al final. Vas a elegir bien, pero te va a costar dormir.',
      'Alguien que creés muerto te espera en un lugar frío. No vayas con las manos vacías.',
      'Cuidado con el tercer cofre. El primero y el segundo están bien.',
      'Vas a encontrar oro donde otros solo vieron barro. Llevá pala.',
      'Un extraño de nombre azul te va a pedir un favor. Decile que sí: te conviene.',
      'Veo fuego. Mucho fuego. Puede ser un dragón o puede ser tu cena. Con esta mano no se distingue.',
      'Hoy no te mueras. No es una predicción, es un consejo.',
      'Te van a ofrecer algo a cambio de callarte. Lo que valga tu silencio, valelo vos.',
    ],
  },
  {
    name: 'Jacinto el poeta',
    intro:
      '¡Un oyente! Quedate, quedate. «Caminante de botas gastadas, / que al cruce llegás sin saber...» Todavía no tengo el final.',
    story:
      'Quise ser bardo de la corte, pero el rey se durmió en mi primera oda. Ahora les recito a los que pasan, que no pueden dormirse porque están parados. Pedime una copla y te regalo una.',
    topics: [
      {
        words: /\b(copla|coplas|poema|poesia|verso|versos|recita|recitar|cancion)\b/,
        reply:
          '«Al fénix le pregunté / cómo es eso de volver. / Me dijo: primero ardé, / que después se aprende a arder.» Esa es de las buenas.',
      },
      {
        words: /\b(rey|corte|oda|castillo)\b/,
        reply:
          'La oda tenía ciento doce estrofas. El rey aguantó nueve. La reina, catorce. El bufón lloró, pero creo que por otra cosa.',
      },
      {
        words: /\b(amor|triste|tristeza|pena)\b/,
        reply:
          '«Me dijiste hasta mañana / y era hasta nunca jamás. / Yo sigo en la misma esquina: / el que se fue no vuelve atrás.» Esa no la recito seguido.',
      },
    ],
  },
  {
    name: 'Hermenegildo el buscador',
    intro: 'Shh. ¿Oís? ...No, nada. Perdón. Es que llevo tanto buscando que ya me parece oírla.',
    story:
      'Busco la ciudad que el imperio escondió antes de caer. No la de la selva, esa la conoce cualquiera: la otra. La que no figura ni en las leyendas. Tengo tres pistas, dos son falsas y no sé cuáles.',
    topics: [
      {
        words: /\b(ciudad|imperio|escondida|pista|pistas|buscar|buscas)\b/,
        reply:
          'Primera pista: «donde el camino viejo no llega». Segunda: «bajo la mirada de piedra». Tercera: «a la sombra del que no murió». Si entendés alguna, avisame. Vengo todos los días a este cruce.',
      },
      {
        words: /\b(camino viejo|empedrado|camino antiguo)\b/,
        reply:
          'Los caminos del imperio van a todos lados menos a uno. Hace años que los camino al revés, mirando adónde no van.',
      },
      {
        words: /\b(loco|locura|creer|cuento)\b/,
        reply:
          'Loco era el que buscaba la Tumba de los Reyes, hasta que la encontró. Después fue «visionario». Yo estoy en la etapa anterior.',
      },
    ],
  },
  {
    name: 'Capitán Olegario Sinbarco',
    intro:
      '¡Ah del camino! ¿Tenés barco? ¿No? Qué lástima. Yo tampoco. Capitán Olegario, a tus órdenes, de la goleta... bueno, de ninguna, por ahora.',
    story:
      'Tuve la goleta más linda de Altamar. La aposté a los dados contra un pirata y saqué un uno. Desde entonces camino tierra adentro: dicen que la mala suerte no sabe nadar, a ver si tampoco sabe caminar.',
    topics: [
      {
        words: /\b(barco|goleta|navegar|mar|marinero|altamar)\b/,
        reply:
          'El mar es fácil: viento, vela y rumbo. Lo difícil son los puertos, que están llenos de gente. Si comprás un barco, no lo dejes sin nadie que lo mire.',
      },
      {
        words: /\b(pirata|piratas|cala|dados|apuesta)\b/,
        reply:
          'Los piratas tienen su cala en la costa. El que me ganó la goleta se llamaba Barbas. Si lo ves, decile que los dados estaban cargados. Desde lejos decíselo.',
      },
      {
        words: /\b(suerte|mala suerte|uno)\b/,
        reply:
          'Saqué uno siete veces seguidas. El pirata dijo que era un milagro. Yo dije otra palabra.',
      },
    ],
  },
  {
    name: 'Belisario el desertor',
    intro:
      'No me mires así. Sí, es una capa de la guardia. No, no la robé. Era mía. Seguí caminando, o quedate, pero no preguntes de dónde vengo.',
    story:
      'Me ordenaron cerrar la puerta de un pueblo con gente todavía afuera. Venían los orcos y el capitán dijo «cerrá». Dejé la lanza y me fui abriendo la puerta. No sé cuántos entraron. No sé si alcanzó. No puedo volver a preguntar.',
    topics: [
      {
        words: /\b(desertor|desertar|guardia|orden|ordenes|capitan|puerta)\b/,
        reply:
          'Una orden es una cosa que otro decide y vos cargás. Yo cargué con no cumplirla. No sé qué pesa más, pero esta la elegí yo.',
      },
      {
        words: /\b(volver|pueblo|perdon|juicio)\b/,
        reply:
          'Si vuelvo, me cuelgan o me dan una medalla, según quién haya sobrevivido. Prefiero no enterarme.',
      },
      {
        words: /\b(orcos|ataque|pelear)\b/,
        reply:
          'A los orcos no les tengo miedo. Le tengo miedo a un hombre tranquilo, detrás de un escritorio, diciendo «cerrá».',
      },
    ],
  },
  {
    name: 'Eufrasia la partera',
    intro:
      'Pará, dejame verte. Hombros anchos, cabeza grande... a vos te costó nacer, ¿no? Se nota. Soy Eufrasia: traje al mundo a medio reino.',
    story:
      'Cuarenta años de partera. Recibí al herrero de Roca Alta, a la banquera de la capital y a dos que hoy tienen el nombre rojo. Todos lloraban igual. Lo que se tuerce, se tuerce después.',
    topics: [
      {
        words: /\b(nacer|nacimiento|partera|bebe|chicos|ninos)\b/,
        reply:
          'Todos llegan con las manos cerradas y se van con las manos abiertas. En el medio, cada uno ve qué agarra.',
      },
      {
        words: /\b(asesino|asesinos|nombre rojo|malos|criminal)\b/,
        reply:
          'A uno de esos lo tuve en brazos. Era un chico más. Nadie nace con el nombre rojo: se lo va pintando solo.',
      },
      {
        words: /\b(secreto|secretos|chisme|chismes|sabes de)\b/,
        reply:
          'Sé quién es hijo de quién en cuatro pueblos, y no siempre coincide con lo que dice el apellido. Me lo llevo a la tumba, que para eso me pagan dos veces.',
      },
    ],
  },
  {
    name: 'Nicomedes el cazador de tormentas',
    intro:
      '¿Sentís eso en el aire? ¿No? Qué lástima. Viene una grande. Bueno, capaz. Nicomedes, cazador de tormentas. No, no se cazan. Es una forma de decir.',
    story:
      'Me cayó un rayo a los doce años y desde entonces las huelo venir. Las sigo y anoto dónde cae cada rayo. Tengo cuatrocientos anotados. Caen casi siempre en los mismos lugares, y nadie se pregunta por qué.',
    topics: [
      {
        words: /\b(tormenta|tormentas|rayo|rayos|trueno|truenos|lluvia)\b/,
        reply:
          'El rayo no cae donde quiere: cae donde lo llaman. Las piedras paradas, las torres de los magos, ciertos árboles secos. Algo hay ahí abajo que lo llama.',
      },
      {
        words: /\b(torre|mago|magos|magia)\b/,
        reply:
          'A la torre del mago chiflado le caen más rayos que a toda la cordillera junta. Él dice que es casualidad. Tiene una antena en el techo.',
      },
      {
        words: /\b(doce anos|te cayo|sobrevivir|cicatriz)\b/,
        reply:
          'Me dejó un dibujo en la espalda, como un helecho. Y esto de oler el agua. Mal negocio no fue.',
      },
    ],
  },
  {
    name: 'la Niña Abril',
    intro:
      'Hola. ¿Viste a mi papá? Es alto, tiene un sombrero con una pluma roja. Me dijo que lo espere acá y que no hable con extraños. Vos ya no sos extraño, te acabo de conocer.',
    story:
      'Mi papá es buhonero. Me dejó en el cruce y fue a vender a un campamento, que volvía antes de que baje el sol. De eso hace... no sé, yo no sé contar tan lejos. Mientras, cuento carretas. Hoy pasaron dos.',
    topics: [
      {
        words: /\b(papa|padre|buhonero|sombrero|pluma)\b/,
        reply:
          'Se llama Evaristo. Vende cintas, agujas y un tónico que cura todo. A mí me curó el hipo. Si lo ves, decile que me porté bien y que no me moví.',
      },
      {
        words: /\b(sola|miedo|noche|lobos)\b/,
        reply:
          'De noche me subo al cartel. Los lobos no saben trepar. Bueno, uno sí supo, pero le di con el zapato.',
      },
      {
        words: /\b(jugar|juego|contar|carretas)\b/,
        reply:
          '¿Jugamos a adivinar qué lleva la próxima carreta? Yo digo quesos. Siempre son quesos.',
      },
    ],
  },
];

export function wandererByName(name: string): Wanderer | undefined {
  return WANDERERS.find((w) => w.name === name);
}
