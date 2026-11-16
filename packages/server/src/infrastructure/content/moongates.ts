import type { Position } from '@fenix/shared/geometry/position';
import { MOONGATE_DISTANCE, MOONGATE_TOWNS } from '@fenix/shared/travel/moongates';
import type { StaticKind } from '@fenix/shared/world/statics';
import { Terrain, isWater } from '@fenix/shared/world/terrain';
import type { TileMap, TileMapData } from '@fenix/shared/world/tile-map';

/**
 * Distancia al portal en casilleros: con la vista del juego, un círculo
 * medido así se ve redondo en la pantalla.
 */
function screen(dx: number, dy: number): number {
  return Math.hypot(dx, dy);
}
/**
 * Las ocho piedras, en un círculo de radio 7: los cuatro puntos cardinales y
 * las diagonales en (5, 5), a 7,07 del centro (parejo a la vista).
 */
const STONES: readonly (readonly [number, number])[] = [
  [7, 0],
  [5, 5],
  [0, 7],
  [-5, 5],
  [-7, 0],
  [-5, -5],
  [0, -7],
  [5, -5],
];
/** La tierra pisada del centro, hasta dónde se aplana y empareja el pasto, y hasta dónde se despeja. */
const TRODDEN = 2.6;
const LAWN = 8.5;
const CLEARING = 10;
/** Lo que mira alrededor (en casilleros) para no salirse del círculo. */
const REACH = 11;

/** Lo natural que se puede sacar para hacer el claro (nunca carteles, casas ni faroles). */
const NATURAL: ReadonlySet<StaticKind> = new Set<StaticKind>([
  'oak',
  'pine',
  'bush',
  'rock',
  'flowers',
  'reeds',
  'weeds',
  'birch',
  'maple',
  'palm',
  'acacia',
  'baobab',
  'bamboo',
  'boulder',
  'mossy-rock',
  'dead-tree',
  'cactus',
  'mushrooms',
  'fern',
  'tall-grass',
  'tundra-shrub',
  'crag',
  'jungle-tree',
  'jungle-plant',
] as StaticKind[]);
/** Cuánto puede subir o bajar el claro (las lomas se ven, pero se caminan igual). */
const SLOPE = 3;

/** Un portal lunar con su lugar: el claro, el anillo de piedras y la tierra pisada. */
export interface MoongateSite {
  readonly gate: Position;
  readonly stones: readonly Position[];
  readonly trodden: readonly Position[];
  /** Adentro del círculo: pasto parejo, sin manchones. */
  readonly lawn: readonly Position[];
  readonly cleared: readonly Position[];
}

/**
 * Dónde va el portal lunar de cada ciudad: en las afueras (ni pegado a la
 * muralla ni perdido en el monte), con lugar para un claro redondo de tierra
 * pisada y un círculo de ocho piedras paradas alrededor, como un sitio
 * antiguo. Hace falta suelo firme y no muy empinado, fuera de cualquier lugar con
 * nombre; los árboles y piedras sueltas del claro se sacan.
 */
export function placeMoongates(map: TileMap): MoongateSite[] {
  const statics = new Map(map.statics.map((s) => [`${s.x},${s.y}`, s.kind] as const));
  const heights = map.toData().heights;
  const heightAt = (p: Position): number => heights?.[p.y * map.width + p.x] ?? 0;
  const fits = (x: number, y: number, slope: number): boolean => {
    const base = heightAt({ x, y });
    for (let dy = -REACH; dy <= REACH; dy++)
      for (let dx = -REACH; dx <= REACH; dx++) {
        if (screen(dx, dy) > CLEARING) continue;
        const p = { x: x + dx, y: y + dy };
        const t = map.terrainAt(p);
        if (t === undefined || isWater(t) || map.regionAt(p)) return false;
        const kind = statics.get(`${p.x},${p.y}`);
        if (kind && !NATURAL.has(kind)) return false;
        if (!kind && !map.isWalkable(p)) return false;
        if (Math.abs(heightAt(p) - base) > slope) return false;
      }
    return true;
  };
  const sites: MoongateSite[] = [];
  for (const name of MOONGATE_TOWNS) {
    const town = map.regions.find((r) => r.name === name && !r.wild && !r.dungeon && !r.floor);
    if (!town) continue;
    const cx = town.x + town.width / 2;
    const cy = town.y + town.height / 2;
    const half = Math.max(town.width, town.height) / 2;
    let gate: Position | null = null;
    // Primero en un lugar parejo; si no hay, aunque sea en una loma.
    for (const slope of [SLOPE, Infinity])
      for (let d = MOONGATE_DISTANCE.min; d <= MOONGATE_DISTANCE.max && !gate; d++) {
        const r = half + d;
        for (let i = 0; i < 48 && !gate; i++) {
          const a = (i / 48) * Math.PI * 2;
          const x = Math.round(cx + Math.cos(a) * r);
          const y = Math.round(cy + Math.sin(a) * r);
          if (fits(x, y, slope)) gate = { x, y };
        }
      }
    if (gate) sites.push(siteAround(gate));
  }
  return sites;
}

function siteAround(gate: Position): MoongateSite {
  const stones = STONES.map(([dx, dy]) => ({ x: gate.x + dx, y: gate.y + dy }));
  const trodden: Position[] = [];
  const lawn: Position[] = [];
  const cleared: Position[] = [];
  for (let dy = -REACH; dy <= REACH; dy++)
    for (let dx = -REACH; dx <= REACH; dx++) {
      const d = screen(dx, dy);
      if (d > CLEARING) continue;
      const p = { x: gate.x + dx, y: gate.y + dy };
      cleared.push(p);
      if (d <= TRODDEN) trodden.push(p);
      else if (d <= LAWN) lawn.push(p);
    }
  return { gate, stones, trodden, lawn, cleared };
}

/** Lleva los lugares de los portales al mapa: saca el monte del claro, pisa la tierra y para las piedras. */
export function withMoongateSites(data: TileMapData, sites: readonly MoongateSite[]): TileMapData {
  const index = (p: Position): number => p.y * data.width + p.x;
  const cleared = new Set(sites.flatMap((s) => s.cleared.map(index)));
  const terrain = [...data.terrain];
  const heights = data.heights ? [...data.heights] : undefined;
  for (const site of sites) {
    for (const p of site.lawn) terrain[index(p)] = Terrain.Grass;
    for (const p of site.trodden) terrain[index(p)] = Terrain.Dirt;
    // Todo el círculo a la altura del portal: un llano parejo.
    if (heights) {
      const base = heights[index(site.gate)] ?? 0;
      for (const p of [...site.lawn, ...site.trodden]) heights[index(p)] = base;
    }
  }
  return {
    ...data,
    terrain,
    ...(heights ? { heights } : {}),
    statics: [
      ...data.statics.filter((s) => !cleared.has(index(s))),
      ...sites.flatMap((site) =>
        site.stones.map((p) => ({ kind: 'menhir' as const, x: p.x, y: p.y })),
      ),
    ],
  };
}
