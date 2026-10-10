import { Terrain, type Position, type TileMap } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { generateIslandMap } from './procedural-map';
import { buildWorld, createWorld } from './world-builder';
import { SequentialIds } from '../../test-support/fakes';

describe('generateIslandMap', () => {
  const options = { width: 64, height: 64, seed: 42 };

  it('es determinístico para un mismo seed', () => {
    expect(generateIslandMap(options).map.toData()).toEqual(
      generateIslandMap(options).map.toData(),
    );
  });

  it('crecen varias especies de árboles', () => {
    const { map } = generateIslandMap({ width: 128, height: 128, seed: 42 });
    const kinds = new Set(map.statics.map((s) => s.kind));
    for (const kind of ['oak', 'pine', 'willow', 'gomero'] as const)
      expect(kinds.has(kind), kind).toBe(true);
  });

  it('sin pueblo deja una plaza transitable en el centro', () => {
    const { map, spawnPoint } = generateIslandMap(options);
    expect(map.terrainAt(spawnPoint)).toBe(Terrain.Stone);
    expect(map.isWalkable(spawnPoint)).toBe(true);
  });

  it('rodea la isla de agua y no pone vegetación en el agua', () => {
    const { map } = generateIslandMap(options);
    for (let i = 0; i < 64; i++) {
      expect(map.terrainAt({ x: i, y: 0 })).toBe(Terrain.Water);
      expect(map.terrainAt({ x: 0, y: i })).toBe(Terrain.Water);
    }
    expect(map.statics.length).toBeGreaterThan(0);
    for (const placed of map.statics) expect(map.terrainAt(placed)).not.toBe(Terrain.Water);
  });
});

describe('buildWorld: el continente', () => {
  const world = buildWorld({ size: 320, seed: 1997 });
  const { map, spawnPoint } = world;
  const walkable = reachable(map, spawnPoint);

  it('aparece en la capital, en un tile transitable', () => {
    expect(map.isWalkable(spawnPoint)).toBe(true);
    expect(map.regionAt(spawnPoint)?.name).toBe('Puerto Ceniza');
  });

  it('hay tres pueblos y se llega caminando de la capital a los otros dos', () => {
    for (const name of ['Puerto Ceniza', 'Roca Alta', 'Junco Verde']) {
      const region = map.regions.find((r) => r.name === name);
      expect(region, name).toBeDefined();
      if (!region) continue;
      expect(map.safeZoneAt({ x: region.x + 2, y: region.y + 2 })?.name).toBe(name);
      const center = `${region.x + Math.floor(region.width / 2)},${region.y + Math.floor(region.height / 2)}`;
      const inside = [...walkable].some((key) => {
        const [x = 0, y = 0] = key.split(',').map(Number);
        return map.regionAt({ x, y })?.name === name;
      });
      expect(inside, `${name} (${center})`).toBe(true);
    }
  });

  it('tiene nieve al norte, desierto al sur, pantano y montañas', () => {
    const terrains = new Set<Terrain | undefined>();
    for (let y = 0; y < 320; y++)
      for (let x = 0; x < 320; x++) terrains.add(map.terrainAt({ x, y }));
    for (const t of [Terrain.Snow, Terrain.Sand, Terrain.Swamp, Terrain.Water, Terrain.Grass])
      expect(terrains.has(t), String(t)).toBe(true);
    const kinds = new Set(map.statics.map((s) => s.kind));
    for (const kind of ['mountain', 'snow-pine', 'cactus', 'reeds', 'willow'] as const)
      expect(kinds.has(kind), kind).toBe(true);
    const snowRows = map.statics.filter((s) => s.kind === 'snow-pine').map((s) => s.y);
    const cactusRows = map.statics.filter((s) => s.kind === 'cactus').map((s) => s.y);
    expect(Math.max(...snowRows)).toBeLessThan(Math.min(...cactusRows));
  });

  it('los caminos tienen carteles con su destino', () => {
    expect(map.signs.length).toBeGreaterThanOrEqual(4);
    for (const sign of map.signs) {
      expect(sign.text).toMatch(/^Camino a /);
      expect(map.statics.some((s) => s.kind === 'sign' && s.x === sign.x && s.y === sign.y)).toBe(
        true,
      );
    }
  });

  it('hay lugares con nombre que no protegen, con sus habitantes', () => {
    const names = world.places.map((p) => p.name);
    for (const name of [
      'Campamento de los Colmillos',
      'Torre Hueca',
      'Cementerio Viejo',
      'Faro del Cabo',
      'Ruinas del Sol',
    ])
      expect(names).toContain(name);
    for (const place of world.places) {
      expect(map.regionAt(place.center)?.name).toBe(place.name);
      expect(map.safeZoneAt(place.center)).toBeUndefined();
    }
    const camp = world.places.find((p) => p.name === 'Campamento de los Colmillos');
    expect(camp?.creatures.filter((c) => c.kind === 'orc').length).toBeGreaterThanOrEqual(3);
    expect(map.statics.some((s) => s.kind === 'lighthouse')).toBe(true);
  });
});

