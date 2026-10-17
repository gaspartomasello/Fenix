/** Lo que tiene escrito un libro. */
export interface BookText {
  readonly title: string;
  readonly author: string;
  readonly pages: readonly string[];
  /** Libro ya escrito que se encuentra en el mundo: se lee pero no se cambia. */
  readonly sealed?: boolean;
}

/** Cuántas hojas tiene un libro. */
export const BOOK_PAGES = 16;
/** Cuántas letras entran en una hoja. */
export const BOOK_PAGE_CHARS = 320;
/** Largo máximo del título. */
export const BOOK_TITLE_CHARS = 40;

/** Un libro sin nada escrito. */
export const BLANK_BOOK: BookText = { title: '', author: '', pages: [] };

/** Sin caracteres de control (salvo, si se pide, el salto de línea) y hasta `max` letras. */
function clean(text: string, max: number, lines: boolean): string {
  return [...text.replace(lines ? /[^\S\n]/g : /\s/g, ' ')]
    .filter((c) => c === '\n' || c.charCodeAt(0) >= 32)
    .slice(0, max)
    .join('');
}

/** Título dentro de los límites del libro. */
export function cleanBookTitle(title: string): string {
  return clean(title, BOOK_TITLE_CHARS, false).trim();
}

/** Hoja dentro de los límites del libro. */
export function cleanBookPage(text: string): string {
  return clean(text, BOOK_PAGE_CHARS, true);
}

/** Escribe una hoja (y el título): hojas vacías al final no cuentan. */
export function writeBookPage(
  book: BookText,
  author: string,
  title: string,
  page: number,
  text: string,
): BookText {
  const pages = [...book.pages];
  while (pages.length <= page) pages.push('');
  pages[page] = cleanBookPage(text);
  while (pages.length > 0 && pages[pages.length - 1]?.trim() === '') pages.pop();
  return { title: cleanBookTitle(title), author: book.author || author, pages };
}

/**
 * Libros que se encuentran en las bibliotecas del mundo: historias, consejos
 * y leyendas de estas tierras. Todo escrito para Fenix.
 */
export const LORE_BOOKS: readonly BookText[] = [
  {
    title: 'Crónica de Puerto Ceniza',
    author: 'Ernesto el escriba',
    sealed: true,
    pages: [
      'Antes de que hubiera murallas, Puerto Ceniza era un puñado de chozas de pescadores al pie del río. La ceniza que le da nombre bajaba del volcán del sur en los inviernos malos y cubría los techos como una nevada gris.',
      'Los primeros reyes levantaron el castillo con piedra traída de las colinas del oeste. Dicen que tardaron cuarenta años y que tres maestros canteros murieron antes de ver la torre terminada.',
      'Hoy el puerto recibe barcos de todas las islas. En la plaza se vende de todo: pescado, telas, espadas y pociones. La guardia del rey cuida las calles, y quien levanta la mano contra un vecino no llega muy lejos.',
      'Si visitás la ciudad, no dejes de cruzar los puentes al atardecer. El río se pone del color del cobre y los faroles se prenden uno por uno.',
    ],
  },
  {
    title: 'Sobre los muertos que caminan',
    author: 'Hermano Anselmo',
    sealed: true,
    pages: [
      'En los cementerios viejos la tierra no siempre retiene a los suyos. Cuando cae la noche, los huesos se juntan y se levantan, y vagan entre las tumbas buscando a los vivos.',
      'El esqueleto es torpe pero no siente dolor. El zombi es lento y apesta; su mordida enferma. El espectro, en cambio, es peligroso: atraviesa las paredes y su toque hiela la sangre.',
      'Consejo del que sobrevivió: llevá ajo y vendas, no vayas solo, y si escuchás un lamento en una cripta, pensalo dos veces antes de bajar.',
    ],
  },
  {
    title: 'Manual del buen herrero',
    author: 'Tomás el herrero',
    sealed: true,
    pages: [
      'El hierro se saca de la montaña con el pico. Hay que buscar la roca con vetas oscuras; a veces se encuentra adentro de las cuevas.',
      'El mineral se funde en la forja: doble clic sobre él estando cerca del fuego. De cada mineral sale un lingote, si la mano es buena.',
      'Con el martillo de herrero y los lingotes se hacen armas y armaduras. Al principio salen mal; con la práctica salen mejor. Nadie nace sabiendo.',
    ],
  },
  {
    title: 'Las ocho escuelas de la magia',
    author: 'Maestra Elvira',
    sealed: true,
    pages: [
      'La magia se ordena en ocho círculos. Los primeros piden poco maná y pocos reactivos; los últimos, mucha concentración y años de estudio.',
      'Cada hechizo pide sus reactivos: perla negra, musgo de sangre, ajo, ginseng, mandrágora, belladona, seda de araña y ceniza sulfurosa. Sin ellos, las palabras no tienen fuerza.',
      'Un buen mago siempre lleva su libro de hechizos y un puñado de pergaminos en blanco. Lo que se escribe en un pergamino se puede lanzar una vez sin gastar reactivos.',
      'Y recordá: la meditación devuelve el maná más rápido. Sentate, cerrá los ojos y respirá.',
    ],
  },
  {
    title: 'Leyenda del dragón rojo',
    author: 'Anónimo',
    sealed: true,
    pages: [
      'Dicen los viejos que más allá de las montañas, donde la tierra humea, duerme un dragón tan grande que sus alas tapan el sol.',
      'Muchos caballeros fueron a buscarlo. Pocos volvieron, y los que volvieron no quisieron hablar de lo que vieron.',
      'Se cuenta que guarda un tesoro de oro y gemas, y que quien logre domar a una de sus crías podrá volar sobre el mundo. Pero eso, claro, es solo una leyenda.',
    ],
  },
  {
    title: 'Diario de un pescador',
    author: 'Rafael',
    sealed: true,
    pages: [
      'Día uno: la caña nueva funciona. Saqué tres pescados chicos en la orilla del río.',
      'Día cuatro: me alejé hasta la costa. El mar da peces más grandes, pero el viento se lleva la línea.',
      'Día diez: un pirata me robó el bote. Si alguien encuentra un bote azul con una gaviota pintada, es mío.',
    ],
  },
];
