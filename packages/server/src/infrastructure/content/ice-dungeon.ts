import type { CreatureKind } from '@fenix/shared/creatures/creature-catalog';
import type { Position } from '@fenix/shared/geometry/position';
import { Terrain } from '@fenix/shared/world/terrain';
import { SeededRandom } from '../system/seeded-random';
import { Grid, type Passage, type Underground } from './underground';

export const ICE_DUNGEON_NAME = 'Calabozo de Hielo';

/** El calabozo de hielo y sus dos salas especiales, a las que se baja por escaleras de adentro. */
export interface IceDungeon {
  readonly caves: Underground;
  /** El trono del liche de escarcha y el santuario del dragón de hielo, en el orden de las escaleras. */
  readonly halls: readonly [Underground, Underground];
}

/** Quién vive en cada caverna, según qué tan hondo está (0 = la entrada). */
const DWELLERS: readonly { upTo: number; kinds: readonly CreatureKind[] }[] = [
  { upTo: 0.35, kinds: ['ice-spider', 'yeti', 'white-wolf', 'ice-spider'] },
  { upTo: 0.7, kinds: ['frost-troll', 'ice-spider', 'frost-mage', 'yeti'] },
  { upTo: 1, kinds: ['ice-elemental', 'frost-troll', 'frost-mage', 'ice-elemental'] },
];

const WIDTH = 100;
const HEIGHT = 76;

/**
 * El calabozo de hielo de las tierras heladas del norte: cavernas de nieve y
 * hielo unidas por túneles que serpentean (con más de un camino entre
 * ellas), un lago helado al oeste y un río subterráneo que lo cruza en
 * diagonal, con puentes de tablas donde lo atraviesan los túneles. Los
 * cristales de hielo alumbran las cavernas. En dos rincones, una escalera de
 * piedra baja a una sala especial: el trono del liche de escarcha y el
 * santuario del dragón de hielo, cada uno con su guardia.
 */
