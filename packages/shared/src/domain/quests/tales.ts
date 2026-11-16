import type { CreatureKind } from '../creatures/creature-catalog';
import type { NpcRole } from '../economy/vendors';
import type { ItemKind } from '../items/item-catalog';

/**
 * Relatos de los lugares: cada lugar del campo (granjas, caseríos, campamentos,
 * posadas, rarezas) tiene a alguien con un problema propio. Al hablarle
 * («ayuda», «trabajo», «problema»…) lo cuenta: algo anda suelto cerca y hay
 * que terminar con eso. Las criaturas aparecen a un trecho del lugar; al
 * acabarlas, se vuelve a cobrar. Después de un rato, el lugar vuelve a tener
 * problemas (otra vez el mismo).
 */
export interface PlaceTale {
  /** En qué lugares (por su nombre) y con quién (su oficio). */
  readonly place: RegExp;
  readonly role: NpcRole;
  /** Lo que cuenta; `where` dice hacia dónde («hacia el norte, cerca de acá»). */
  readonly story: (where: string) => string;
  /** Lo que hay que matar: la primera, con nombre, es la cabecilla. */
  readonly foes: readonly { readonly kind: CreatureKind; readonly name?: string }[];
  readonly gold: number;
  readonly item?: { readonly kind: ItemKind; readonly amount: number };
  /** Lo que dice al cobrar. */
  readonly thanks: string;
}

/** Cuánto tarda un lugar en volver a tener problemas con el mismo jugador. */
export const TALE_REST_MS = 20 * 60 * 1000;
/** Cuánto tiempo hay para resolverlo antes de que lo suelto se vaya. */
export const TALE_MS = 25 * 60 * 1000;

