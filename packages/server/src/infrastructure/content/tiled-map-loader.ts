import {
  TILED,
  type TiledMap,
  type TiledObjectLayer,
  type TiledTileLayer,
  type TiledTileset,
} from '@fenix/content';
import {
  isItemKind,
  isNpcRole,
  type NpcRole,
  isStaticKind,
  MAX_STACK,
  type ItemKind,
  terrainByKey,
  type Position,
  type RegionData,
  type StaticKind,
  type StaticPlacement,
  type Terrain,
} from '@fenix/shared';

/** Error con un mensaje claro para quien está editando el mapa. */
export class MapFormatError extends Error {
  constructor(mapName: string, detail: string) {
    super(`Mapa "${mapName}": ${detail}`);
    this.name = 'MapFormatError';
  }
}

/**
 * Porción de mundo diseñada a mano. Los tiles sin terreno (`null`) se dejan
 * como los genere el mundo procedural.
 */
/** Objeto suelto puesto a mano en el mapa (una espada en una mesa, oro en el piso…). */
export interface PlacedItem {
  readonly kind: ItemKind;
  readonly amount: number;
  readonly position: Position;
}

export interface MapRegion {
  readonly width: number;
  readonly height: number;
  readonly terrain: readonly (Terrain | null)[];
  readonly statics: readonly StaticPlacement[];
  readonly regions: readonly RegionData[];
  readonly spawn: Position | null;
  readonly items: readonly PlacedItem[];
  /** Personajes del pueblo (comerciantes, banquera). */
  readonly npcs: readonly {
    readonly role: NpcRole;
    readonly position: Position;
    readonly name?: string;
  }[];
}

const FLIP_FLAGS = 0xf0000000;

type TileMeaning = { terrain: Terrain } | { static: StaticKind };

