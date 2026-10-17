import { Terrain, type Position, type StaticKind, type StaticPlacement } from '@fenix/shared';
import { SeededRandom } from '../system/seeded-random';

/** Para qué es el piso alto: cuartos de la posada, la torre del mago, una casa. */
export type FloorUse = 'inn' | 'mage' | 'home';

/** Las paredes del edificio (las mismas de la planta baja). */
export interface FloorWalls {
  readonly x: StaticKind;
  readonly y: StaticKind;
  readonly corner: StaticKind;
  readonly post: StaticKind;
  readonly windowX?: StaticKind;
  readonly windowY?: StaticKind;
}

/**
 * Una subida: la escalera de la planta baja de un edificio que tiene pisos
 * altos. Los pisos quedan en otro lugar del mapa (como las criptas), del
 * mismo tamaño que la planta baja y unidos por escaleras.
 */
export interface Ascent {
  readonly town: string;
  /** Cómo se llama el edificio ("la posada", "la torre del mago"). */
  readonly building: string;
  readonly use: FloorUse;
  /** La escalera de la planta baja (y la que se repite arriba). */
  readonly stairs: StaticKind;
  /** Dónde está la escalera, en coordenadas del mapa. */
  readonly position: Position;
  /** Dónde se aparece al bajar (al lado de la escalera). */
  readonly back: Position;
  /** El piso de adentro de la planta baja (tamaño) y dónde queda la escalera en él. */
  readonly width: number;
  readonly height: number;
  readonly offset: Position;
  readonly walls: FloorWalls;
  readonly floor: Terrain;
  /** Cuántos pisos tiene arriba de la planta baja. */
  readonly floors: number;
}

/** Un piso alto armado: el plano, la bajada y (si hay otro arriba) la escalera que sigue. */
export interface UpperFloor {
  readonly name: string;
  readonly level: number;
  readonly width: number;
  readonly height: number;
  readonly terrain: readonly Terrain[];
  readonly statics: readonly StaticPlacement[];
  /** La bajada al piso de abajo y dónde se aparece al subir (al lado). */
  readonly down: Position;
  readonly arrival: Position;
  /** La escalera al piso de arriba y dónde se aparece al volver de él. */
  readonly up: Position | null;
  readonly upBack: Position | null;
}

const ORDINALS = ['primer', 'segundo', 'tercer', 'cuarto'];

/** Margen de roca alrededor (se ve negro, como el vacío) más la fila de las paredes. */
const MARGIN = 2;

/** Arma los pisos altos de un edificio, de abajo hacia arriba. */
export function generateFloors(ascent: Ascent, seed: number): UpperFloor[] {
  const random = new SeededRandom(seed);
  const floors: UpperFloor[] = [];
  // La bajada de cada piso queda justo arriba de la escalera del piso de abajo.
  let below = ascent.offset;
  for (let level = 1; level <= ascent.floors; level++) {
    const floor = buildFloor(ascent, level, below, random);
    floors.push(floor);
    if (floor.up) below = { x: floor.up.x - MARGIN, y: floor.up.y - MARGIN };
  }
  return floors;
}

