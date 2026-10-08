import { TILESETS, TOWN_MAP } from '@fenix/content';
import { tileDistance, type CreatureKind, type Position, type TileMap } from '@fenix/shared';
import type { IdGenerator } from '../../application/ports';
import { Creature } from '../../domain/creatures/creature';
import { Npc } from '../../domain/npcs/npc';
import { World } from '../../domain/world';
import { SeededRandom } from '../system/seeded-random';
import { generateIslandMap, type GeneratedWorld } from './procedural-map';
import { loadTiledMap } from './tiled-map-loader';

export interface WorldBuildOptions {
  readonly size: number;
  readonly seed: number;
  /** Poblar la isla con criaturas (por defecto, sí). */
  readonly creatures?: boolean;
}

/**
 * Dónde viven las criaturas: cuanto más lejos del pueblo, más peligrosas.
 * Distancias en tiles desde el punto de aparición.
 */
const CREATURE_BANDS: readonly { kind: CreatureKind; count: number; min: number; max: number }[] = [
  { kind: 'rat', count: 8, min: 16, max: 30 },
  { kind: 'wolf', count: 10, min: 26, max: 46 },
  { kind: 'skeleton', count: 8, min: 42, max: 70 },
];

/** Arma el mapa completo: isla procedural + pueblo diseñado en Tiled. */
export function buildWorld({ size, seed }: WorldBuildOptions): GeneratedWorld {
  const town = loadTiledMap('puerto-ceniza', TOWN_MAP, TILESETS);
  return generateIslandMap({ width: size, height: size, seed, town });
}

/** Crea el mundo listo para jugar, con los objetos sueltos del mapa en el suelo. */
export function createWorld(options: WorldBuildOptions, ids: IdGenerator): World {
  const { map, spawnPoint, items, npcs } = buildWorld(options);
  const world = new World(map, spawnPoint);
  for (const { role, position } of npcs) world.addNpc(new Npc(ids.next(), role, position));
  for (const { kind, amount, position } of items) {
    world.items.add(ids.next(), kind, amount, { type: 'ground', position });
  }
  if (options.creatures !== false) {
    for (const { kind, home } of creatureHomes(map, spawnPoint, options.seed)) {
      world.addCreature(new Creature(ids.next(), kind, home));
    }
  }
  return world;
}

/** Elige lugares transitables y fuera de las zonas con nombre para cada criatura. */
export function creatureHomes(
  map: TileMap,
  spawn: Position,
  seed: number,
): { kind: CreatureKind; home: Position }[] {
  const random = new SeededRandom(seed + 99);
  const taken = new Set<string>();
  const homes: { kind: CreatureKind; home: Position }[] = [];
  for (const band of CREATURE_BANDS) {
    let placed = 0;
    for (let attempt = 0; attempt < 2000 && placed < band.count; attempt++) {
      const angle = random.next() * Math.PI * 2;
      const distance = band.min + random.next() * (band.max - band.min);
      const home = {
        x: Math.round(spawn.x + Math.cos(angle) * distance),
        y: Math.round(spawn.y + Math.sin(angle) * distance),
      };
      const key = `${home.x},${home.y}`;
      if (taken.has(key) || !map.isWalkable(home) || map.regionAt(home)) continue;
      if (tileDistance(home, spawn) < band.min) continue;
      taken.add(key);
      homes.push({ kind: band.kind, home });
      placed += 1;
    }
  }
  return homes;
}
