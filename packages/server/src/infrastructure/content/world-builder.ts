import { TILESETS, TOWN_MAP } from '@fenix/content';
import type { IdGenerator } from '../../application/ports';
import { World } from '../../domain/world';
import { generateIslandMap, type GeneratedWorld } from './procedural-map';
import { loadTiledMap } from './tiled-map-loader';

export interface WorldBuildOptions {
  readonly size: number;
  readonly seed: number;
}

/** Arma el mapa completo: isla procedural + pueblo diseñado en Tiled. */
export function buildWorld({ size, seed }: WorldBuildOptions): GeneratedWorld {
  const town = loadTiledMap('puerto-ceniza', TOWN_MAP, TILESETS);
  return generateIslandMap({ width: size, height: size, seed, town });
}

/** Crea el mundo listo para jugar, con los objetos sueltos del mapa en el suelo. */
export function createWorld(options: WorldBuildOptions, ids: IdGenerator): World {
  const { map, spawnPoint, items } = buildWorld(options);
  const world = new World(map, spawnPoint);
  for (const { kind, amount, position } of items) {
    world.items.add(ids.next(), kind, amount, { type: 'ground', position });
  }
  return world;
}
