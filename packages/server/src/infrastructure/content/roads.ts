import type { Position } from '@fenix/shared';

/**
 * Camino más barato entre dos tiles (A* en 4 direcciones). `cost` da lo que
 * cuesta pisar cada tile (Infinity = no se puede); así los caminos rodean
 * montañas y pantanos y cruzan los ríos por lo más angosto.
 */
export function cheapestPath(
  width: number,
  height: number,
  from: Position,
  to: Position,
  cost: (x: number, y: number) => number,
): Position[] | null {
  const total = width * height;
  const best = new Float64Array(total).fill(Infinity);
  const came = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const start = from.y * width + from.x;
  const goal = to.y * width + to.x;
  const heap = new MinHeap();
  best[start] = 0;
  heap.push(start, heuristic(from, to));
  while (heap.size > 0) {
    const current = heap.pop();
    if (current === goal) break;
    if (closed[current]) continue;
    closed[current] = 1;
    const cx = current % width;
    const cy = (current - cx) / width;
    for (const [dx, dy] of STEPS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (closed[next]) continue;
      const step = cost(nx, ny);
      if (!Number.isFinite(step)) continue;
      const g = (best[current] ?? Infinity) + step;
      if (g >= (best[next] ?? Infinity)) continue;
      best[next] = g;
      came[next] = current;
      heap.push(next, g + heuristic({ x: nx, y: ny }, to));
    }
  }
  if (start !== goal && came[goal] === -1) return null;
  const path: Position[] = [];
  for (let at = goal; at !== -1; at = at === start ? -1 : (came[at] ?? -1)) {
    path.push({ x: at % width, y: Math.floor(at / width) });
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