export function generateIceDungeon(seed: number): IceDungeon {
  const random = new SeededRandom(seed);
  const int = (min: number, max: number): number =>
    min + Math.floor(random.next() * (max - min + 1));
  const g = new Grid(WIDTH, HEIGHT);
  const at = (x: number, y: number): Terrain | undefined => g.terrain[y * WIDTH + x];
  const set = (x: number, y: number, t: Terrain): void => {
    if (x > 1 && y > 1 && x < WIDTH - 2 && y < HEIGHT - 2) g.terrain[y * WIDTH + x] = t;
  };

  // Cavernas en una grilla de 4 × 3 con jitter; la de la entrada, a la derecha abajo.
  const nodes: Position[] = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 4; col++)
      nodes.push({
        x: 12 + col * 25 + int(-4, 4),
        y: 12 + row * 25 + int(-4, 4),
      });
  const entrance = nodes[11] as Position;
  const cavern = (c: Position, rx: number, ry: number, ground: Terrain): void => {
    for (let y = c.y - ry - 1; y <= c.y + ry + 1; y++)
      for (let x = c.x - rx - 1; x <= c.x + rx + 1; x++) {
        const d = Math.hypot((x - c.x) / rx, (y - c.y) / ry) + (random.next() - 0.5) * 0.35;
        if (d <= 1) set(x, y, ground);
      }
  };
  nodes.forEach((c, i) =>
    cavern(c, int(5, 8), int(4, 6), i % 3 === 1 ? Terrain.Ice : Terrain.Snow),
  );

  // Túneles: un árbol que une todas las cavernas y tres atajos más (hay vueltas).
  const tunnels: Position[][] = [];
  const linked = new Set([11]);
  while (linked.size < nodes.length) {
    let best: [number, number, number] | null = null;
    for (const a of linked)
      for (let b = 0; b < nodes.length; b++) {
        if (linked.has(b)) continue;
        const na = nodes[a] as Position;
        const nb = nodes[b] as Position;
        const d = Math.hypot(na.x - nb.x, na.y - nb.y);
        if (!best || d < best[2]) best = [a, b, d];
      }
    if (!best) break;
    tunnels.push(tunnel(nodes[best[0]] as Position, nodes[best[1]] as Position));
    linked.add(best[1]);
  }
  for (const [a, b] of [
    [0, 5],
    [6, 11],
    [2, 7],
  ] as const)
    tunnels.push(tunnel(nodes[a] as Position, nodes[b] as Position));

  // El lago helado: la caverna del oeste del medio se agranda y se llena de agua honda.
  const lake = nodes[4] as Position;
  cavern(lake, 10, 7, Terrain.Ice);
  for (let y = lake.y - 5; y <= lake.y + 5; y++)
    for (let x = lake.x - 7; x <= lake.x + 7; x++)
      if (Math.hypot((x - lake.x) / 7, (y - lake.y) / 4.6) < 1) set(x, y, Terrain.Water);

  // El río: una franja de agua que baja en diagonal; donde cruza un túnel, un puente.
  const onTunnel = new Set(tunnels.flat().map((p) => `${p.x},${p.y}`));
  for (let t = 0; t <= 1; t += 0.004) {
    const cx = Math.round(30 + t * 62 + Math.sin(t * 9) * 3);
    const cy = Math.round(HEIGHT - 6 - t * (HEIGHT - 14));
    for (let k = -1; k <= 1; k++)
      for (const [x, y] of [
        [cx + k, cy],
        [cx, cy + k],
      ] as const) {
        if (at(x, y) === Terrain.Wood) continue;
        set(x, y, onTunnel.has(`${x},${y}`) ? Terrain.Wood : Terrain.Water);
      }
  }

  // La escalera de vuelta, contra la pared de arriba de la caverna de la entrada.
  let ladder = { ...entrance };
  while (g.floor(ladder.x, ladder.y - 1) && g.floor(ladder.x + 1, ladder.y - 1))
    ladder = { x: ladder.x, y: ladder.y - 1 };
  g.put('ladder', ladder.x, ladder.y);
  const arrival = { x: ladder.x + 1, y: ladder.y + 2 };
  set(arrival.x, arrival.y, Terrain.Snow);
  set(arrival.x, arrival.y - 1, Terrain.Snow);

  // Las dos escaleras que bajan a las salas especiales, al fondo de un recoveco de dos cavernas.
  const passages: Passage[] = [];
  for (const node of [nodes[0], nodes[8]] as Position[]) {
    let x = node.x;
    const y = node.y;
    while (g.floor(x - 1, y)) x--;
    for (let k = 1; k <= 4; k++) set(x - k, y, Terrain.Granite);
    const stair = { x: x - 4, y };
    g.put('stairs-stone', stair.x, stair.y);
    passages.push({ to: 'crypt', at: stair, arrival: { x: stair.x + 2, y: stair.y } });
  }

  // Lo que quedó suelto (cortado por el río o el lago), vuelve a ser roca.
  const reached = new Set<string>([`${arrival.x},${arrival.y}`]);
  const queue = [arrival];
  for (let p = queue.pop(); p; p = queue.pop())
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const n = { x: p.x + dx, y: p.y + dy };
      const key = `${n.x},${n.y}`;
      if (reached.has(key) || !g.floor(n.x, n.y)) continue;
      reached.add(key);
      queue.push(n);
    }
  for (let y = 0; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++)
      if (g.floor(x, y) && !reached.has(`${x},${y}`)) g.terrain[y * WIDTH + x] = Terrain.Rock;

  // Luz, adornos y quién vive en cada caverna.
  const deepest = Math.max(...nodes.map((n) => Math.hypot(n.x - entrance.x, n.y - entrance.y)));
  nodes.forEach((c, i) => {
    if (i === 4) {
      // El lago: cristales en la orilla y dos elementales.
      for (const [dx, dy] of [
        [-9, 0],
        [9, 0],
        [0, -6],
      ] as const)
        g.put('ice-crystal', c.x + dx, c.y + dy);
      g.live('ice-elemental', c.x + 8, c.y + 3);
      g.live('ice-elemental', c.x - 8, c.y - 3);
      return;
    }
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + random.next();
      const x = c.x + Math.round(Math.cos(a) * 4);
      const y = c.y + Math.round(Math.sin(a) * 3);
      // Nada que tape la llegada ni la escalera.
      if (Math.max(Math.abs(x - arrival.x), Math.abs(y - arrival.y)) <= 2) continue;
      if (Math.max(Math.abs(x - ladder.x), Math.abs(y - ladder.y)) <= 1) continue;
      g.put('ice-crystal', x, y);
    }
    if (i === 11) return;
    if (random.next() < 0.6) g.put('bones', c.x + int(-3, 3), c.y + int(-2, 2));
    const depth = Math.hypot(c.x - entrance.x, c.y - entrance.y) / deepest;
    const level = DWELLERS.find((d) => depth <= d.upTo) ?? DWELLERS[DWELLERS.length - 1];
    for (let k = 0; k < 3; k++) {
      const kind = level?.kinds[int(0, (level?.kinds.length ?? 1) - 1)] ?? 'ice-spider';
      g.live(kind, c.x + int(-3, 3), c.y + int(-2, 2));
    }
  });
  g.walls('ice-wall');

  const caves: Underground = {
    name: ICE_DUNGEON_NAME,
    width: WIDTH,
    height: HEIGHT,
    terrain: g.terrain,
    statics: g.statics,
    ladder,
    arrival,
    lairs: g.lairs,
    passages,
  };
  return { caves, halls: [frostThrone(), wyrmSanctum()] };

  /** Un túnel de dos tiles de ancho que serpentea de una caverna a otra. */
  function tunnel(from: Position, to: Position): Position[] {
    const path: Position[] = [];
    let { x, y } = from;
    for (let step = 0; step < 400 && (x !== to.x || y !== to.y); step++) {
      const dx = Math.sign(to.x - x);
      const dy = Math.sign(to.y - y);
      // Casi siempre hacia el destino; a veces, de costado (vueltas).
      const wander = random.next();
      if (wander < 0.15 && dy !== 0) x += random.next() < 0.5 ? 1 : -1;
      else if (wander < 0.3 && dx !== 0) y += random.next() < 0.5 ? 1 : -1;
      else if (dx !== 0 && (dy === 0 || random.next() < 0.5)) x += dx;
      else y += dy;
      x = Math.max(3, Math.min(WIDTH - 4, x));
      y = Math.max(3, Math.min(HEIGHT - 4, y));
      for (const [ox, oy] of [
        [0, 0],
        [1, 0],
        [0, 1],
      ] as const) {
        if (at(x + ox, y + oy) === Terrain.Rock) set(x + ox, y + oy, Terrain.Snow);
        path.push({ x: x + ox, y: y + oy });
      }
    }
    return path;
  }
}

