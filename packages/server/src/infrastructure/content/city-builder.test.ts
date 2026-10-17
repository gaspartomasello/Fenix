import { STATICS, TileMap, Terrain, type Position } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { buildCity, type City, type CityStyle } from './city-builder';

/** El plano de la ciudad como mapa, con lo vacío de pasto (como queda en el mundo). */
function asMap(city: City): TileMap {
  return new TileMap({
    width: city.width,
    height: city.height,
    terrain: city.terrain.map((t) => t ?? Terrain.Grass),
    statics: [...city.statics],
    regions: [...city.regions],
    signs: [],
  });
}

function reachable(map: TileMap, from: Position): Set<string> {
  const seen = new Set([`${from.x},${from.y}`]);
  const queue = [from];
  for (let p = queue.shift(); p; p = queue.shift())
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next = { x: p.x + dx, y: p.y + dy };
      const key = `${next.x},${next.y}`;
      if (seen.has(key) || !map.isWalkable(next)) continue;
      seen.add(key);
      queue.push(next);
    }
  return seen;
}

describe('buildCity', () => {
  const capital = buildCity({
    name: 'Puerto Ceniza',
    style: 'capital',
    seed: 3,
    size: 'large',
    starterItems: true,
  });
  const map = asMap(capital);

  it('la capital tiene muralla con torres, castillo con trono, fuente y mercado', () => {
    const kinds = new Set(capital.statics.map((s) => s.kind));
    for (const kind of ['rampart-x', 'tower', 'throne', 'fountain', 'stall', 'shrine', 'banner'])
      expect(kinds.has(kind as never), kind).toBe(true);
    expect(capital.regions.map((r) => r.name)).toContain('Castillo de Puerto Ceniza');
  });

  it('desde la plaza se llega caminando a cada negocio, a la caballeriza y a las cuatro salidas', () => {
    const spawn = capital.spawn;
    expect(spawn).not.toBeNull();
    if (!spawn) return;
    const walk = reachable(map, spawn);
    expect(capital.npcs.map((n) => n.role).sort()).toEqual(
      ['banker', 'blacksmith', 'innkeeper', 'mage', 'stablemaster'].sort(),
    );
    for (const npc of capital.npcs) {
      const near = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx = 0, dy = 0]) => walk.has(`${npc.position.x + dx},${npc.position.y + dy}`));
      expect(near, npc.role).toBe(true);
    }
    const cx = Math.floor(capital.width / 2);
    const cy = Math.floor(capital.height / 2);
    for (const exit of [
      { x: cx, y: 0 },
      { x: cx, y: capital.height - 1 },
      { x: 0, y: cy },
      { x: capital.width - 1, y: cy },
    ])
      expect(walk.has(`${exit.x},${exit.y}`), JSON.stringify(exit)).toBe(true);
  });

  it('afuera de la muralla hay un cementerio sin protección, con no-muertos sobre tiles libres', () => {
    const graveyard = capital.regions.find((r) => r.name === 'Cementerio de Puerto Ceniza');
    expect(graveyard?.wild).toBe(true);
    expect(capital.lairs.length).toBeGreaterThanOrEqual(5);
    const kinds = new Set(capital.lairs.map((l) => l.kind));
    for (const kind of ['zombie', 'ghoul', 'wraith', 'skeleton'] as const)
      expect(kinds).toContain(kind);
    for (const lair of capital.lairs) {
      expect(map.isWalkable(lair.position)).toBe(true);
      expect(map.regionAt(lair.position)?.name).toBe('Cementerio de Puerto Ceniza');
    }
  });

  it('cada región tiene su estilo de paredes, y el refugio de los bandidos no tiene ley', () => {
    const walls: Record<CityStyle, string> = {
      capital: 'wall-x',
      mountain: 'log-wall-x',
      swamp: 'plank-wall-x',
      volcanic: 'basalt-wall-x',
      bandit: 'tent',
    };
    for (const [style, kind] of Object.entries(walls) as [CityStyle, string][]) {
      const city = buildCity({ name: 'X', style, seed: 9, size: 'medium' });
      expect(
        city.statics.some((s) => s.kind === kind),
        style,
      ).toBe(true);
      const town = city.regions.find((r) => r.name === 'X');
      expect(Boolean(town?.wild), style).toBe(style === 'bandit');
    }
  });

  it('las torres y la cripta ocupan 2 × 2 y no tapan a nadie', () => {
    expect(STATICS.tower.footprint).toBe(2);
    expect(STATICS.crypt.footprint).toBe(2);
    for (const npc of capital.npcs) expect(map.isWalkable(npc.position), npc.role).toBe(true);
  });
});
