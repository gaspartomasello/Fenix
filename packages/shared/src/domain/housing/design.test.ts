import { describe, expect, it } from 'vitest';
import type { Position } from '../geometry/position';
import { Terrain } from '../world/terrain';
import { TileMap } from '../world/tile-map';
import {
  HOUSE_FLOORS,
  HOUSE_PIECES,
  designCost,
  designProblem,
  emptyDesign,
  lotSide,
  parseHouseDesign,
  withCell,
  type FloorKind,
  type HouseDesign,
  type PieceKind,
} from './design';
import { HOUSE_DEEDS, HOUSE_PLANS, houseKindOfDeed } from './houses';
import {
  HOUSE_SLOT,
  houseChests,
  houseDoors,
  houseFront,
  houseOrigin,
  houseStructure,
  indoorsAt,
  placementProblem,
  siteLayout,
  slotsNeeded,
  type HouseSite,
} from './structure';

const KIND = 'lot-small';
const SIDE = lotSide(KIND);

function paint(
  design: HouseDesign,
  level: number,
  tiles: readonly Position[],
  change: { floor?: FloorKind | null; piece?: PieceKind | null },
): HouseDesign {
  return tiles.reduce((d, p) => withCell(d, level, p.x, p.y, SIDE, change), design);
}

const rect = (x0: number, y0: number, x1: number, y1: number): Position[] => {
  const tiles: Position[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push({ x, y });
  return tiles;
};

const ring = (x0: number, y0: number, x1: number, y1: number): Position[] =>
  rect(x0, y0, x1, y1).filter((p) => p.x === x0 || p.x === x1 || p.y === y0 || p.y === y1);

/** Una casa de piedra que ocupa todo el lote, con la puerta al sur y un cofre. */
function cottage(): HouseDesign {
  let d = emptyDesign(KIND);
  d = paint(d, 0, rect(0, 0, SIDE - 2, SIDE - 2), { floor: 'flagstone' });
  d = paint(d, 0, ring(0, 0, SIDE - 1, SIDE - 1), { piece: 'wall-stone' });
  d = withCell(d, 0, 3, SIDE - 1, SIDE, { piece: 'door-wood', floor: 'flagstone' });
  d = withCell(d, 0, 5, SIDE - 1, SIDE, { piece: 'window-stone' });
  return withCell(d, 0, SIDE - 2, 1, SIDE, { piece: 'chest' });
}

/** La misma casa con un primer piso y la escalera en el rincón del oeste. */
function twoStorey(): HouseDesign {
  let d = withCell(cottage(), 0, 1, 1, SIDE, { piece: 'stairs-wood' });
  d = paint(d, 1, rect(0, 0, SIDE - 2, SIDE - 2), { floor: 'wood' });
  return paint(d, 1, ring(0, 0, SIDE - 1, SIDE - 1), { piece: 'wall-plank' });
}

function field(): TileMap {
  const width = 120;
  const height = 100;
  const terrain = new Array<Terrain>(width * height).fill(Terrain.Grass);
  for (let y = 0; y < height; y++)
    for (let x = 60; x < width; x++) terrain[y * width + x] = Terrain.Rock;
  return new TileMap({ width, height, terrain });
}

function siteOf(design: HouseDesign): HouseSite {
  const slots = Array.from({ length: slotsNeeded(KIND) }, (_, i) => ({
    x: 62 + (i % 2) * HOUSE_SLOT,
    y: 2 + Math.floor(i / 2) * HOUSE_SLOT,
  }));
  const origin = houseOrigin(KIND, { x: 25, y: 25 });
  return { id: 'casa', kind: KIND, ...origin, slots, name: 'Casa de Ana', design };
}

/** Desde `from`, ¿a qué tiles se llega caminando (abriendo puertas y usando escaleras)? */
function reach(map: TileMap, from: Position): Set<string> {
  const seen = new Set([`${from.x},${from.y}`]);
  const queue = [from];
  for (let at = queue.pop(); at; at = queue.pop()) {
    const next: Position[] = [
      { x: at.x + 1, y: at.y },
      { x: at.x - 1, y: at.y },
      { x: at.x, y: at.y + 1 },
      { x: at.x, y: at.y - 1 },
    ];
    const jump = map.teleportAt(at);
    if (jump) next.push(jump);
    for (const p of next) {
      const key = `${p.x},${p.y}`;
      if (seen.has(key) || (!map.isWalkable(p) && !map.doorAt(p))) continue;
      seen.add(key);
      queue.push(p);
    }
  }
  return seen;
}

describe('casas a medida', () => {
  it('los lotes se compran como escritura y se levantan vacíos', () => {
    for (const kind of ['lot-small', 'lot-medium', 'lot-large', 'lot-huge'] as const) {
      expect(houseKindOfDeed(HOUSE_DEEDS[kind])).toBe(kind);
      expect(HOUSE_PLANS[kind].lot).toBe(true);
      // Los pisos altos entran en su lugar apartado.
      expect(lotSide(kind) + 2).toBeLessThan(HOUSE_SLOT);
      const empty = emptyDesign(kind);
      expect(designProblem(kind, empty)).toBeNull();
      expect(parseHouseDesign(JSON.parse(JSON.stringify(empty)), kind)).toEqual(empty);
    }
    expect(placementProblem(field(), KIND, houseOrigin(KIND, { x: 20, y: 20 }))).toBeNull();
  });

  it('rechaza diseños dañados o de otro tamaño', () => {
    expect(parseHouseDesign({ levels: ['zz'], roof: 'wood' })).toBeNull();
    expect(parseHouseDesign({ levels: ['..'], roof: 'paja' })).toBeNull();
    expect(parseHouseDesign(emptyDesign('lot-huge'), KIND)).toBeNull();
  });

  it('las paredes toman la orientación de las vecinas, como en las casas hechas', () => {
    const layout = siteLayout({ kind: KIND, design: cottage() });
    const at = (x: number, y: number): string | undefined =>
      layout.statics.find((s) => s.x === x && s.y === y)?.kind;
    expect(at(0, 0)).toBe('wall-corner');
    expect(at(1, 0)).toBe('wall-x');
    expect(at(0, 1)).toBe('wall-y');
    expect(at(SIDE - 1, 0)).toBe('wall-y');
    expect(at(0, SIDE - 1)).toBe('wall-x');
    expect(at(SIDE - 1, SIDE - 1)).toBe('wall-post');
    expect(at(3, SIDE - 1)).toBe('door-x');
    expect(at(5, SIDE - 1)).toBe('wall-window-x');
    expect(layout.chests).toEqual([{ x: SIDE - 2, y: 1 }]);
  });

  it('sin puerta no se llega al cofre; con lo de arriba en el aire tampoco se puede', () => {
    const closed = withCell(cottage(), 0, 3, SIDE - 1, SIDE, { piece: 'wall-stone' });
    expect(designProblem(KIND, closed)).toMatch(/cofre/);
    expect(designProblem(KIND, cottage())).toBeNull();

    const floating = paint(cottage(), 1, rect(2, 2, 3, 3), { floor: 'wood' });
    expect(designProblem(KIND, floating)).toMatch(/escalera/);
    const outside = withCell(emptyDesign(KIND), 1, 2, 2, SIDE, { floor: 'wood' });
    expect(designProblem(KIND, outside)).toMatch(/aire/);
    expect(designProblem(KIND, twoStorey())).toBeNull();

    // En el último piso no hay escalera que siga; y cofres hasta lo que entra en el lote.
    const tooHigh = withCell(twoStorey(), 1, 3, 3, SIDE, { piece: 'stairs-wood' });
    expect(designProblem(KIND, tooHigh)).toMatch(/último piso/);
    const chests = paint(cottage(), 0, rect(2, 1, 3, 1), { piece: 'chest' });
    expect(designProblem(KIND, chests)).toMatch(/hasta 2 cofres/);
  });

  it('en el mapa: se entra por la puerta, se sube por la escalera y se ve el techo', () => {
    const map = field();
    const site = siteOf(twoStorey());
    map.addStructure(houseStructure(site));
    const reached = reach(map, houseFront(site));
    const [chest] = houseChests(site);
    expect(chest && reached.has(`${chest.x},${chest.y}`)).toBe(true);
    const layout = siteLayout(site);
    expect(layout.levels.map((l) => l.roof)).toEqual([false, true]);
    const first = layout.levels[0];
    const slot = site.slots[0] as Position;
    expect(first?.arrival).toBeTruthy();
    const arrival = { x: slot.x + (first?.arrival?.x ?? 0), y: slot.y + (first?.arrival?.y ?? 0) };
    expect(reached.has(`${arrival.x},${arrival.y}`)).toBe(true);
    // El primer piso se ve encima de la planta baja, tile por tile.
    expect(map.displayOf({ x: slot.x + 1, y: slot.y + 1 })).toEqual({
      x: site.x,
      y: site.y,
      level: 1,
    });
    expect(houseDoors(site)).toEqual([{ x: site.x + 3, y: site.y + SIDE - 1 }]);
    expect(indoorsAt(site, { x: site.x + 2, y: site.y + 2 })).toBe(true);
    expect(indoorsAt(site, { x: site.x + 2, y: site.y + SIDE })).toBe(false);
    expect(indoorsAt(site, arrival)).toBe(true);
    map.removeStructure(site.id);
    expect(map.anchoredFloors()).toHaveLength(0);
    expect(map.terrainAt({ x: site.x + 2, y: site.y + 2 })).toBe(Terrain.Grass);
  });

  it('lo nuevo se paga en oro o en materiales; lo que se saca devuelve la mitad', () => {
    const empty = emptyDesign(KIND);
    const floorOnly = paint(empty, 0, rect(0, 0, 1, 0), { floor: 'wood' });
    const cost = designCost(KIND, empty, floorOnly);
    // Dos tiles de piso y el techo que los tapa.
    expect(cost.gold).toBe(2 * HOUSE_FLOORS.wood.gold + 2 * 10);
    expect(cost.materials).toEqual({ boards: 4 });
    expect(cost.refund).toEqual({});

    const walled = paint(floorOnly, 0, [{ x: 0, y: 0 }], { piece: 'wall-stone' });
    expect(designCost(KIND, floorOnly, walled).gold).toBe(HOUSE_PIECES['wall-stone'].gold);
    const back = designCost(KIND, walled, floorOnly);
    expect(back.gold).toBe(0);
    expect(back.refund).toEqual({ 'stone-block': 2 });
    expect(designCost(KIND, walled, walled).changes).toBe(0);
  });
});