export const PLACE_TALES: readonly PlaceTale[] = [
  {
    place: /^(Chacra|Granja|Tambo|Quinta) /,
    role: 'farmer',
    story: (where) =>
      `Una manada de lobos me está diezmando los animales: anoche se llevaron dos corderos. Andan ${where}. Si terminás con ellos, te pago y te llevás algo de la despensa.`,
    foes: [{ kind: 'wolf', name: 'el lobo tuerto' }, { kind: 'wolf' }, { kind: 'wolf' }],
    gold: 70,
    item: { kind: 'ham', amount: 2 },
    thanks: '¡Por fin voy a dormir tranquilo! Tomá, lo prometido, y un jamón de los buenos.',
  },
  {
    place: /^(Caserío|Aldea) /,
    role: 'innkeeper',
    story: (where) =>
      `Unos salteadores nos robaron la cerveza de toda la semana, y encima se ríen. El que manda es uno que le dicen Gervasio el Tuerto. Acampan ${where}. ¿Les darías una lección?`,
    foes: [
      { kind: 'brigand', name: 'Gervasio el Tuerto' },
      { kind: 'brigand' },
      { kind: 'brigand' },
    ],
    gold: 110,
    item: { kind: 'wine', amount: 3 },
    thanks:
      '¡Que se vuelvan a acercar, si se animan! Tomá: la paga y unas botellas de lo mejor de la casa.',
  },
  {
    place: /^(Campamento de los Hacheros|Obraje del Quebracho|Campamento del Hacha Mellada)$/,
    role: 'woodcutter',
    story: (where) =>
      `No podemos trabajar: una araña enorme hizo nido donde cortábamos, y ya se llevó a un muchacho. Le decimos la Viuda. Está ${where}. Si la matás, te pago y te doy leña.`,
    foes: [{ kind: 'giant-spider', name: 'la Viuda' }, { kind: 'giant-spider' }],
    gold: 90,
    item: { kind: 'logs', amount: 20 },
    thanks: '¡La Viuda está muerta! Mañana volvemos al monte. Tomá, te lo ganaste.',
  },
  {
    place: /^(Campamento de los Tramperos|Rancho de los Cazadores|Apostadero del Ciervo)$/,
    role: 'bowyer',
    story: (where) =>
      `Un troll anda espantando toda la caza, y rompe las trampas por gusto. Lo vi ${where}. Yo con mi arco no le hago ni cosquillas... ¿vos te animás?`,
    foes: [{ kind: 'troll', name: 'el troll de las trampas' }],
    gold: 120,
    item: { kind: 'arrow', amount: 50 },
    thanks: 'Mirá el tamaño de ese bicho... Tomá la paga y unas flechas, que nunca sobran.',
  },
  {
    place: /^(Posta de las Caravanas|Posta del Arriero Tuerto|Parada de los Carreteros)$/,
    role: 'provisioner',
    story: (where) =>
      `Unos orcos asaltaron la última carreta y se quedaron con todo. Están ${where}, repartiéndose lo nuestro. Si los echás, te pago el doble de lo que paga la guardia.`,
    foes: [{ kind: 'orc', name: 'Gruk el saqueador' }, { kind: 'orc' }, { kind: 'orc' }],
    gold: 130,
    item: { kind: 'bandage', amount: 15 },
    thanks:
      '¡Ja! Que aprendan a no meterse con la caravana. Tu paga, y unas vendas para el camino.',
  },
  {
    place: /^(Campamento de los Peregrinos|Refugio de la Hermandad|Alto de los Romeros)$/,
    role: 'healer',
    story: (where) =>
      `Un hermano fue a rezar a un cementerio viejo y no volvió: dicen que los muertos se levantaron. Están ${where}. Que descansen en paz otra vez, te lo ruego.`,
    foes: [
      { kind: 'zombie', name: 'el sacristán podrido' },
      { kind: 'zombie' },
      { kind: 'skeleton' },
    ],
    gold: 80,
    item: { kind: 'garlic', amount: 10 },
    thanks: 'Que la luz los guarde. Tomá esta ofrenda, y ajo: a los muertos no les gusta.',
  },
  {
    place: /^(Posada del Camino Real|Posada de la Rueda Rota|Parador del Viajero)$/,
    role: 'innkeeper',
    story: (where) =>
      `Los huéspedes se van sin pagar del susto: de noche, un espectro anda gimiendo ${where}. Si lo mandás de vuelta al otro mundo, la casa te paga.`,
    foes: [{ kind: 'wraith', name: 'el huésped que nunca se fue' }],
    gold: 120,
    item: { kind: 'bread', amount: 5 },
    thanks: 'Esta noche dormimos todos. Tomá la paga, y pan recién horneado.',
  },
  {
    place: /^Círculo de los Druidas$/,
    role: 'healer',
    story: (where) =>
      `Los huesos de una batalla vieja se levantaron y profanan las piedras. Andan ${where}. Las piedras no se defienden solas, forastero.`,
    foes: [
      { kind: 'skeleton', name: 'el capitán sin nombre' },
      { kind: 'skeleton' },
      { kind: 'skeleton' },
    ],
    gold: 90,
    item: { kind: 'ginseng', amount: 15 },
    thanks:
      'Las piedras te lo agradecen, y yo también. Llevate estas raíces: curan más de lo que parece.',
  },
  {
    place: /^Torre del Mago Chiflado$/,
    role: 'mage',
    story: (where) =>
      `¡Se me escapó un experimento! Un elemental de hielo, chiquito... bueno, no tan chiquito. Anda ${where}, congelando todo. Antes de que alguien se entere, ¿me lo traés de vuelta? Muerto está bien.`,
    foes: [{ kind: 'ice-elemental', name: 'el experimento número siete' }],
    gold: 150,
    item: { kind: 'black-pearl', amount: 15 },
    thanks:
      '¡El siete! Bueno, tenía fallas. Tomá, por las molestias, y unas perlas negras. No le cuentes a nadie.',
  },
  {
    place: /^Oasis /,
    role: 'provisioner',
    story: (where) =>
      `Unos bandidos del desierto me cortan la ruta y cobran peaje por el agua... ¡por el agua! Tienen guarida ${where}. Si los echás, te hago precio de por vida. Bueno, te pago.`,
    foes: [
      { kind: 'brigand', name: 'Hamid el del peaje' },
      { kind: 'brigand' },
      { kind: 'brigand' },
    ],
    gold: 110,
    item: { kind: 'apple', amount: 10 },
    thanks: '¡El agua es de todos otra vez! Tomá la paga, y fruta fresca, que acá vale oro.',
  },
];

/** El relato de un lugar para un oficio (o ninguno). */
export function taleFor(place: string, role: NpcRole): PlaceTale | null {
  return PLACE_TALES.find((t) => t.role === role && t.place.test(place)) ?? null;
}
