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
 * Genera una cueva: cavernas de forma irregular unidas en cadena por
 * pasillos que serpentean, de modo que para llegar al fondo hay que
 * atravesarlas todas. La roca que toca el suelo se vuelve pared; el resto
 * queda maciza y no se dibuja. Las puertas van en los pasillos, donde
 * salen de cada caverna, y los adornos nunca cierran un paso.
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
  const inside = (x: number, y: number): boolean =>
    x > 1 && y > 1 && x < width - 2 && y < height - 2;
  const floor = (x: number, y: number): boolean => terrain[y * width + x] === Terrain.Cave;
  const dig = (x: number, y: number): void => {
    if (inside(x, y)) terrain[y * width + x] = Terrain.Cave;
  };

  // Cavernas en una grilla de celdas recorrida en serpentina: la cadena baja
  // de una punta a la otra de la cueva y la última es la más grande.
  const columns = 3;
  const rows = Math.ceil(rooms / columns);
  const cellW = Math.floor((width - 4) / columns);
  const cellH = Math.floor((height - 4) / rows);
  const placed: DungeonRoom[] = [];
  /** Los tiles de cada caverna (para saber dónde termina y empieza el pasillo). */
  const caverns: Set<number>[] = [];
  for (let depth = 0; depth < rooms; depth++) {
    const row = Math.floor(depth / columns);
    const col = row % 2 === 0 ? depth % columns : columns - 1 - (depth % columns);
    const last = depth === rooms - 1;
    const w = Math.min(cellW - 3, last ? cellW - 3 : int(7, Math.min(13, cellW - 3)));
    const h = Math.min(cellH - 3, last ? cellH - 3 : int(7, Math.min(12, cellH - 3)));
    const x = 2 + col * cellW + int(1, Math.max(1, cellW - w - 2));
    const y = 2 + row * cellH + int(1, Math.max(1, cellH - h - 2));
    const room = { x, y, width: w, height: h, depth };
    placed.push(room);
    caverns.push(cavern(room));
  }

  const centerOf = (r: DungeonRoom): Position => ({
    x: r.x + Math.floor(r.width / 2),
    y: r.y + Math.floor(r.height / 2),
  });
  const paths: Step[][] = [];
  for (let i = 1; i < placed.length; i++) {
    const from = placed[i - 1];
    const to = placed[i];
    if (from && to) paths.push(corridor(centerOf(from), centerOf(to)));
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

  // Puertas dobles donde cada pasillo sale de una caverna y donde entra a la
  // siguiente; la guarida del fondo tiene puertas de huesos.
  const doorTiles: Position[] = [];
  paths.forEach((path, i) => {
    // La de huesos primero: si el pasillo es corto, la que queda es esa.
    if (i + 1 === placed.length - 1) door([...path].reverse(), caverns[i + 1], 'bone-door');
    door(path, caverns[i], 'dungeon-door');
    if (i + 1 < placed.length - 1) door([...path].reverse(), caverns[i + 1], 'dungeon-door');
  });

  // La escalera, contra la pared de atrás de la primera caverna, sobre la
  // columna del centro.
  const first = placed[0] as DungeonRoom;
  const start = centerOf(first);
  let ladder = start;
  while (floor(ladder.x, ladder.y - 1) && floor(ladder.x + 1, ladder.y - 1))
    ladder = { x: ladder.x, y: ladder.y - 1 };
  put('ladder', ladder.x, ladder.y);
  // Dos pasos adelante: si se sigue caminando no se vuelve a pisar la escalera.
  const arrival = { x: ladder.x + 1, y: ladder.y + 2 };
  dig(arrival.x, arrival.y);
  dig(arrival.x, arrival.y - 1);

  /** Lugares que tienen que quedar libres: frente a las puertas, la llegada y el centro de cada caverna. */
  const keepClear = (x: number, y: number): boolean =>
    doorTiles.some((d) => Math.max(Math.abs(d.x - x), Math.abs(d.y - y)) <= 2) ||
    Math.max(Math.abs(arrival.x - x), Math.abs(arrival.y - y)) <= 1 ||
    placed.some((r) => {
      const c = centerOf(r);
      return Math.max(Math.abs(c.x - x), Math.abs(c.y - y)) <= 1;
    });
  /** Un adorno que bloquea va solo si no cierra ningún paso (todo sigue unido). */
  const decorate = (kind: StaticPlacement['kind'], x: number, y: number): boolean => {
    if (!floor(x, y) || blocked.has(`${x},${y}`) || keepClear(x, y)) return false;
    blocked.add(`${x},${y}`);
    if (!connected()) {
      blocked.delete(`${x},${y}`);
      return false;
    }
    statics.push({ kind, x, y });
    return true;
  };

  placed.forEach((room, i) => {
    const tiles = [...(caverns[i] ?? [])].map((t) => ({ x: t % width, y: Math.floor(t / width) }));
    // Braseros contra la pared (las cavernas tienen luz, los pasillos no),
    // repartidos alrededor del centro.
    const center = centerOf(room);
    const own = caverns[i] ?? new Set<number>();
    // Junto a la pared y lejos de la boca de los pasillos (suelo que no es de la caverna).
    const mouth = (t: Position): boolean => {
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          if (floor(t.x + dx, t.y + dy) && !own.has((t.y + dy) * width + t.x + dx)) return true;
      return false;
    };
    const rim = tiles.filter(
      (t) =>
        (!floor(t.x - 1, t.y) ||
          !floor(t.x + 1, t.y) ||
          !floor(t.x, t.y - 1) ||
          !floor(t.x, t.y + 1)) &&
        !mouth(t),
    );
    const angle = (t: Position): number => Math.atan2(t.y - center.y, t.x - center.x);
    const braziers = 3 + (room.width * room.height > 120 ? 1 : 0);
    const turn = random.next() * Math.PI * 2;
    for (let b = 0; b < braziers; b++) {
      const want = turn + (b / braziers) * Math.PI * 2;
      const gap = (t: Position): number =>
        Math.abs(Math.atan2(Math.sin(angle(t) - want), Math.cos(angle(t) - want)));
      for (const t of [...rim].sort((a, c) => gap(a) - gap(c)).slice(0, 12))
        if (decorate('brazier', t.x, t.y)) break;
    }
    // Huesos (no bloquean) y estalagmitas sueltas.
    const extras = 2 + Math.floor(tiles.length / 30);
    for (let e = 0; e < extras; e++) {
      const t = tiles[int(0, tiles.length - 1)];
      if (!t) continue;
      if (random.next() < 0.55) {
        if (!blocked.has(`${t.x},${t.y}`) && !keepClear(t.x, t.y)) {
          statics.push({ kind: 'bones', x: t.x, y: t.y });
          blocked.add(`${t.x},${t.y}`);
        }
      } else decorate('stalagmite', t.x, t.y);
    }
  });

  return { width, height, terrain, statics, rooms: placed, ladder, arrival };

  /**
   * Una caverna de forma irregular dentro del rectángulo de la sala: una
   * elipse con el borde ondulado y algún lóbulo, suavizada para que no
   * queden puntas sueltas.
   */
  function cavern(room: DungeonRoom): Set<number> {
    const cx = room.x + (room.width - 1) / 2;
    const cy = room.y + (room.height - 1) / 2;
    const rx = room.width / 2;
    const ry = room.height / 2;
    const waves = [int(2, 3), int(4, 6)];
    const phases = [random.next() * 6.3, random.next() * 6.3];
    const lobes = Array.from({ length: int(1, 2) }, () => {
      const a = random.next() * Math.PI * 2;
      return {
        x: cx + Math.cos(a) * rx * 0.55,
        y: cy + Math.sin(a) * ry * 0.55,
        r: 0.45 + random.next() * 0.15,
      };
    });
    const solid = (x: number, y: number): boolean => {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const a = Math.atan2(dy, dx);
      const edge =
        0.82 +
        0.1 * Math.sin(a * (waves[0] ?? 2) + (phases[0] ?? 0)) +
        0.06 * Math.sin(a * (waves[1] ?? 5) + (phases[1] ?? 0));
      if (Math.hypot(dx, dy) < edge) return true;
      return lobes.some((l) => Math.hypot((x - l.x) / rx, (y - l.y) / ry) < l.r);
    };
    let cells = new Set<number>();
    for (let y = room.y; y < room.y + room.height; y++)
      for (let x = room.x; x < room.x + room.width; x++)
        if (inside(x, y) && solid(x, y)) cells.add(y * width + x);
    // Suavizado: un tile queda si tiene suelo en la mayoría de sus vecinos.
    for (let pass = 0; pass < 2; pass++) {
      const next = new Set<number>();
      for (let y = room.y; y < room.y + room.height; y++)
        for (let x = room.x; x < room.x + room.width; x++) {
          let around = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if ((dx || dy) && cells.has((y + dy) * width + x + dx)) around++;
          const was = cells.has(y * width + x);
          if (inside(x, y) && (around >= 5 || (was && around >= 4))) next.add(y * width + x);
        }
      cells = next;
    }
    // Solo lo unido al centro (sin islas sueltas).
    const center = Math.round(cy) * width + Math.round(cx);
    cells.add(center);
    const kept = new Set<number>([center]);
    const queue = [center];
    while (queue.length) {
      const c = queue.pop() as number;
      for (const n of [c - 1, c + 1, c - width, c + width])
        if (cells.has(n) && !kept.has(n)) {
          kept.add(n);
          queue.push(n);
        }
    }
    for (const c of kept) dig(c % width, Math.floor(c / width));
    return kept;
  }

  /**
   * Pasillo de dos tiles de ancho entre dos centros, pasando por uno o dos
   * puntos intermedios al azar: serpentea en vez de ir en línea recta.
   */
  function corridor(a: Position, b: Position): Step[] {
    const points = [a];
    const turns = int(1, 2);
    for (let t = 1; t <= turns; t++) {
      const f = t / (turns + 1);
      points.push({
        x: Math.max(3, Math.min(width - 5, Math.round(a.x + (b.x - a.x) * f + int(-5, 5)))),
        y: Math.max(3, Math.min(height - 5, Math.round(a.y + (b.y - a.y) * f + int(-5, 5)))),
      });
    }
    points.push(b);
    const steps: Step[] = [];
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1] as Position;
      const to = points[i] as Position;
      const mid = random.next() < 0.5 ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
      line(from, mid, steps);
      line(mid, to, steps);
    }
    return steps;
  }

  function line(a: Position, b: Position, steps: Step[]): void {
    let { x, y } = a;
    for (;;) {
      dig(x, y);
      dig(x + 1, y);
      dig(x, y + 1);
      dig(x + 1, y + 1);
      if (x === b.x && y === b.y) return;
      if (x !== b.x) x += Math.sign(b.x - x);
      else y += Math.sign(b.y - y);
      steps.push({ x, y, along: a.x !== b.x ? 'x' : 'y' });
    }
  }

  /**
   * Una puerta doble en el primer tramo recto del pasillo que sale de la
   * caverna: atraviesa el pasillo de pared a pared (si a los costados no hay
   * roca, se prueba más adelante).
   */
  function door(
    path: readonly Step[],
    cavernTiles: Set<number> | undefined,
    style: 'dungeon-door' | 'bone-door',
  ): void {
    const near = (x: number, y: number): boolean => {
      for (let dy = -1; dy <= 2; dy++)
        for (let dx = -1; dx <= 2; dx++)
          if (cavernTiles?.has((y + dy) * width + x + dx)) return true;
      return false;
    };
    for (let i = 2; i < path.length - 2; i++) {
      const step = path[i] as Step;
      const before = path[i - 2] as Step;
      const after = path[i + 2] as Step;
      if (near(step.x, step.y)) continue;
      // En un pasillo corto no van dos puertas casi pegadas.
      if (doorTiles.some((d) => Math.abs(d.x - step.x) + Math.abs(d.y - step.y) < 6)) return;
      if (before.along !== step.along || after.along !== step.along) continue;
      // Caminando en x la puerta cruza en y (y al revés).
      const across = step.along === 'x' ? 'y' : 'x';
      const l = { x: step.x, y: step.y };
      const r = across === 'y' ? { x: step.x, y: step.y + 1 } : { x: step.x + 1, y: step.y };
      const sideA = across === 'y' ? { x: step.x, y: step.y - 1 } : { x: step.x - 1, y: step.y };
      const sideB = across === 'y' ? { x: step.x, y: step.y + 2 } : { x: step.x + 2, y: step.y };
      // Delante y detrás de la puerta, pasillo libre.
      const ahead =
        across === 'y'
          ? [
              { x: step.x - 1, y: step.y },
              { x: step.x + 1, y: step.y },
            ]
          : [
              { x: step.x, y: step.y - 1 },
              { x: step.x, y: step.y + 1 },
            ];
      const ok =
        floor(l.x, l.y) &&
        floor(r.x, r.y) &&
        !floor(sideA.x, sideA.y) &&
        !floor(sideB.x, sideB.y) &&
        ahead.every((t) => floor(t.x, t.y)) &&
        !blocked.has(`${l.x},${l.y}`) &&
        !blocked.has(`${r.x},${r.y}`);
      if (!ok) continue;
      put(`${style}-${across}-l`, l.x, l.y);
      put(`${style}-${across}-r`, r.x, r.y);
      doorTiles.push(l, r);
      return;
    }
  }

  /** Si todo el suelo libre sigue unido (con las puertas abiertas). */
  function connected(): boolean {
    let total = 0;
    let startAt = -1;
    for (let i = 0; i < terrain.length; i++)
      if (terrain[i] === Terrain.Cave && !solidAt(i)) {
        total++;
        if (startAt < 0) startAt = i;
      }
    if (startAt < 0) return true;
    const seen = new Uint8Array(terrain.length);
    seen[startAt] = 1;
    const queue = [startAt];
    let count = 1;
    while (queue.length) {
      const c = queue.pop() as number;
      for (const n of [c - 1, c + 1, c - width, c + width])
        if (!seen[n] && terrain[n] === Terrain.Cave && !solidAt(n)) {
          seen[n] = 1;
          count++;
          queue.push(n);
        }
    }
    return count === total;
  }

  function solidAt(i: number): boolean {
    const x = i % width;
    const y = Math.floor(i / width);
    const key = `${x},${y}`;
    if (!blocked.has(key)) return false;
    // Las puertas cuentan como abiertas; la escalera y los huesos no tapan.
    return !doorTiles.some((d) => d.x === x && d.y === y) && !ladderAt(x, y) && !bonesAt(key);
  }

  function ladderAt(x: number, y: number): boolean {
    return statics.some((s) => s.kind === 'ladder' && s.x === x && s.y === y);
  }

  function bonesAt(key: string): boolean {
    return statics.some((s) => s.kind === 'bones' && `${s.x},${s.y}` === key);
  }
}

interface Step {
  readonly x: number;
  readonly y: number;
  /** Hacia dónde avanza el pasillo en este paso. */
  readonly along: 'x' | 'y';
}
