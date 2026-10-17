import { DOORS, SEATS, STATICS, TileMap, Terrain, isMerchant, type Position } from '@fenix/shared';
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

/** Abre todas las puertas del mapa (para ver por dónde se llega caminando). */
function openAll(map: TileMap): TileMap {
  for (const s of map.statics) if (DOORS[s.kind]) map.setDoorOpen(s, true);
  return map;
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
  const map = openAll(asMap(capital));

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
    // Además de los comerciantes, la capital tiene vecinos que pasean y guardias.
    expect(capital.npcs.filter((n) => n.role === 'townsfolk').length).toBeGreaterThanOrEqual(6);
    expect(capital.npcs.filter((n) => n.role === 'guard').length).toBeGreaterThanOrEqual(6);
    expect(
      capital.npcs
        .filter((n) => isMerchant(n.role))
        .map((n) => n.role)
        .sort(),
    ).toEqual(
      [
        'banker',
        'blacksmith',
        'carpenter',
        'innkeeper',
        'mage',
        'provisioner',
        'tailor',
        'stablemaster',
        'woodcutter',
      ].sort(),
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

  it('un río hondo cruza la capital y se pasa por los puentes', () => {
    const water = capital.terrain.filter((t) => t === Terrain.Water).length;
    expect(water).toBeGreaterThan(capital.width * 3);
    expect(capital.rivers?.map((r) => r.flow).sort()).toEqual(['in', 'out']);
    // El castillo queda del otro lado del río: igual se llega caminando (por un puente).
    const spawn = capital.spawn;
    if (!spawn) return;
    const walk = reachable(map, spawn);
    const castle = capital.regions.find((r) => r.name.startsWith('Castillo'));
    expect(castle).toBeDefined();
    if (!castle) return;
    const inside = [...walk].some((key) => {
      const [x = 0, y = 0] = key.split(',').map(Number);
      return map.regionAt({ x, y })?.name === castle.name;
    });
    expect(inside).toBe(true);
  });

  it('cada negocio tiene lo suyo y hay donde sentarse', () => {
    const kinds = new Set(capital.statics.map((s) => s.kind));
    for (const kind of [
      'keg',
      'counter',
      'alchemy-table',
      'bookshelf-x',
      'cauldron',
      'weapon-rack',
      'workbench',
      'hay-bale',
      'hitching-post',
      'water-trough',
      'stump-axe',
      'log-pile',
      'bed',
      'carpet',
      'candelabra',
    ])
      expect(kinds.has(kind as never), kind).toBe(true);
    const seats = capital.statics.filter((s) => SEATS[s.kind] !== undefined);
    expect(seats.length).toBeGreaterThan(10);
    for (const seat of seats) expect(map.seatAt(seat), seat.kind).toBeDefined();
  });

  it('las casas tienen puerta y ventanas; el banco y el salón del trono, puerta de hierro', () => {
    const kinds = capital.statics.map((s) => s.kind);
    expect(kinds.filter((k) => k === 'door-x' || k === 'door-y').length).toBeGreaterThan(20);
    expect(kinds.filter((k) => k.startsWith('iron-door')).length).toBeGreaterThanOrEqual(3);
    expect(kinds.filter((k) => k.startsWith('wall-window')).length).toBeGreaterThan(20);
    // Cerradas, no se pasa a los negocios.
    const closed = asMap(capital);
    const spawn = capital.spawn;
    if (!spawn) return;
    const walk = reachable(closed, spawn);
    const banker = capital.npcs.find((n) => n.role === 'banker');
    expect(banker && walk.has(`${banker.position.x},${banker.position.y}`)).toBe(false);
  });

  it('las torres y la cripta ocupan 2 × 2 y no tapan a nadie', () => {
    expect(STATICS.tower.footprint).toBe(2);
    expect(STATICS.crypt.footprint).toBe(2);
    for (const npc of capital.npcs) expect(map.isWalkable(npc.position), npc.role).toBe(true);
  });
});

describe('buildCity: nada tapa el paso', () => {
  const cases: { style: CityStyle; size: 'large' | 'medium' | 'small' }[] = [
    { style: 'capital', size: 'large' },
    { style: 'capital', size: 'medium' },
    { style: 'mountain', size: 'medium' },
    { style: 'swamp', size: 'small' },
    { style: 'volcanic', size: 'medium' },
    { style: 'bandit', size: 'small' },
  ];
  for (const { style, size } of cases)
    for (const seed of [3, 11, 42]) {
      it(`${style} ${size} (semilla ${seed}): cada puerta tiene paso de los dos lados y se llega a todo`, () => {
        const city = buildCity({ name: 'Prueba', style, seed, size });
        const map = openAll(asMap(city));
        const seen = reachable(map, city.square);
        for (const door of map.statics.filter((s) => DOORS[s.kind])) {
          const across = /-x(-|$)/.test(door.kind)
            ? [
                { x: door.x, y: door.y - 1 },
                { x: door.x, y: door.y + 1 },
              ]
            : [
                { x: door.x - 1, y: door.y },
                { x: door.x + 1, y: door.y },
              ];
          for (const p of across)
            expect(map.isWalkable(p), `${door.kind} en ${door.x},${door.y}`).toBe(true);
        }
        const stuck: string[] = [];
        for (let y = 0; y < map.height; y++)
          for (let x = 0; x < map.width; x++)
            if (map.isWalkable({ x, y }) && !seen.has(`${x},${y}`)) stuck.push(`${x},${y}`);
        expect(stuck).toEqual([]);
      });
    }
});
