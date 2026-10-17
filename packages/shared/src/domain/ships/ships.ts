import { directionOffset, type Direction } from '../geometry/direction';
import type { Position } from '../geometry/position';

/**
 * Barcos, como en Ultima Online: se compran como maqueta, se botan al agua y
 * los navegan varios personajes juntos. El dueño es siempre el capitán; a los
 * demás se les da un nivel de permiso (pasajero, tripulante, oficial o
 * capitán), uno por uno o a todo el grupo o el gremio del dueño.
 */
export const SHIP_KINDS = ['sloop', 'galleon'] as const;
export type ShipKind = (typeof SHIP_KINDS)[number];

export function isShipKind(value: unknown): value is ShipKind {
  return typeof value === 'string' && (SHIP_KINDS as readonly string[]).includes(value);
}

export interface ShipDefinition {
  readonly kind: ShipKind;
  readonly name: string;
  /** Tiles a lo largo (de proa a popa) y a lo ancho; siempre impares. */
  readonly length: number;
  readonly width: number;
  readonly maxHits: number;
  /** Cañones por banda (babor y estribor). */
  readonly cannons: number;
  /** Cuántos objetos entran en la bodega. */
  readonly hold: number;
  /** Tiempo para avanzar un tile a toda vela y despacio. */
  readonly fastMs: number;
  readonly slowMs: number;
}

export const SHIPS: Readonly<Record<ShipKind, ShipDefinition>> = {
  sloop: {
    kind: 'sloop',
    name: 'balandra',
    length: 5,
    width: 3,
    maxHits: 600,
    cannons: 0,
    hold: 40,
    fastMs: 300,
    slowMs: 700,
  },
  galleon: {
    kind: 'galleon',
    name: 'galeón',
    length: 7,
    width: 3,
    maxHits: 1500,
    cannons: 1,
    hold: 80,
    fastMs: 380,
    slowMs: 800,
  },
};

/** La maqueta con la que se compra y se guarda cada barco. */
export const SHIP_DEEDS = {
  sloop: 'sloop-deed',
  galleon: 'galleon-deed',
} as const satisfies Record<ShipKind, string>;

export function shipKindOfDeed(kind: string): ShipKind | null {
  if (kind === SHIP_DEEDS.sloop) return 'sloop';
  if (kind === SHIP_DEEDS.galleon) return 'galleon';
  return null;
}

/** Hacia dónde mira la proa: norte, este, sur u oeste (las direcciones pares). */
export type ShipFacing = 0 | 2 | 4 | 6;

export function isShipFacing(value: unknown): value is ShipFacing {
  return value === 0 || value === 2 || value === 4 || value === 6;
}

/** La dirección de un personaje redondeada a una que sirva de proa. */
export function shipFacingFrom(direction: Direction): ShipFacing {
  return ((Math.round(direction / 2) * 2) % 8) as ShipFacing;
}

/** Los tiles que ocupa un barco con el centro en `center`. */
export function shipTiles(kind: ShipKind, center: Position, facing: ShipFacing): Position[] {
  const { length, width } = SHIPS[kind];
  const along = directionOffset(facing);
  const across = { x: -along.y, y: along.x };
  const tiles: Position[] = [];
  const halfL = (length - 1) / 2;
  const halfW = (width - 1) / 2;
  for (let a = -halfL; a <= halfL; a++)
    for (let b = -halfW; b <= halfW; b++)
      tiles.push({
        x: center.x + along.x * a + across.x * b,
        y: center.y + along.y * a + across.y * b,
      });
  return tiles;
}

/** Gira un punto alrededor del centro del barco (un cuarto de vuelta). */
export function rotateAround(point: Position, center: Position, side: 'left' | 'right'): Position {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return side === 'right'
    ? { x: center.x - dy, y: center.y + dx }
    : { x: center.x + dy, y: center.y - dx };
}

export function turnFacing(facing: ShipFacing, side: 'left' | 'right' | 'around'): ShipFacing {
  const step = side === 'right' ? 2 : side === 'left' ? 6 : 4;
  return ((facing + step) % 8) as ShipFacing;
}

