import { DOORS, STATICS, Terrain, type Position, type TileMap } from '@fenix/shared';
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
    const { map } = generateIslandMap({ width: 192, height: 192, seed: 42 });
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

  it('tiene tundra, selva, sabana, tierra roja, prados, salinas, orillas y vegetación propia', () => {
    const terrains = new Set<Terrain | undefined>();
    for (let y = 0; y < 320; y++)
      for (let x = 0; x < 320; x++) terrains.add(map.terrainAt({ x, y }));
    for (const t of [
      Terrain.Tundra,
      Terrain.Jungle,
      Terrain.DryGrass,
      Terrain.Clay,
      Terrain.Meadow,
      Terrain.ShallowWater,
      Terrain.Corrupted,
      Terrain.Ruins,
      Terrain.OldRoad,
      Terrain.Lava,
      Terrain.Ash,
    ])
      expect(terrains.has(t), String(t)).toBe(true);
    const kinds = new Set(map.statics.map((s) => s.kind));
    for (const kind of [
      'palm',
      'jungle-tree',
      'birch',
      'acacia',
      'tall-grass',
      'fern',
      'mushrooms',
      'wildflowers',
      'peyote',
      'jungle-plant',
      'tundra-shrub',
    ] as const)
      expect(kinds.has(kind), kind).toBe(true);
  });

  it('hay llanuras abiertas de pasto, sin árboles, para construir', () => {
    // Una zona de 9×9 de pasto o prado sin nada que bloquee, fuera de pueblos y caminos.
    const blocked = new Set(
      map.statics.filter((s) => STATICS[s.kind].blocking).map((s) => `${s.x},${s.y}`),
    );
    let found = false;
    for (let y = 10; y < 310 && !found; y += 3)
      for (let x = 10; x < 310 && !found; x += 3) {
        let ok = true;
        for (let dy = 0; dy < 9 && ok; dy++)
          for (let dx = 0; dx < 9 && ok; dx++) {
            const p = { x: x + dx, y: y + dy };
            const t = map.terrainAt(p);
            ok =
              (t === Terrain.Grass || t === Terrain.Meadow) &&
              !blocked.has(`${p.x},${p.y}`) &&
              !map.regionAt(p);
          }
        found = ok;
      }
    expect(found).toBe(true);
  });

  it('a la salida de los pueblos los caminos van empedrados', () => {
    for (const sign of map.signs) {
      let paved = false;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++)
          if (map.terrainAt({ x: sign.x + dx, y: sign.y + dy }) === Terrain.Stone) paved = true;
      expect(paved, sign.text).toBe(true);
    }
  });

  it('las montañas forman macizos, sin cordones finos', () => {
    // Los riscos son parte de la montaña.
    const mountains = map.statics.filter((s) => s.kind === 'mountain' || s.kind.startsWith('crag'));
    const at = new Set(mountains.map((s) => `${s.x},${s.y}`));
    for (const m of mountains) {
      let around = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if ((dx || dy) && at.has(`${m.x + dx},${m.y + dy}`)) around++;
      expect(around).toBeGreaterThanOrEqual(2);
    }
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
    // Fauna del lugar en las tierras salvajes y los monstruos en las mazmorras.
    for (const kind of ['rabbit', 'hind', 'wolf', 'giant-spider', 'orc', 'troll', 'dragon', 'lich'])
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
    // Las salas tienen puertas (de mazmorra, y de huesos en la guarida): abiertas se pasa.
    const doors = map.statics.filter((s) => DOORS[s.kind] && map.regionAt(s)?.dungeon);
    expect(doors.some((d) => d.kind.startsWith('dungeon-door'))).toBe(true);
    expect(doors.some((d) => d.kind.startsWith('bone-door'))).toBe(true);
    const closed = reachable(map, inside);
    for (const d of doors) map.setDoorOpen(d, true);
    const cave = reachable(map, inside);
    expect(cave.size).toBeGreaterThan(closed.size);
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

describe('buildWorld: el continente alargado (más alto que ancho)', () => {
  const world = buildWorld({ size: 420, height: 600, seed: 1997 });
  const { map, spawnPoint } = world;

  it('es un solo continente de norte a sur (sin estrecho), con una bahía al este', () => {
    const isLand = (x: number, y: number): boolean => {
      const t = map.terrainAt({ x, y });
      return t !== Terrain.Water && t !== Terrain.ShallowWater;
    };
    /** La costa este del continente en una fila (el último tile de tierra antes del mar abierto). */
    const eastCoast = (y: number): number => {
      let x = 0;
      while (x < 420 && !isLand(x, y)) x++;
      // Avanza hasta encontrar mar abierto (20 tiles seguidos de agua).
      for (let water = 0; x < 420 && water < 20; x++) water = isLand(x, y) ? 0 : water + 1;
      return x - 20;
    };
    // Tierra en todas las filas del continente: no hay estrecho que lo corte.
    for (let y = 40; y < 560; y += 4) {
      let land = 0;
      for (let x = 0; x < 300; x++) if (isLand(x, y)) land++;
      expect(land, `fila ${y}`).toBeGreaterThan(40);
    }
    // La bahía: a media latitud la costa este se mete bien adentro.
    expect(eastCoast(312)).toBeLessThan(eastCoast(150) - 60);
  });

  it('la isla grande tiene su ciudad y las Tierras de Ceniza, con el volcán y la lava', () => {
    const names = map.regions.map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining(['Puerto Brasa', 'Tierras de Ceniza', 'Monte del Fuego']),
    );
    const volcano = map.regions.find((r) => r.name === 'Monte del Fuego');
    let lava = 0;
    let ash = 0;
    for (let y = 0; y < 600; y++)
      for (let x = 280; x < 420; x++) {
        const t = map.terrainAt({ x, y });
        if (t === Terrain.Lava) lava++;
        if (t === Terrain.Ash || t === Terrain.Corrupted) ash++;
      }
    expect(lava).toBeGreaterThan(20);
    expect(ash).toBeGreaterThan(100);
    expect(volcano).toBeDefined();
    // A la isla no se llega caminando desde la capital.
    const walkable = reachable(map, spawnPoint);
    const onIsland = [...walkable].some((key) => {
      const [x = 0, y = 0] = key.split(',').map(Number);
      return map.regionAt({ x, y })?.name === 'Puerto Brasa';
    });
    expect(onIsland).toBe(false);
  });

  it('hace frío al norte, calor en el medio y la capital queda en lo templado', () => {
    const snowY = map.statics.filter((s) => s.kind === 'snow-pine').map((s) => s.y);
    const hotY = map.statics
      .filter((s) => s.kind === 'cactus' || s.kind === 'jungle-tree' || s.kind === 'palm')
      .map((s) => s.y);
    expect(median(snowY)).toBeLessThan(median(hotY));
    expect(spawnPoint.y).toBeGreaterThan(Math.min(...snowY));
    expect(map.regionAt(spawnPoint)?.name).toBe('Puerto Ceniza');
  });

  it('desde la capital se llega caminando a los otros pueblos', () => {
    const walkable = reachable(map, spawnPoint);
    for (const name of ['Roca Alta', 'Junco Verde']) {
      const inside = [...walkable].some((key) => {
        const [x = 0, y = 0] = key.split(',').map(Number);
        return map.regionAt({ x, y })?.name === name;
      });
      expect(inside, name).toBe(true);
    }
  });
});

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

describe('montañas', () => {
  const world = buildWorld({ size: 700, height: 900, seed: 1997 });
  const { map, spawnPoint, wildlife } = world;

  it('la montaña es ladera de roca alta, con riscos sueltos y alguna mina adentro', () => {
    const mountains = map.statics.filter((s) => s.kind === 'mountain');
    expect(mountains.length).toBeGreaterThan(0);
    for (const m of mountains.slice(0, 200)) expect(map.terrainAt(m)).toBe(Terrain.Mountain);
    expect(map.statics.some((s) => s.kind.startsWith('crag'))).toBe(true);
    const mine = map.regions.find((r) => r.name.startsWith('Mina'));
    expect(mine).toBeDefined();
    if (!mine) return;
    // Se llega caminando a la mina desde la capital, y adentro hay roca para picar.
    const seen = reachable(map, spawnPoint);
    let inside = false;
    for (let y = mine.y; y < mine.y + mine.height; y++)
      for (let x = mine.x; x < mine.x + mine.width; x++)
        if (map.terrainAt({ x, y }) === Terrain.Cave && seen.has(`${x},${y}`)) inside = true;
    expect(inside).toBe(true);
  });

  it('ninguna criatura queda encerrada entre montañas (solo las de las islas no se alcanzan a pie)', () => {
    for (const s of map.statics) if (DOORS[s.kind]) map.setDoorOpen(s, true);
    const seen = reachable(map, spawnPoint);
    for (const { home } of wildlife) {
      if (seen.has(`${home.x},${home.y}`)) continue;
      const island = reachable(map, home);
      const coast = [...island].some((key) => {
        const [x = 0, y = 0] = key.split(',').map(Number);
        return [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx = 0, dy = 0]) => map.terrainAt({ x: x + dx, y: y + dy }) === Terrain.Water);
      });
      expect(coast, `${home.x},${home.y}`).toBe(true);
    }
  });
});