function buildFloor(
  ascent: Ascent,
  level: number,
  holeAt: Position,
  random: SeededRandom,
): UpperFloor {
  const { width: w, height: h, walls } = ascent;
  const width = w + MARGIN * 2;
  const height = h + MARGIN * 2;
  const terrain = new Array<Terrain>(width * height).fill(Terrain.Rock);
  const statics: StaticPlacement[] = [];
  const taken = new Set<string>();
  const inside = (x: number, y: number): boolean =>
    x >= MARGIN && y >= MARGIN && x < MARGIN + w && y < MARGIN + h;
  const put = (x: number, y: number, kind: StaticKind): boolean => {
    if (!inside(x, y) || taken.has(`${x},${y}`)) return false;
    taken.add(`${x},${y}`);
    statics.push({ kind, x, y });
    return true;
  };
  for (let y = MARGIN; y < MARGIN + h; y++)
    for (let x = MARGIN; x < MARGIN + w; x++) terrain[y * width + x] = ascent.floor;
  // Paredes en el borde de atrás de cada tile, como en la planta baja.
  const x0 = MARGIN - 1;
  const y0 = MARGIN - 1;
  const x1 = MARGIN + w;
  const y1 = MARGIN + h;
  statics.push({ kind: walls.corner, x: x0, y: y0 });
  for (let x = x0 + 1; x < x1; x++) statics.push({ kind: walls.x, x, y: y0 });
  for (let y = y0 + 1; y < y1; y++) statics.push({ kind: walls.y, x: x0, y });
  for (let y = y0; y < y1; y++)
    statics.push({ kind: (y - y0) % 3 === 2 && walls.windowY ? walls.windowY : walls.y, x: x1, y });
  for (let x = x0; x < x1; x++)
    statics.push({ kind: (x - x0) % 3 === 2 && walls.windowX ? walls.windowX : walls.x, x, y: y1 });
  statics.push({ kind: walls.post, x: x1, y: y1 });
  // Las paredes tapan; su suelo es el del piso (así no se ve la roca debajo).
  for (const s of statics) terrain[s.y * width + s.x] = ascent.floor;

  const down = { x: MARGIN + holeAt.x, y: MARGIN + holeAt.y };
  put(down.x, down.y, 'stair-hole');
  const arrival = beside(down, inside, taken) ?? down;
  taken.add(`${arrival.x},${arrival.y}`);

  // La escalera que sigue, en la punta más lejana del piso.
  let up: Position | null = null;
  let upBack: Position | null = null;
  if (level < ascent.floors) {
    const corners = [
      { x: MARGIN, y: MARGIN },
      { x: MARGIN + w - 1, y: MARGIN },
      { x: MARGIN, y: MARGIN + h - 1 },
      { x: MARGIN + w - 1, y: MARGIN + h - 1 },
    ].sort(
      (a, b) =>
        Math.abs(b.x - down.x) +
        Math.abs(b.y - down.y) -
        Math.abs(a.x - down.x) -
        Math.abs(a.y - down.y),
    );
    for (const corner of corners) {
      if (!put(corner.x, corner.y, ascent.stairs)) continue;
      const back = beside(corner, inside, taken);
      if (!back) continue;
      up = corner;
      upBack = back;
      taken.add(`${back.x},${back.y}`);
      break;
    }
  }
  furnish(ascent.use, level === ascent.floors, put, w, h, random);
  const name = `${ascent.town}: ${ascent.building}, ${ORDINALS[level - 1] ?? `${level}.º`} piso`;
  return { name, level, width, height, terrain, statics, down, arrival, up, upBack };
}

/** Un tile libre pegado (para aparecer al lado de una escalera). */
function beside(
  at: Position,
  inside: (x: number, y: number) => boolean,
  taken: ReadonlySet<string>,
): Position | null {
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    const x = at.x + dx;
    const y = at.y + dy;
    if (inside(x, y) && !taken.has(`${x},${y}`)) return { x, y };
  }
  return null;
}

/** Los muebles de cada piso, contra las paredes (el centro queda libre para pasar). */
function furnish(
  use: FloorUse,
  top: boolean,
  put: (x: number, y: number, kind: StaticKind) => boolean,
  w: number,
  h: number,
  random: SeededRandom,
): void {
  const left = MARGIN;
  const right = MARGIN + w - 1;
  const north = MARGIN;
  const south = MARGIN + h - 1;
  const midX = MARGIN + Math.floor(w / 2);
  const midY = MARGIN + Math.floor(h / 2);
  switch (use) {
    case 'inn':
      // Cuartos para los viajeros: camas en hilera con un baúl al pie.
      for (let x = left; x <= right; x += 2) {
        if (put(x, north, 'bed') && x + 1 <= right) put(x + 1, north, 'chest');
      }
      put(left, south, 'table');
      put(left + 1, south, 'chair-w');
      put(right, south, 'candelabra');
      put(right, midY, 'barrel');
      break;
    case 'mage':
      if (top) {
        // Lo más alto de la torre: el observatorio del mago.
        put(midX, midY, 'carpet');
        put(left, north, 'candelabra');
        put(right, north, 'bookshelf-x');
        put(left, south, 'chest');
        put(right, south, 'alchemy-table');
      } else {
        for (let x = left; x <= right; x++) put(x, north, x % 2 ? 'bookshelf-x' : 'potion-shelf-x');
        put(left, south, 'alchemy-table');
        put(right, south, 'cauldron');
        put(midX, south, 'candelabra');
      }
      break;
    case 'home':
      put(left, north, 'bed');
      put(left + 1, north, random.next() < 0.5 ? 'chest' : 'crate');
      put(right, south, random.next() < 0.5 ? 'barrel' : 'keg');
      put(right, north, 'candelabra');
      if (random.next() < 0.5) put(left, south, 'bookshelf-x');
      break;
  }
}