/** Banda del barco: babor (izquierda mirando a proa) o estribor (derecha). */
export type ShipSide = 'port' | 'starboard';

export const SHIP_SIDE_NAMES: Readonly<Record<ShipSide, string>> = {
  port: 'babor',
  starboard: 'estribor',
};

/** Hacia dónde dispara una banda. */
export function sideDirection(facing: ShipFacing, side: ShipSide): Direction {
  return ((facing + (side === 'starboard' ? 2 : 6)) % 8) as Direction;
}

// ── Permisos de a bordo ─────────────────────────────────────────────

/**
 * Niveles de permiso, de menor a mayor, como en los galeones de UO:
 * - pasajero: sube a bordo;
 * - tripulante: además gobierna el timón, dispara los cañones y repara;
 * - oficial: además abre la bodega;
 * - capitán: además decide los permisos, cambia el nombre y guarda el barco.
 */
export const SHIP_LEVELS = ['denied', 'passenger', 'crew', 'officer', 'captain'] as const;
export type ShipLevel = (typeof SHIP_LEVELS)[number];

export function isShipLevel(value: unknown): value is ShipLevel {
  return typeof value === 'string' && (SHIP_LEVELS as readonly string[]).includes(value);
}

export const SHIP_LEVEL_NAMES: Readonly<Record<ShipLevel, string>> = {
  denied: 'sin permiso',
  passenger: 'pasajero',
  crew: 'tripulante',
  officer: 'oficial',
  captain: 'capitán',
};

export function levelAtLeast(level: ShipLevel, needed: ShipLevel): boolean {
  return SHIP_LEVELS.indexOf(level) >= SHIP_LEVELS.indexOf(needed);
}

/** Quién puede qué en un barco. */
export interface ShipSecurity {
  /** Permisos dados con nombre (en minúsculas). "denied" deja afuera aunque sea del grupo. */
  readonly manifest: Readonly<Record<string, ShipLevel>>;
  /** Para cualquiera, para el grupo del dueño y para su gremio. */
  readonly everyone: ShipLevel;
  readonly party: ShipLevel;
  readonly guild: ShipLevel;
}

export const DEFAULT_SHIP_SECURITY: ShipSecurity = {
  manifest: {},
  everyone: 'denied',
  party: 'passenger',
  guild: 'passenger',
};

/** Cuántos nombres entran en la lista de un barco. */
export const MAX_SHIP_MANIFEST = 30;

/** Lo que importa de alguien para saber su permiso. */
export interface ShipVisitor {
  readonly name: string;
  readonly inOwnerParty: boolean;
  readonly inOwnerGuild: boolean;
}

/** El permiso que tiene alguien en un barco (el dueño siempre es capitán). */
export function shipLevel(security: ShipSecurity, owner: string, who: ShipVisitor): ShipLevel {
  const name = who.name.toLowerCase();
  if (name === owner.toLowerCase()) return 'captain';
  const listed = security.manifest[name];
  if (listed === 'denied') return 'denied';
  let best: ShipLevel = listed ?? 'denied';
  const raise = (level: ShipLevel): void => {
    if (!levelAtLeast(best, level)) best = level;
  };
  raise(security.everyone);
  if (who.inOwnerParty) raise(security.party);
  if (who.inOwnerGuild) raise(security.guild);
  return best;
}

// ── Órdenes al timonel ──────────────────────────────────────────────

/** Rumbo relativo a la proa: 0 adelante, 2 a estribor, 4 atrás, 6 a babor. */
export type RelativeHeading = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ShipOrder =
  | {
      readonly kind: 'move';
      readonly heading: RelativeHeading;
      readonly speed: 'fast' | 'slow' | 'one';
    }
  | { readonly kind: 'turn'; readonly side: 'left' | 'right' | 'around' }
  | { readonly kind: 'stop' };

