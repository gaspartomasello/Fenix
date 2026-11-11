import { NPC_CHATTER, isMerchant, type NpcRole } from '@fenix/shared/economy/vendors';
import { tileDistance, type Position } from '@fenix/shared/geometry/position';
import type { EntityId } from '@fenix/shared/protocol/messages';
import type { Npc } from '../../../domain/npcs/npc';
import type { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { NpcDialogue } from '../../kernel/npc-dialogue';
import { directions } from '@fenix/shared/world/compass';
import { INSULT, PRAISE, STORIES, TOPICS } from './npc-lore';
import { rumorOf, type Legends } from './legends';
import type { Notifier, RandomSource } from '../../ports';

/** A qué distancia un vecino escucha lo que le dicen. */
const LISTEN_RANGE = 4;
/** Con quién se recuerda haber hablado (por un rato largo). */
const MEMORY_MS = 60 * 60 * 1000;
/** Cuánto le dura el enojo a un vecino insultado. */
const GRUDGE_MS = 5 * 60 * 1000;

/** Cómo es cada uno: cambia la manera de decir las cosas, no lo que sabe. */
type Temper = 'warm' | 'gruff' | 'mysterious' | 'chatty';
const TEMPERS: readonly Temper[] = ['warm', 'gruff', 'mysterious', 'chatty'];

/** Lo que hace cada oficio, contado por quien lo hace. */
const TRADE: Readonly<Record<NpcRole, string>> = {
  blacksmith: 'Forjo armas y armaduras. Si traés lingotes, también te enseño a hacerlas.',
  mage: 'Vendo reactivos, pergaminos y libros de hechizos. La magia no se regala.',
  innkeeper: 'Tengo la taberna: comida, bebida y una cama. Y oídos, que acá se escucha de todo.',
  banker: 'Cuido el oro y las cosas de la gente. Lo que dejás en el banco no lo toca nadie.',
  stablemaster: 'Crío y vendo monturas. Caballos, sobre todo; algún bicho raro también.',
  woodcutter: 'Corto leña y hago tablas. Del bosque sale todo.',
  carpenter: 'Trabajo la madera: muebles, escudos, lo que haga falta.',
  provisioner: 'Vendo de todo un poco para el camino: comida, luz, bolsas, palas y ganzúas.',
  tailor: 'Coso ropa y vendo telas y tinturas.',
  shipwright: 'Hago barcos. Una balandra para empezar, o un galeón si te sobra el oro.',
  alchemist: 'Preparo pociones. Las buenas curan; las otras, mejor no preguntes.',
  healer: 'Curo a los heridos y vendo vendas y remedios.',
  bowyer: 'Hago arcos, ballestas, flechas y virotes.',
  baker: 'Hago el pan de todo el pueblo, desde antes del amanecer.',
  butcher: 'Corto la carne y compro los cueros.',
  fisherman: 'Pesco. El mar da, el mar quita.',
  jeweler: 'Compro y vendo piedras preciosas.',
  scribe: 'Copio libros, vendo pergaminos y guardo lo que otros olvidan.',
  architect:
    'Dibujo casas: elegí el plano, buscá un buen lugar en el campo, lejos de los pueblos, y levantala con la escritura.',
  farmer: 'Trabajo la tierra y crío animales. Lo que sobra, lo vendo.',
  townsfolk: 'Vivo acá, nomás. Trabajo en lo que salga.',
  guard: 'Cuido la paz de la ciudad. Los criminales no pasan.',
  beggar: 'Pido. Y escucho. Nadie le presta atención a un mendigo.',
};

/** Charla de relleno para cuando no se le entiende, según el carácter. */
const CONFUSED: Readonly<Record<Temper, string>> = {
  warm: 'Perdón, no te entendí. Preguntame por mi nombre, mi trabajo, mi historia, el pueblo o los rumores. O decime «temas».',
  gruff: '¿Eh? Hablá claro. Nombre, trabajo, historia, pueblo o rumores: de eso sé.',
  mysterious: 'Las palabras se pierden... Preguntá por rumores, si te animás.',
  chatty:
    '¡Ay, qué me decís! Mirá, de lo que quieras: mi nombre, mi oficio, el pueblo, los rumores, dónde queda algún lugar...',
};

const GREETING: Readonly<Record<Temper, readonly string[]>> = {
  warm: ['¡Buen día! ¿En qué te puedo ayudar?', '¡Hola! Qué gusto ver una cara nueva.'],
  gruff: ['Hm. ¿Qué querés?', 'Hola. Rápido, que tengo trabajo.'],
  mysterious: [
    'Te estaba esperando... o a alguien como vos.',
    'Hola, viajero. Los vientos te trajeron.',
  ],
  chatty: [
    '¡Hola, hola! Pasá, que hoy anduvo todo tan tranquilo que ya me aburría.',
    '¡Buenas! ¿Venís de lejos? Contame, que acá no pasa nada nunca.',
  ],
};

const FAREWELL: Readonly<Record<Temper, string>> = {
  warm: 'Que te vaya bien. Volvé cuando quieras.',
  gruff: 'Andá nomás.',
  mysterious: 'Nos volveremos a cruzar.',
  chatty: '¡Chau! ¡Y cuidate en los caminos, eh!',
};

/** Rumores sueltos, para quien no sabe ninguna leyenda. */
const IDLE_RUMORS: readonly string[] = [
  'Dicen que en las Tierras de Ceniza vive un dragón enorme.',
  'En el cementerio, de noche, se oyen pasos. Yo no voy ni loco.',
  'Los bandidos tienen su refugio en una isla del sur.',
  'Hay una cueva al este, donde la tierra está podrida. De ahí no vuelve cualquiera.',
  'Cuentan que bajo la capital hay túneles más viejos que la ciudad.',
  'La casa abandonada del pueblo... nadie sabe qué pasó con los que vivían ahí.',
];

/**
 * Hablar con los vecinos: lo que un jugador dice en voz alta cerca de alguien
 * del pueblo lo escucha el más cercano (o el que nombre), y contesta según lo
 * que le preguntan: saludo, nombre, oficio, el pueblo, dónde queda un lugar,
 * rumores, despedida. Cada uno tiene su carácter (sale de su nombre) y se
 * acuerda de con quién habló. Los rumores pueden empezar una leyenda (ver
 * `Legends`), y la persona indicada sabe más si le preguntan por la palabra justa.
 */
export class NpcTalk {
  /** Quién habló con quién, y cuándo (para saludarlo como conocido). */
  private readonly met = new Map<string, number>();
  /** Hasta cuándo un vecino no le habla a quien lo insultó. */
  private readonly grudges = new Map<string, number>();
  /** A quién le cae bien cada vecino (lo elogiaron o lo ayudaron). */
  private readonly liked = new Set<string>();

  constructor(
    private readonly world: World,
    private readonly legends: Legends,
    private readonly dialogue: NpcDialogue,
    private readonly notifier: Notifier,
    private readonly random: RandomSource,
    private readonly now: () => number,
  ) {}

  /** Un jugador dijo algo en voz alta: si hay un vecino cerca, contesta. */
  hear(playerId: EntityId, text: string): void {
    const player = this.world.get(playerId);
    if (!player || player.combat.isDead) return;
    const words = normalize(text);
    const npc = this.listener(player, words);
    if (!npc) return;
    const reply = this.answer(player, npc, words);
    if (reply) this.speak(player, npc, reply);
  }

  /** El vecino que escucha: el que nombraron, o el más cercano. */
  private listener(player: Player, words: string): Npc | null {
    const near = this.world
      .allNpcs()
      .filter((n) => tileDistance(n.position, player.position) <= LISTEN_RANGE)
      .sort(
        (a, b) =>
          tileDistance(a.position, player.position) - tileDistance(b.position, player.position),
      );
    return (
      near.find((n) => words.includes(normalize(n.name).split(' ')[0] ?? '~')) ?? near[0] ?? null
    );
  }

  private answer(player: Player, npc: Npc, words: string): string | null {
    const temper = TEMPERS[hash(npc.name) % TEMPERS.length] ?? 'warm';
    const key = `${npc.id}>${player.id}`;
    const knew = (this.met.get(key) ?? -Infinity) > this.now() - MEMORY_MS;
    this.met.set(key, this.now());
    const town = this.world.map.regionAt(npc.position)?.name ?? 'estas tierras';

    // Lo de las leyendas va primero: es lo que importa.
    const legend = this.legends.ask(player, npc, words);
    if (legend) return legend;
    if (this.legends.isLegendPerson(npc)) return null;
    // Lo que suman otros módulos (el gremio, los mercenarios…).
    const other = this.dialogue.answer(player, npc, words);
    if (other) return other;

    // Enojado: hasta que se le pida perdón, no quiere saber nada.
    if ((this.grudges.get(key) ?? 0) > this.now()) {
      if (/\b(perdon|disculpa|disculpame|perdoname|lo siento)\b/.test(words)) {
        this.grudges.delete(key);
        return temper === 'gruff'
          ? 'Hm. Bueno. Que no se repita.'
          : 'Está bien, te perdono. Todos tenemos un mal día.';
      }
      return temper === 'gruff'
        ? 'No te hablo. Andate.'
        : 'Después de lo que me dijiste, no tengo ganas de hablar con vos.';
    }
    if (INSULT.test(words)) {
      this.grudges.set(key, this.now() + GRUDGE_MS);
      this.liked.delete(key);
      return npc.role === 'guard'
        ? 'Cuidá esa lengua, que acá adentro mando yo.'
        : temper === 'gruff'
          ? '¿Qué dijiste? Andate antes de que llame a la guardia.'
          : '¡Qué maleducado! No te pienso hablar más.';
    }
    if (PRAISE.test(words)) {
      this.liked.add(key);
      return temper === 'gruff'
        ? 'Hm. Gracias, supongo.'
        : '¡Ay, gracias! Qué amable. Me caés bien.';
    }

    // A los asesinos se los atiende con miedo (o no se los atiende).
    const notoriety = player.reputation.notoriety;
    const lawless = this.world.map.regionAt(npc.position)?.wild === true;
    if (notoriety === 'murderer' && npc.role !== 'beggar' && !lawless)
      return npc.role === 'guard'
        ? `¡Asesino! ${player.name}, entregate o te vamos a buscar.`
        : 'Yo... yo no quiero problemas. Por favor, andate.';

    if (/\b(hola|buen[oa]s?|saludos|que tal)\b/.test(words)) {
      const options = GREETING[temper];
      const line = options[Math.floor(this.random.next() * options.length)] ?? options[0] ?? '';
      const fame = player.reputation.fame;
      if (fame >= 5000 && !knew)
        return `¿Vos sos ${player.name}? ¡Todo el mundo habla de vos! ${line}`;
      if (notoriety === 'criminal') return `Hm... te tengo vigilado. ${line}`;
      return knew
        ? `¡${player.name}! ${this.liked.has(key) ? 'Qué alegría verte de nuevo. ' : ''}${line}`
        : line;
    }
    if (
      /\b(historia|tu vida|familia|de donde sos|de donde eres|contame de vos|tu pasado|como llegaste)\b/.test(
        words,
      )
    )
      return this.story(npc);
    if (/\b(temas|de que hablas|de que sabes|que sabes|palabras|sobre que)\b/.test(words))
      return `Podés preguntarme por mi nombre, mi trabajo, mi historia, el pueblo, los rumores o dónde queda algún lugar. Y de lo que se habla en las tabernas: los dragones, la magia, los guardias, los asesinos, el mar, los gremios...`;
    if (
      /\b(mision|misiones|necesitas algo|necesitas ayuda|te ayudo|puedo ayudar|trabajo para mi)\b/.test(
        words,
      )
    )
      return npc.role === 'townsfolk'
        ? 'Tocame dos veces (o doble clic) y te cuento si necesito algo.'
        : 'Yo no tengo trabajo para darte. Los vecinos del pueblo siempre necesitan ayuda: tocalos dos veces. Y si querés algo de verdad grande, preguntá por rumores.';
    if (/\b(nombre|quien sos|quien eres|como te llamas)\b/.test(words))
      return `Me llaman ${npc.name}. ${TRADE[npc.role]}`;
    if (/\b(trabajo|oficio|que haces|a que te dedicas)\b/.test(words))
      return TRADE[npc.role] + (isMerchant(npc.role) ? ' Tocame si querés comerciar.' : '');
    if (/\b(rumor|rumores|noticias|chisme|chismes|novedades|secreto|secretos)\b/.test(words))
      return this.rumor(player, npc, temper);
    const place = this.placeIn(words);
    if (place && /\b(donde|como llego|queda|camino)\b/.test(words))
      return directions(npc.position, place);
    if (/\b(pueblo|ciudad|aca|lugar)\b/.test(words))
      return `Estás en ${town}. ${temper === 'gruff' ? 'No es gran cosa, pero es lo que hay.' : 'Tiene lo suyo, si sabés buscar.'}`;
    if (/\b(comprar|vender|precio|tienda)\b/.test(words))
      return isMerchant(npc.role)
        ? 'Tocame y te muestro lo que tengo.'
        : 'Yo no vendo nada. Buscá a los comerciantes del pueblo.';
    if (/\b(chau|adios|hasta luego|nos vemos)\b/.test(words)) return FAREWELL[temper];
    const topic = TOPICS.find((t) => t.words.test(words));
    if (topic)
      return topic.replies[hash(npc.name + words) % topic.replies.length] ?? topic.replies[0] ?? '';
    if (/\b(gracias)\b/.test(words)) return temper === 'gruff' ? 'Sí, sí.' : 'No hay de qué.';
    // Si no se entiende y no le hablaban a él, mejor callarse.
    if (tileDistance(npc.position, player.position) > 2 && !words.includes(normalize(npc.name)))
      return null;
    const chatter = NPC_CHATTER[npc.role];
    if (chatter && this.random.next() < 0.3)
      return chatter[Math.floor(this.random.next() * chatter.length)] ?? CONFUSED[temper];
    return CONFUSED[temper];
  }

  /** Su historia: cada vecino tiene la suya (sale de su nombre) y la cuenta igual cada vez. */
  private story(npc: Npc): string {
    const own = STORIES[npc.role] ?? STORIES.townsfolk ?? [];
    return own[hash(npc.name + 'historia') % own.length] ?? TRADE[npc.role];
  }

  /** Un rumor: la leyenda que sabe (y el jugador la anota) o algo suelto. */
  private rumor(player: Player, npc: Npc, temper: Temper): string {
    const legend = rumorOf(npc);
    if (legend) {
      this.legends.heard(player, legend);
      const lead =
        temper === 'mysterious'
          ? 'Acercate, que esto no se dice en voz alta... '
          : temper === 'gruff'
            ? 'No soy de andar con chismes, pero... '
            : '';
      return lead + legend.rumor.text;
    }
    return IDLE_RUMORS[hash(npc.name + player.name) % IDLE_RUMORS.length] ?? IDLE_RUMORS[0] ?? '';
  }

  /** Un lugar con nombre mencionado en lo que dijo (un pueblo, unas ruinas…). */
  private placeIn(words: string): { name: string; center: Position } | null {
    const region = this.world.map.regions.find(
      (r) => !r.floor && r.name.length > 3 && words.includes(normalize(r.name)),
    );
    if (!region) return null;
    return {
      name: region.name,
      center: { x: region.x + region.width / 2, y: region.y + region.height / 2 },
    };
  }

  private speak(player: Player, npc: Npc, text: string): void {
    // Lo escuchan los que están cerca (como cualquiera que habla en voz alta).
    const listeners = this.world.playersNear(npc.position).map((p) => p.id);
    this.notifier.sendMany(listeners.includes(player.id) ? listeners : [...listeners, player.id], {
      type: 'chat',
      id: npc.id,
      name: npc.name,
      text,
      channel: 'say',
    });
  }
}

/** Minúsculas, sin acentos ni signos: para entender lo que dice. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hash(text: string): number {
  let h = 11;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
