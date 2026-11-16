import type { PackedBlueprint } from './blueprint-codec';

/**
 * El mundo del modo solo en un archivo binario chico, para publicarlo junto
 * al juego y que el navegador no tenga que generarlo. Se arma así (después se
 * comprime con gzip):
 *
 * - «FNXW», la versión y el largo de la cabecera (JSON con la clave del mundo
 *   y lo que no son arreglos);
 * - el terreno (un byte por tile);
 * - las alturas, como la diferencia con el tile de la izquierda (casi siempre
 *   0 o 1: se comprimen muy bien);
 * - los objetos fijos ordenados por posición: cuánto avanza cada uno desde el
 *   anterior y de qué tipo es.
 */
const MAGIC = 0x57584e46; // «FNXW» leído como entero de 32 bits (little endian)
const VERSION = 1;

interface Header {
  readonly key: string;
  readonly blueprint: PackedBlueprint['blueprint'];
  readonly map: PackedBlueprint['map'];
  readonly tiles: number;
  readonly statics: number;
  readonly heights: boolean;
}

export function encodeWorldFile(packed: PackedBlueprint, key: string): Uint8Array {
  const width = packed.map.width;
  const tiles = packed.terrain.length;
  const n = packed.staticKinds.length;
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) =>
      (packed.staticY[a] ?? 0) * width +
      (packed.staticX[a] ?? 0) -
      ((packed.staticY[b] ?? 0) * width + (packed.staticX[b] ?? 0)),
  );
  const header: Header = {
    key,
    blueprint: packed.blueprint,
    map: packed.map,
    tiles,
    statics: n,
    heights: packed.heights !== null,
  };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const pad = (4 - ((12 + json.length) % 4)) % 4;
  const headingBytes = 12 + json.length + pad;
  const size =
    headingBytes +
    tiles +
    ((4 - (tiles % 4)) % 4) +
    (packed.heights ? tiles * 2 + ((4 - ((tiles * 2) % 4)) % 4) : 0) +
    n * 4 +
    n * 2;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, VERSION, true);
  view.setUint32(8, json.length, true);
  bytes.set(json, 12);
  let at = headingBytes;
  bytes.set(packed.terrain, at);
  at += tiles + ((4 - (tiles % 4)) % 4);
  if (packed.heights) {
    const heights = packed.heights;
    for (let i = 0; i < tiles; i++) {
      const left = i % width === 0 ? 0 : (heights[i - 1] ?? 0);
      view.setInt16(at + i * 2, (heights[i] ?? 0) - left, true);
    }
    at += tiles * 2 + ((4 - ((tiles * 2) % 4)) % 4);
  }
  let previous = 0;
  order.forEach((i, k) => {
    const position = (packed.staticY[i] ?? 0) * width + (packed.staticX[i] ?? 0);
    view.setUint32(at + k * 4, position - previous, true);
    previous = position;
  });
  at += n * 4;
  order.forEach((i, k) => view.setUint16(at + k * 2, packed.staticKinds[i] ?? 0, true));
  return bytes;
}

/** Lee el archivo del mundo; null si no es uno (o es de otra versión del formato). */
export function decodeWorldFile(
  bytes: Uint8Array,
): { key: string; packed: PackedBlueprint } | null {
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== VERSION) return null;
  const jsonLength = view.getUint32(8, true);
  let header: Header;
  try {
    header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + jsonLength))) as Header;
  } catch {
    return null;
  }
  const width = header.map.width;
  const { tiles, statics: n } = header;
  let at = 12 + jsonLength + ((4 - ((12 + jsonLength) % 4)) % 4);
  const terrain = bytes.slice(at, at + tiles);
  at += tiles + ((4 - (tiles % 4)) % 4);
  let heights: Int16Array | null = null;
  if (header.heights) {
    heights = new Int16Array(tiles);
    for (let i = 0; i < tiles; i++) {
      const left = i % width === 0 ? 0 : (heights[i - 1] ?? 0);
      heights[i] = left + view.getInt16(at + i * 2, true);
    }
    at += tiles * 2 + ((4 - ((tiles * 2) % 4)) % 4);
  }
  const staticX = new Int32Array(n);
  const staticY = new Int32Array(n);
  let position = 0;
  for (let k = 0; k < n; k++) {
    position += view.getUint32(at + k * 4, true);
    staticX[k] = position % width;
    staticY[k] = Math.floor(position / width);
  }
  at += n * 4;
  const staticKinds = new Uint16Array(n);
  for (let k = 0; k < n; k++) staticKinds[k] = view.getUint16(at + k * 2, true);
  if (at + n * 2 > bytes.length) return null;
  return {
    key: header.key,
    packed: {
      version: 1,
      blueprint: header.blueprint,
      map: header.map,
      terrain,
      heights,
      staticKinds,
      staticX,
      staticY,
    },
  };
}