export function isShipOrder(value: unknown): value is ShipOrder {
  if (typeof value !== 'object' || value === null) return false;
  const order = value as Record<string, unknown>;
  if (order.kind === 'stop') return true;
  if (order.kind === 'turn')
    return order.side === 'left' || order.side === 'right' || order.side === 'around';
  if (order.kind === 'move')
    return (
      typeof order.heading === 'number' &&
      Number.isInteger(order.heading) &&
      order.heading >= 0 &&
      order.heading <= 7 &&
      (order.speed === 'fast' || order.speed === 'slow' || order.speed === 'one')
    );
  return false;
}

/** Hacia dónde se mueve el barco con ese rumbo relativo. */
export function absoluteHeading(facing: ShipFacing, heading: RelativeHeading): Direction {
  return ((facing + heading) % 8) as Direction;
}

const HEADINGS: readonly [string, RelativeHeading][] = [
  ['adelante a estribor', 1],
  ['adelante a babor', 7],
  ['atras a estribor', 3],
  ['atras a babor', 5],
  ['adelante', 0],
  ['atras', 4],
  ['estribor', 2],
  ['derecha', 2],
  ['babor', 6],
  ['izquierda', 6],
];

/**
 * Lo que entiende el timonel, como las órdenes de voz de UO: «adelante»,
 * «atrás», «babor», «estribor» (o izquierda y derecha), combinados
 * («adelante a babor»), con «despacio» o «un paso»; «virar a babor»,
 * «virar a estribor», «dar la vuelta» y «alto» (o «parar»).
 */
export function parseShipOrder(text: string): ShipOrder | null {
  const said = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¡!¿?.,]/g, '')
    .trim();
  if (said === 'alto' || said === 'parar' || said === 'para' || said === 'detenerse')
    return { kind: 'stop' };
  if (said === 'dar la vuelta' || said === 'media vuelta') return { kind: 'turn', side: 'around' };
  const turn = /^(virar|girar|gira|vira) a (la )?(babor|estribor|izquierda|derecha)$/.exec(said);
  if (turn) {
    const side = turn[3] === 'babor' || turn[3] === 'izquierda' ? 'left' : 'right';
    return { kind: 'turn', side };
  }
  let rest = said;
  let speed: 'fast' | 'slow' | 'one' = 'fast';
  if (rest.startsWith('despacio ')) {
    speed = 'slow';
    rest = rest.slice('despacio '.length);
  } else if (rest.startsWith('un paso ')) {
    speed = 'one';
    rest = rest.slice('un paso '.length);
  }
  rest = rest.replace(/^a (la )?/, '');
  for (const [words, heading] of HEADINGS)
    if (rest === words || rest === words.replace(' a ', ' '))
      return { kind: 'move', heading, speed };
  return null;
}

/** Hasta qué distancia del barco se lo puede abordar. */
export const BOARDING_RANGE = 6;
/** Hasta dónde llega un cañonazo. */
export const CANNON_RANGE = 12;
/** Cuánto tarda en volver a cargarse cada banda. */
export const CANNON_RELOAD_MS = 6000;
export const CANNON_HULL_DAMAGE: readonly [number, number] = [60, 110];
export const CANNON_MOBILE_DAMAGE: readonly [number, number] = [15, 30];
/** Cada reparación devuelve esta parte del casco y gasta tablas y tela. */
export const REPAIR_SHARE = 0.1;
export const REPAIR_BOARDS = 8;
export const REPAIR_CLOTH = 4;
/** Para guardar el barco hay que estar cerca de tierra. */
export const DOCK_RANGE = 6;

/** El estado del casco en palabras, como «algo dañado». */
export function hullCondition(hits: number, maxHits: number): string {
  const share = hits / maxHits;
  if (share >= 0.99) return 'como nuevo';
  if (share >= 0.75) return 'algo dañado';
  if (share >= 0.5) return 'bastante dañado';
  if (share >= 0.25) return 'muy dañado';
  return 'a punto de hundirse';
}

export function isShipName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 30;
}
