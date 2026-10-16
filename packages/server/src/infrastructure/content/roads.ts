import type { Position } from '@fenix/shared';

/**
 * Camino más barato entre dos tiles (A* en 4 direcciones). `cost` da lo que
 * cuesta pisar cada tile (Infinity = no se puede); así los caminos rodean
 * montañas y pantanos y cruzan los ríos por lo más angosto. `turn` es lo que
 * cuesta doblar: con un valor alto salen tramos largos y rectos, como los de
 * un camino trazado, en vez de una escalera.
 */
export function cheapestPath(
  width: number,
  height: number,
  from: Position,
  to: Position,
  cost: (x: number, y: number) => number,
  turn = 0,
): Position[] | null {
  // En un mapa grande se busca primero en una ventana alrededor de los dos
  // extremos (mucha menos memoria); si no hay camino ahí, en el mapa entero.
  const margin = 160;
  const x0 = Math.max(0, Math.min(from.x, to.x) - margin);
  const y0 = Math.max(0, Math.min(from.y, to.y) - margin);
  const x1 = Math.min(width - 1, Math.max(from.x, to.x) + margin);
  const y1 = Math.min(height - 1, Math.max(from.y, to.y) + margin);
  const windowed = x0 > 0 || y0 > 0 || x1 < width - 1 || y1 < height - 1;
  if (windowed) {
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const path = search(
      w,
      h,
      { x: from.x - x0, y: from.y - y0 },
      { x: to.x - x0, y: to.y - y0 },
      (x, y) => cost(x + x0, y + y0),
      turn,
    );
    if (path) return path.map((p) => ({ x: p.x + x0, y: p.y + y0 }));
  }
  return search(width, height, from, to, cost, turn);
}

function search(
  width: number,
  height: number,
  from: Position,
  to: Position,
  cost: (x: number, y: number) => number,
  turn: number,
): Position[] | null {
  // Cada estado es un tile más la dirección con la que se llegó (4 = ninguna, al salir).
  const total = width * height * 5;
  const best = new Float64Array(total).fill(Infinity);
  const came = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const start = (from.y * width + from.x) * 5 + 4;
  const goalTile = to.y * width + to.x;
  const heap = new MinHeap();
  best[start] = 0;
  heap.push(start, heuristic(from, to));
  let reached = -1;
  while (heap.size > 0) {
    const current = heap.pop();
    const tile = Math.floor(current / 5);
    if (tile === goalTile) {
      reached = current;
      break;
    }
    if (closed[current]) continue;
    closed[current] = 1;
    const dir = current % 5;
    const cx = tile % width;
    const cy = (tile - cx) / width;
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = STEPS[d] ?? [0, 0];
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = (ny * width + nx) * 5 + d;
      if (closed[next]) continue;
      const step = cost(nx, ny);
      if (!Number.isFinite(step)) continue;
      const g = (best[current] ?? Infinity) + step + (dir !== 4 && dir !== d ? turn : 0);
      if (g >= (best[next] ?? Infinity)) continue;
      best[next] = g;
      came[next] = current;
      heap.push(next, g + heuristic({ x: nx, y: ny }, to));
    }
  }
  if (reached === -1) return from.x === to.x && from.y === to.y ? [from] : null;
  const path: Position[] = [];
  for (let at = reached; at !== -1; at = came[at] ?? -1) {
    const tile = Math.floor(at / 5);
    path.push({ x: tile % width, y: Math.floor(tile / width) });
  }
  return path.reverse();
}

const STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Distancia de Manhattan: nunca sobrestima (el tile más barato cuesta 1). */
function heuristic(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Cola de prioridad mínima sobre índices de tiles. */
class MinHeap {
  private readonly items: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, key: number): void {
    this.items.push(item);
    this.keys.push(key);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((this.keys[parent] ?? 0) <= key) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.items[0] ?? -1;
    const lastItem = this.items.pop() ?? -1;
    const lastKey = this.keys.pop() ?? 0;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.items.length && (this.keys[left] ?? 0) < (this.keys[smallest] ?? 0))
          smallest = left;
        if (right < this.items.length && (this.keys[right] ?? 0) < (this.keys[smallest] ?? 0))
          smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const item = this.items[a] ?? 0;
    const key = this.keys[a] ?? 0;
    this.items[a] = this.items[b] ?? 0;
    this.keys[a] = this.keys[b] ?? 0;
    this.items[b] = item;
    this.keys[b] = key;
  }
}

/**
 * Suaviza un camino trazado: lo recorre por puntos cada `spacing` tiles,
 * corridos al costado un poco al azar (hasta `sway` tiles), y une esos puntos
 * con una curva (Catmull-Rom). Así el camino serpentea en vez de ir en
 * escuadras rectas. Si un tramo de la curva pisa algo prohibido o muy caro
 * (`cost` ≥ `limit`: mar, montaña) ese tramo queda como estaba.
 */
export function curvePath(
  path: readonly Position[],
  cost: (x: number, y: number) => number,
  seed: number,
  spacing = 14,
  sway = 4,
  limit = 25,
): Position[] {
  if (path.length < spacing * 2) return [...path];
  const keys: number[] = [];
  for (let i = 0; i < path.length - spacing / 2; i += spacing) keys.push(i);
  keys.push(path.length - 1);
  const points = keys.map((k, n) => {
    const p = path[k] ?? { x: 0, y: 0 };
    if (n === 0 || n === keys.length - 1) return { x: p.x, y: p.y };
    const before = path[Math.max(0, k - spacing)] ?? p;
    const after = path[Math.min(path.length - 1, k + spacing)] ?? p;
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    const offset = (mix(seed, p.x, p.y) - 0.5) * 2 * sway;
    return { x: p.x - (dy / length) * offset, y: p.y + (dx / length) * offset };
  });
  const out: Position[] = [];
  const append = (p: Position): void => {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) return;
    // Siempre de a un paso en 4 direcciones: el camino no queda cortado en diagonal.
    if (last) {
      let { x, y } = last;
      while (Math.abs(p.x - x) + Math.abs(p.y - y) > 1) {
        if (Math.abs(p.x - x) >= Math.abs(p.y - y)) x += Math.sign(p.x - x);
        else y += Math.sign(p.y - y);
        out.push({ x, y });
      }
    }
    out.push({ x: p.x, y: p.y });
  };
  for (let n = 0; n + 1 < points.length; n++) {
    const p0 = points[Math.max(0, n - 1)] ?? { x: 0, y: 0 };
    const p1 = points[n] ?? p0;
    const p2 = points[n + 1] ?? p1;
    const p3 = points[Math.min(points.length - 1, n + 2)] ?? p2;
    const steps = Math.max(4, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) * 3));
    const segment: Position[] = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      segment.push({
        x: Math.round(catmullRom(p0.x, p1.x, p2.x, p3.x, t)),
        y: Math.round(catmullRom(p0.y, p1.y, p2.y, p3.y, t)),
      });
    }
    const blocked = segment.some((p) => !(cost(p.x, p.y) < limit));
    const piece = blocked ? path.slice(keys[n], (keys[n + 1] ?? path.length - 1) + 1) : segment;
    for (const p of piece) append(p);
  }
  return out;
}

function catmullRom(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3)
  );
}

function mix(seed: number, x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed + 3, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
