import { TILESETS, TOWN_MAP } from '@fenix/content';
import { generateIslandMap, type GeneratedWorld } from './procedural-map';
import { loadTiledMap } from './tiled-map-loader';

export interface WorldBuildOptions {
  readonly size: number;
  readonly seed: number;
}

/** Arma el mundo completo: isla procedural + pueblo diseñado en Tiled. */
export function buildWorld({ size, seed }: WorldBuildOptions): GeneratedWorld {
  const town = loadTiledMap('puerto-ceniza', TOWN_MAP, TILESETS);
  return generateIslandMap({ width: size, height: size, seed, town });
}
