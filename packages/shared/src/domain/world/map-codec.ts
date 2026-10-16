import { STATIC_KINDS, type StaticKind, type StaticPlacement } from './statics';
import type { Terrain } from './terrain';
import type { TileMapData } from './tile-map';

/**
 * El mapa tal como viaja por la red: el terreno es un byte por tile y cada
 * objeto fijo cinco bytes (tipo, x, y), ambos en base64. Un mapa de
 * 1000 × 1400 pasa de varios megas de JSON a poco más de uno.
 */
export interface CompactMapData extends Omit<TileMapData, 'terrain' | 'statics' | 'heights'> {
  readonly terrain: string;
  readonly statics: string;
  /** Alturas: un byte por tile (si el mapa tiene). */
  readonly heights?: string;
}

export function encodeMap(data: TileMapData): CompactMapData {
  const terrain = new Uint8Array(data.width * data.height);
  for (let i = 0; i < terrain.length; i++) terrain[i] = data.terrain[i] ?? 0;
  const statics = new Uint8Array(data.statics.length * 5);
  data.statics.forEach((s, i) => {
    const at = i * 5;
    statics[at] = STATIC_KINDS.indexOf(s.kind);
    statics[at + 1] = s.x & 0xff;
    statics[at + 2] = s.x >> 8;
    statics[at + 3] = s.y & 0xff;
    statics[at + 4] = s.y >> 8;
  });
  const { heights, ...rest } = data;
  return {
    ...rest,
    terrain: toBase64(terrain),
    statics: toBase64(statics),
    ...(heights ? { heights: toBase64(Uint8Array.from(heights)) } : {}),
  };
}

export function decodeMap(data: CompactMapData): TileMapData {
  const terrain = fromBase64(data.terrain) as unknown as readonly Terrain[];
  const bytes = fromBase64(data.statics);
  const statics: StaticPlacement[] = [];
  for (let at = 0; at + 4 < bytes.length; at += 5) {
    const kind = STATIC_KINDS[bytes[at] ?? 0] as StaticKind;
    statics.push({
      kind,
      x: (bytes[at + 1] ?? 0) | ((bytes[at + 2] ?? 0) << 8),
      y: (bytes[at + 3] ?? 0) | ((bytes[at + 4] ?? 0) << 8),
    });
  }
  const { heights, ...rest } = data;
  return {
    ...rest,
    terrain,
    statics,
    ...(heights ? { heights: Array.from(fromBase64(heights)) } : {}),
  };
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const VALUES = new Uint8Array(128);
for (let i = 0; i < ALPHABET.length; i++) VALUES[ALPHABET.charCodeAt(i)] = i;

/** Bytes → base64 (sin depender del navegador ni de Node). */
function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let line = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    line +=
      ALPHABET.charAt((n >> 18) & 63) +
      ALPHABET.charAt((n >> 12) & 63) +
      (i + 1 < bytes.length ? ALPHABET.charAt((n >> 6) & 63) : '=') +
      (i + 2 < bytes.length ? ALPHABET.charAt(n & 63) : '=');
    if (line.length >= 8192) {
      parts.push(line);
      line = '';
    }
  }
  parts.push(line);
  return parts.join('');
}

function fromBase64(text: string): Uint8Array {
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((text.length / 4) * 3 - padding);
  let out = 0;
  for (let i = 0; i < text.length; i += 4) {
    const n =
      ((VALUES[text.charCodeAt(i)] ?? 0) << 18) |
      ((VALUES[text.charCodeAt(i + 1)] ?? 0) << 12) |
      ((VALUES[text.charCodeAt(i + 2)] ?? 0) << 6) |
      (VALUES[text.charCodeAt(i + 3)] ?? 0);
    if (out < bytes.length) bytes[out++] = (n >> 16) & 255;
    if (out < bytes.length) bytes[out++] = (n >> 8) & 255;
    if (out < bytes.length) bytes[out++] = n & 255;
  }
  return bytes;
}
