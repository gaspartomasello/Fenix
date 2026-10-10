/** Subconjunto del formato JSON de Tiled (https://doc.mapeditor.org/en/stable/reference/json-map-format/) que usa Fenix. */

export interface TiledProperty {
  readonly name: string;
  readonly type: string;
  readonly value: string | number | boolean;
}

export interface TiledTilesetTile {
  readonly id: number;
  readonly properties?: readonly TiledProperty[];
}

export interface TiledTileset {
  readonly type: 'tileset';
  readonly name: string;
  readonly tilewidth: number;
  readonly tileheight: number;
  readonly tilecount: number;
  readonly columns: number;
  readonly image: string;
  readonly imagewidth: number;
  readonly imageheight: number;
  readonly tileoffset?: { readonly x: number; readonly y: number };
  readonly tiles: readonly TiledTilesetTile[];
}

export interface TiledTileLayer {
  readonly type: 'tilelayer';
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly data: readonly number[];
}

export interface TiledObject {
  readonly id: number;
  readonly name: string;
  readonly type?: string;
  readonly class?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly point?: boolean;
  readonly properties?: readonly TiledProperty[];
}

export interface TiledObjectLayer {
  readonly type: 'objectgroup';
  readonly name: string;
  readonly objects: readonly TiledObject[];
}

export interface TiledMap {
  readonly type: 'map';
  readonly orientation: string;
  readonly width: number;
  readonly height: number;
  readonly tilewidth: number;
  readonly tileheight: number;
  readonly layers: readonly (
    TiledTileLayer | TiledObjectLayer | { readonly type: string; readonly name: string }
  )[];
  readonly tilesets: readonly { readonly firstgid: number; readonly source: string }[];
}

/** Nombres de capas y propiedades que el juego entiende. */
export const TILED = {
  terrainLayer: 'terreno',
  staticsLayer: 'objetos',
  zonesLayer: 'zonas',
  itemsLayer: 'objetos-sueltos',
  amountProperty: 'cantidad',
  spawnObject: 'aparicion',
  regionClass: 'region',
  npcClass: 'npc',
  roleProperty: 'rol',
  /** Nombre propio de un personaje del pueblo (si no, el de su oficio). */
  nameProperty: 'nombre',
  terrainProperty: 'terrain',
  staticProperty: 'static',
} as const;