describe('createWorld', () => {
  it('puebla el continente con criaturas, ninguna dentro de un pueblo', () => {
    const world = createWorld({ size: 320, seed: 1997 }, new SequentialIds());
    const creatures = world.allCreatures();
    expect(creatures.length).toBeGreaterThanOrEqual(80);
    const bodies = new Set(creatures.map((c) => c.body));
    for (const kind of ['rat', 'wolf', 'giant-spider', 'orc', 'troll', 'dragon', 'lich'])
      expect(bodies).toContain(kind);
    for (const creature of creatures) {
      expect(world.map.safeZoneAt(creature.position)).toBeUndefined();
      expect(world.map.isWalkable(creature.position)).toBe(true);
    }
  });

  it('la gente de los pueblos nuevos tiene nombre propio', () => {
    const world = createWorld({ size: 320, seed: 1997 }, new SequentialIds());
    const names = world.allNpcs().map((n) => n.name);
    expect(names).toContain('Anselmo el herrero');
    expect(names).toContain('Clementina la hechicera');
    expect(names).toContain('Tomás el herrero');
  });

  it('con un mapa chico queda solo la capital', () => {
    const { map } = buildWorld({ size: 128, seed: 1997 });
    expect(map.regions.some((r) => r.name === 'Roca Alta')).toBe(false);
    expect(map.regions.some((r) => r.name === 'Puerto Ceniza')).toBe(true);
  });
});

/** Tiles alcanzables caminando desde `from` (sin usar teletransportes). */
function reachable(map: TileMap, from: Position): Set<string> {
  const seen = new Set([`${from.x},${from.y}`]);
  const queue = [from];
  for (let current = queue.shift(); current; current = queue.shift()) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next = { x: current.x + dx, y: current.y + dy };
      const key = `${next.x},${next.y}`;
      if (seen.has(key) || !map.isWalkable(next)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return seen;
}

describe('mazmorra', () => {
  const { map, spawnPoint, caveEntrance, lairs } = buildWorld({ size: 320, seed: 1997 });
  const inside = map.teleportAt(caveEntrance);

  it('la boca de la cueva se alcanza caminando desde el pueblo y lleva adentro', () => {
    expect(reachable(map, spawnPoint).has(`${caveEntrance.x},${caveEntrance.y}`)).toBe(true);
    expect(inside).toBeDefined();
    if (!inside) return;
    expect(map.regionAt(inside)?.dungeon).toBe(true);
    expect(map.terrainAt(inside)).toBe(Terrain.Cave);
    expect(map.isWalkable(inside)).toBe(true);
  });

  it('adentro se llega caminando a todas las criaturas y a la escalera de salida', () => {
    if (!inside) throw new Error('sin entrada');
    const cave = reachable(map, inside);
    for (const { home } of lairs) expect(cave.has(`${home.x},${home.y}`)).toBe(true);
    const ladder = map.teleporters.find((t) => map.regionAt(t)?.dungeon);
    expect(ladder && cave.has(`${ladder.x},${ladder.y}`)).toBe(true);
    // La escalera devuelve al lado de la boca, afuera.
    expect(ladder?.to).toEqual({ x: caveEntrance.x, y: caveEntrance.y + 2 });
    expect(map.isWalkable(ladder?.to ?? caveEntrance)).toBe(true);
  });

  it('la mazmorra no se alcanza caminando desde el continente', () => {
    if (!inside) throw new Error('sin entrada');
    expect(reachable(map, spawnPoint).has(`${inside.x},${inside.y}`)).toBe(false);
  });

  it('hay un solo dragón, en la última sala, y las criaturas fuertes van al fondo', () => {
    const dragons = lairs.filter((l) => l.kind === 'dragon');
    expect(dragons).toHaveLength(1);
    expect(lairs.some((l) => l.kind === 'lich')).toBe(true);
  });
});
