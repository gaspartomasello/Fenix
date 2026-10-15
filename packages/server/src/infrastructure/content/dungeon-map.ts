import { Terrain, type Position, type StaticPlacement } from '@fenix/shared';
import { SeededRandom } from '../system/seeded-random';

/** Una sala de la mazmorra; `depth` crece a medida que se baja (0 = la entrada). */
export interface DungeonRoom {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

export interface GeneratedDungeon {
  readonly width: number;
  readonly height: number;
  /** Terreno fila por fila: suelo de cueva o roca maciza. */
  readonly terrain: readonly Terrain[];
  readonly statics: readonly StaticPlacement[];
  /** Salas en orden de profundidad: la primera tiene la escalera, la última al jefe. */
  readonly rooms: readonly DungeonRoom[];
  /** Tile de la escalera que lleva de vuelta a la superficie. */
  readonly ladder: Position;
  /** Dónde aparece quien entra (a dos pasos de la escalera). */
  readonly arrival: Position;
}

export interface DungeonOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly rooms?: number;
}

/**
 * Genera una cueva: salas unidas en cadena por pasillos que serpentean,
 * de modo que para llegar al fondo hay que atravesarlas todas. La roca que
 * toca el suelo se vuelve pared; el resto queda maciza y no se dibuja.
 */
export function generateDungeon({
  width,
  height,
  seed,
  rooms = 9,
}: DungeonOptions): GeneratedDungeon {
  const random = new SeededRandom(seed);
  const int = (min: number, max: number): number =>
    min + Math.floor(random.next() * (max - min + 1));
  const terrain = new Array<Terrain>(width * height).fill(Terrain.Rock);
  const floor = (x: number, y: number): boolean => terrain[y * width + x] === Terrain.Cave;
  const dig = (x: number, y: number): void => {
    if (x > 1 && y > 1 && x < width - 2 && y < height - 2) terrain[y * width + x] = Terrain.Cave;
  };

  // Salas en una grilla de celdas recorrida en serpentina: la cadena baja
  // de una punta a la otra de la cueva y la última sala es la más grande.
  const columns = 3;
  const rows = Math.ceil(rooms / columns);
  const cellW = Math.floor((width - 4) / columns);
  const cellH = Math.floor((height - 4) / rows);
  const placed: DungeonRoom[] = [];
  for (let depth = 0; depth < rooms; depth++) {
    const row = Math.floor(depth / columns);
    const col = row % 2 === 0 ? depth % columns : columns - 1 - (depth % columns);
    const last = depth === rooms - 1;
    const w = Math.min(cellW - 3, last ? cellW - 3 : int(6, Math.min(11, cellW - 3)));
    const h = Math.min(cellH - 3, last ? cellH - 3 : int(6, Math.min(10, cellH - 3)));
    const x = 2 + col * cellW + int(1, Math.max(1, cellW - w - 2));
    const y = 2 + row * cellH + int(1, Math.max(1, cellH - h - 2));
    placed.push({ x, y, width: w, height: h, depth });
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) dig(tx, ty);
  }

  const centerOf = (r: DungeonRoom): Position => ({
    x: r.x + Math.floor(r.width / 2),
    y: r.y + Math.floor(r.height / 2),
  });
  for (let i = 1; i < placed.length; i++) {
    const from = placed[i - 1];
    const to = placed[i];
    if (from && to) corridor(centerOf(from), centerOf(to));
  }

  const statics: StaticPlacement[] = [];
  const blocked = new Set<string>();
  const put = (kind: StaticPlacement['kind'], x: number, y: number): void => {
    statics.push({ kind, x, y });
    blocked.add(`${x},${y}`);
  };

  // Paredes: la roca que toca el suelo (también en diagonal).
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (floor(x, y)) continue;
      const touches = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => floor(x + dx, y + dy)));
      if (touches) put('cave-wall', x, y);
    }
  }

  // La escalera, en la pared de atrás de la primera sala.
  const first = placed[0] as DungeonRoom;
  const ladder = { x: first.x + 1, y: first.y };
  put('ladder', ladder.x, ladder.y);
  // Dos pasos adelante: si se sigue caminando no se vuelve a pisar la escalera.
  const arrival = { x: ladder.x + 1, y: ladder.y + 2 };

  for (const room of placed) {
    // Braseros en las esquinas: las salas tienen luz, los pasillos no.
    put('brazier', room.x, room.y);
    put('brazier', room.x + room.width - 1, room.y + room.height - 1);
    put('brazier', room.x, room.y + room.height - 1);
    put('brazier', room.x + room.width - 1, room.y);
    // Huesos y estalagmitas lejos de los bordes, así nunca cierran un paso.
    const extras = 2 + Math.floor((room.width * room.height) / 30);
    for (let i = 0; i < extras; i++) {
      const x = int(room.x + 2, room.x + room.width - 3);
      const y = int(room.y + 2, room.y + room.height - 3);
      const key = `${x},${y}`;
      if (blocked.has(key) || (x === arrival.x && y === arrival.y)) continue;
      const kind = random.next() < 0.55 ? 'bones' : 'stalagmite';
      // Los pasillos cruzan por el centro de la sala: ahí no van estalagmitas.
      const center = centerOf(room);
      const onPath = (d: number): boolean => d >= -1 && d <= 2;
      if (kind === 'stalagmite' && (onPath(x - center.x) || onPath(y - center.y))) continue;
      put(kind, x, y);
    }
  }

  return { width, height, terrain, statics, rooms: placed, ladder, arrival };

  /** Pasillo de dos tiles de ancho, en codo, con algún desvío. */
  function corridor(a: Position, b: Position): void {
    const bend = random.next() < 0.5;
    const mid = bend ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    line(a, mid);
    line(mid, b);
  }

  function line(a: Position, b: Position): void {
    let { x, y } = a;
    for (;;) {
      dig(x, y);
      dig(x + 1, y);
      dig(x, y + 1);
      if (x === b.x && y === b.y) return;
      if (x !== b.x) x += Math.sign(b.x - x);
      else y += Math.sign(b.y - y);
    }
  }
}
