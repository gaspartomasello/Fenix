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

describe('buildWorld (con el pueblo de Tiled)', () => {
  const { map, spawnPoint } = buildWorld({ size: 128, seed: 1997 });

  it('aparece en el pueblo, en un tile transitable', () => {
    expect(map.isWalkable(spawnPoint)).toBe(true);
    expect(map.regionAt(spawnPoint)?.name).toBe('Puerto Ceniza');
  });

  it('desde la aparición se puede salir caminando del pueblo', () => {
    // Búsqueda en anchura: debe alcanzarse un tile fuera de la zona del pueblo.
    const region = map.regionAt(spawnPoint);
    const seen = new Set<string>([`${spawnPoint.x},${spawnPoint.y}`]);
    const queue = [spawnPoint];
    let escaped = false;
    while (queue.length > 0 && !escaped) {
      const current = queue.shift();
      if (!current) break;
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
        if (map.regionAt(next) !== region) escaped = true;
        queue.push(next);
      }
    }
    expect(escaped).toBe(true);
  });
});

describe('createWorld', () => {
  it('puebla la isla con criaturas, ninguna dentro del pueblo', () => {
    const world = createWorld({ size: 128, seed: 1997 }, new SequentialIds());
    const creatures = world.allCreatures();
    expect(creatures.length).toBeGreaterThanOrEqual(20);
    const bodies = new Set(creatures.map((c) => c.body));
    for (const kind of ['rat', 'wolf', 'giant-spider', 'orc', 'troll', 'dragon', 'lich'])
      expect(bodies).toContain(kind);
    for (const creature of creatures) {
      expect(world.map.safeZoneAt(creature.position)).toBeUndefined();
      expect(world.map.isWalkable(creature.position)).toBe(true);
    }
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
  const { map, spawnPoint, caveEntrance, lairs } = buildWorld({ size: 128, seed: 1997 });
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

  it('la mazmorra no se alcanza caminando desde la isla', () => {
    if (!inside) throw new Error('sin entrada');
    expect(reachable(map, spawnPoint).has(`${inside.x},${inside.y}`)).toBe(false);
  });

  it('hay un solo dragón, en la última sala, y las criaturas fuertes van al fondo', () => {
    const dragons = lairs.filter((l) => l.kind === 'dragon');
    expect(dragons).toHaveLength(1);
    expect(lairs.some((l) => l.kind === 'lich')).toBe(true);
  });
});
