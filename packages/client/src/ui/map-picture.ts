import { terrainBaseColor } from '@fenix/art';
import { STATICS, type StaticKind, type TileMap } from '@fenix/shared';

/** Color de cada objeto fijo en los mapas (los que no figuran no se dibujan). */
function staticColor(kind: StaticKind): string | null {
  if (kind === 'mountain') return '#7d756b';
  if (
    kind === 'rock' ||
    kind === 'rubble' ||
    kind === 'gravestone' ||
    kind === 'boulder' ||
    kind === 'mossy-rock'
  )
    return '#8d8a84';
  if (kind === 'column' || kind === 'fallen-column') return '#d8d2c4';
  if (kind === 'palm' || kind === 'acacia') return '#4f7a34';
  if (kind === 'birch' || kind === 'bamboo') return '#7c9a4a';
  if (kind === 'maple') return '#a8542c';
  if (kind === 'baobab') return '#6a7a3c';
  if (kind.startsWith('wall') || kind === 'lighthouse') return '#c9c2b4';
  if (kind === 'tent') return '#c49a62';
  if (kind === 'lamp' || kind === 'campfire' || kind === 'brazier' || kind === 'shrine')
    return '#ffd36b';
  if (kind === 'cave-entrance') return '#1b1410';
  if (kind === 'reeds' || kind === 'flowers' || kind === 'bush') return null;
  // Árboles y cactus: verde oscuro.
  return STATICS[kind].blocking ? '#2c5a2c' : null;
}

const pictures = new WeakMap<TileMap, HTMLCanvasElement>();

/**
 * El mapa entero visto desde arriba, un pixel por tile (terreno y objetos).
 * Se dibuja una sola vez por mapa y lo comparten el minimapa y el mapa del mundo.
 */
export function mapPicture(map: TileMap): HTMLCanvasElement {
  const cached = pictures.get(map);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = map.width;
  canvas.height = map.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const image = ctx.createImageData(map.width, map.height);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const terrain = map.terrainAt({ x, y });
        const [r, g, b] = terrain === undefined ? [0, 0, 0] : terrainBaseColor(terrain);
        const o = (y * map.width + x) * 4;
        image.data[o] = r;
        image.data[o + 1] = g;
        image.data[o + 2] = b;
        image.data[o + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    for (const s of map.statics) {
      const color = staticColor(s.kind);
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(s.x, s.y, 1, 1);
    }
  }
  pictures.set(map, canvas);
  return canvas;
}