/** Valida un mapa de Tiled y lo traduce al modelo del juego. */
export function loadTiledMap(
  mapName: string,
  rawMap: unknown,
  tilesets: Readonly<Record<string, unknown>>,
): MapRegion {
  const fail = (detail: string): never => {
    throw new MapFormatError(mapName, detail);
  };
  const map = rawMap as TiledMap;
  if (map?.type !== 'map') fail('no es un mapa de Tiled en formato JSON');
  if (map.orientation !== 'isometric') fail('la orientación debe ser "isometric"');
  if (map.tilewidth !== 44 || map.tileheight !== 44) fail('los tiles deben medir 44×44');

  const meanings = buildGidTable(map, tilesets, fail);
  const layer = <T>(name: string, type: string): T | undefined =>
    map.layers.find((l) => l.name === name && l.type === type) as T | undefined;

  const terrainLayer =
    layer<TiledTileLayer>(TILED.terrainLayer, 'tilelayer') ??
    fail(`falta la capa de tiles "${TILED.terrainLayer}"`);
  const staticsLayer = layer<TiledTileLayer>(TILED.staticsLayer, 'tilelayer');
  const zonesLayer = layer<TiledObjectLayer>(TILED.zonesLayer, 'objectgroup');

  const size = map.width * map.height;
  for (const l of [terrainLayer, staticsLayer]) {
    if (l && l.data.length !== size) fail(`la capa "${l.name}" no tiene ${size} tiles`);
  }

  const terrain = terrainLayer.data.map((gid, index) => {
    if (gid === 0) return null;
    const meaning = meanings.get(gid & ~FLIP_FLAGS);
    if (!meaning || !('terrain' in meaning)) {
      return fail(
        `en "${TILED.terrainLayer}" hay un tile que no es terreno (${coords(index, map.width)})`,
      );
    }
    return meaning.terrain;
  });

  const statics: StaticPlacement[] = [];
  staticsLayer?.data.forEach((gid, index) => {
    if (gid === 0) return;
    const meaning = meanings.get(gid & ~FLIP_FLAGS);
    if (!meaning || !('static' in meaning)) {
      fail(
        `en "${TILED.staticsLayer}" hay un tile que no es un objeto (${coords(index, map.width)})`,
      );
      return;
    }
    statics.push({ kind: meaning.static, x: index % map.width, y: Math.floor(index / map.width) });
  });

  // En mapas isométricos, Tiled mide las posiciones de objetos en "alto de tile" por eje.
  const toTile = (value: number): number => value / map.tileheight;
  const regions: RegionData[] = [];
  let spawn: Position | null = null;
  const npcs: { role: NpcRole; position: Position; name?: string }[] = [];
  for (const object of zonesLayer?.objects ?? []) {
    if (object.point && object.name === TILED.spawnObject) {
      spawn = { x: Math.floor(toTile(object.x)), y: Math.floor(toTile(object.y)) };
    } else if ((object.class ?? object.type) === TILED.npcClass) {
      const role = object.properties?.find((p) => p.name === TILED.roleProperty)?.value;
      if (!isNpcRole(role)) fail(`el personaje "${object.name}" no tiene un rol válido`);
      else {
        const name = object.properties?.find((p) => p.name === TILED.nameProperty)?.value;
        npcs.push({
          role,
          position: { x: Math.floor(toTile(object.x)), y: Math.floor(toTile(object.y)) },
          ...(typeof name === 'string' && name ? { name } : {}),
        });
      }
    } else if ((object.class ?? object.type) === TILED.regionClass) {
      if (!object.name) fail('hay una zona sin nombre');
      regions.push({
        name: object.name,
        x: Math.round(toTile(object.x)),
        y: Math.round(toTile(object.y)),
        width: Math.round(toTile(object.width)),
        height: Math.round(toTile(object.height)),
      });
    }
  }

  const itemsLayer = layer<TiledObjectLayer>(TILED.itemsLayer, 'objectgroup');
  const items: PlacedItem[] = (itemsLayer?.objects ?? []).map((object) => {
    if (!isItemKind(object.name)) {
      return fail(`"${object.name}" no es un objeto conocido (capa "${TILED.itemsLayer}")`);
    }
    const rawAmount = object.properties?.find((p) => p.name === TILED.amountProperty)?.value ?? 1;
    const amount = Number(rawAmount);
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_STACK) {
      fail(`cantidad inválida para "${object.name}": ${String(rawAmount)}`);
    }
    const position = { x: Math.floor(toTile(object.x)), y: Math.floor(toTile(object.y)) };
    if (position.x < 0 || position.y < 0 || position.x >= map.width || position.y >= map.height) {
      fail(`"${object.name}" está fuera del mapa`);
    }
    return { kind: object.name, amount, position };
  });

  return { width: map.width, height: map.height, terrain, statics, regions, spawn, items, npcs };
}

function buildGidTable(
  map: TiledMap,
  tilesets: Readonly<Record<string, unknown>>,
  fail: (detail: string) => never,
): Map<number, TileMeaning> {
  const table = new Map<number, TileMeaning>();
  for (const ref of map.tilesets) {
    const file = ref.source.split('/').pop() ?? ref.source;
    const tileset =
      (tilesets[file] as TiledTileset | undefined) ?? fail(`tileset desconocido "${file}"`);
    for (const tile of tileset.tiles) {
      const property = (name: string): unknown =>
        tile.properties?.find((p) => p.name === name)?.value;
      const terrainKey = property(TILED.terrainProperty);
      const staticKind = property(TILED.staticProperty);
      const gid = ref.firstgid + tile.id;
      if (typeof terrainKey === 'string') {
        const terrain = terrainByKey(terrainKey) ?? fail(`terreno desconocido "${terrainKey}"`);
        table.set(gid, { terrain });
      } else if (isStaticKind(staticKind)) {
        table.set(gid, { static: staticKind });
      }
    }
  }
  return table;
}

function coords(index: number, width: number): string {
  return `x=${index % width}, y=${Math.floor(index / width)}`;
}