/**
 * El trono de la escarcha: un salón de hielo con columnas de cristal, el
 * trono al fondo y el liche de escarcha con su guardia de magos y elementales.
 */
function frostThrone(): Underground {
  const width = 27;
  const height = 22;
  const g = new Grid(width, height);
  g.dig(3, 3, width - 4, height - 4, Terrain.Ice);
  g.dig(5, 2, width - 6, 3, Terrain.MarbleLight);
  const cx = Math.floor(width / 2);
  const ladder = { x: cx, y: height - 4 };
  g.put('ladder', ladder.x, ladder.y);
  const arrival = { x: cx + 1, y: height - 6 };
  g.put('throne', cx, 3);
  g.put('chest', cx - 2, 3);
  g.put('chest', cx + 2, 3);
  for (let y = 6; y <= height - 7; y += 4) {
    g.put('ice-crystal', 5, y);
    g.put('ice-crystal', width - 6, y);
  }
  g.put('candelabra', cx - 4, 3);
  g.put('candelabra', cx + 4, 3);
  g.put('bones', 6, height - 5);
  g.live('frost-lich', cx, 5);
  g.live('frost-mage', cx - 4, 7);
  g.live('frost-mage', cx + 4, 7);
  g.live('ice-elemental', cx - 6, 11);
  g.live('ice-elemental', cx + 6, 11);
  g.walls('ice-wall');
  return {
    name: 'Trono de la Escarcha',
    width,
    height,
    terrain: g.terrain,
    statics: g.statics,
    ladder,
    arrival,
    lairs: g.lairs,
  };
}

/**
 * El santuario del dragón de hielo: una cámara de piedra en cruz, con un
 * estrado en el medio donde duerme el dragón, braseros y su tesoro.
 */
function wyrmSanctum(): Underground {
  const size = 31;
  const g = new Grid(size, size);
  const c = Math.floor(size / 2);
  g.dig(c - 4, 3, c + 4, size - 4, Terrain.Granite);
  g.dig(3, c - 4, size - 4, c + 4, Terrain.Granite);
  g.dig(c - 7, c - 7, c + 7, c + 7, Terrain.Granite);
  g.dig(c - 3, c - 3, c + 3, c + 3, Terrain.MarbleDark);
  const ladder = { x: c, y: size - 4 };
  g.put('ladder', ladder.x, ladder.y);
  const arrival = { x: c + 1, y: size - 6 };
  for (const [x, y] of [
    [c - 7, c - 7],
    [c + 7, c - 7],
    [c - 7, c + 7],
    [c + 7, c + 7],
  ] as const)
    g.put('brazier', x, y);
  for (const [x, y] of [
    [c, 3],
    [3, c],
    [size - 4, c],
  ] as const)
    g.put('chest', x, y);
  for (const [x, y] of [
    [c - 3, 5],
    [c + 3, 5],
    [5, c - 3],
    [size - 6, c + 3],
  ] as const)
    g.put('ice-crystal', x, y);
  g.put('bones', c + 5, c - 2);
  g.put('bones', c - 5, c + 3);
  g.live('ice-wyrm', c, c);
  g.live('ice-elemental', c - 6, c);
  g.live('ice-elemental', c + 6, c);
  g.walls('cave-wall');
  return {
    name: 'Santuario del Dragón de Hielo',
    width: size,
    height: size,
    terrain: g.terrain,
    statics: g.statics,
    ladder,
    arrival,
    lairs: g.lairs,
  };
}
