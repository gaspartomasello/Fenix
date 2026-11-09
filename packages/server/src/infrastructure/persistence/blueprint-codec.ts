import { STATIC_KINDS, type StaticKind } from '@fenix/shared/world/statics';
import type { Terrain } from '@fenix/shared/world/terrain';
import type { TileMapData } from '@fenix/shared/world/tile-map';
import type { WorldBlueprint } from '../content/world-builder';

/**
 * El plano del mundo empaquetado para guardarlo en el navegador: el terreno,
 * las alturas y los objetos fijos (cientos de miles) van en arreglos de
 * números, que se guardan y se leen mucho más rápido que objetos sueltos.
 */
export interface PackedBlueprint {
  readonly version: 1;
  readonly blueprint: Omit<WorldBlueprint, 'map'>;
  readonly map: Omit<TileMapData, 'terrain' | 'heights' | 'statics'>;
  readonly terrain: Uint8Array;
  readonly heights: Int16Array | null;
  readonly staticKinds: Uint16Array;
  readonly staticX: Int32Array;
  readonly staticY: Int32Array;
}

const KIND_INDEX = new Map<StaticKind, number>(STATIC_KINDS.map((kind, i) => [kind, i]));

export function packBlueprint(blueprint: WorldBlueprint): PackedBlueprint {
  const { map, ...rest } = blueprint;
  const { terrain, heights, statics, ...mapRest } = map;
  const staticKinds = new Uint16Array(statics.length);
  const staticX = new Int32Array(statics.length);
  const staticY = new Int32Array(statics.length);
  statics.forEach((s, i) => {
    staticKinds[i] = KIND_INDEX.get(s.kind) ?? 0;
    staticX[i] = s.x;
    staticY[i] = s.y;
  });
  return {
    version: 1,
    blueprint: rest,
    map: mapRest,
    terrain: Uint8Array.from(terrain),
    heights: heights ? Int16Array.from(heights) : null,
    staticKinds,
    staticX,
    staticY,
  };
}

/** El plano de vuelta; null si lo guardado no tiene la forma esperada (de otra versión). */
export function unpackBlueprint(packed: unknown): WorldBlueprint | null {
  const p = packed as Partial<PackedBlueprint> | null;
  if (
    !p ||
    p.version !== 1 ||
    !p.blueprint ||
    !p.map ||
    !(p.terrain instanceof Uint8Array) ||
    !(p.staticKinds instanceof Uint16Array) ||
    !(p.staticX instanceof Int32Array) ||
    !(p.staticY instanceof Int32Array)
  )
    return null;
  const { staticKinds, staticX, staticY } = p;
  const statics = Array.from(staticKinds, (k, i) => ({
    kind: STATIC_KINDS[k] as StaticKind,
    x: staticX[i] ?? 0,
    y: staticY[i] ?? 0,
  }));
  const map: TileMapData = {
    ...p.map,
    terrain: Array.from(p.terrain) as Terrain[],
    statics,
    ...(p.heights instanceof Int16Array ? { heights: Array.from(p.heights) } : {}),
  };
  return { ...p.blueprint, map };
}
