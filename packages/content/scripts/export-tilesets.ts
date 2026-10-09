/**
 * Exporta el arte procedural como tilesets de Tiled (PNG + JSON) en
 * packages/content/tilesets. Correr después de cambiar terrenos u objetos:
 *   npm run tilesets -w @fenix/content
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  drawStatic,
  drawTerrainTile,
  PixelImage,
  STATIC_ART_HEIGHT,
  STATIC_ART_WIDTH,
  TERRAIN_ART_SIZE,
} from '@fenix/art';
import { ALL_TERRAINS, STATIC_KINDS, TERRAINS } from '@fenix/shared';
import { TILED, type TiledTileset } from '../src/tiled-format';
import { encodePng } from './png';

const SCALE = 1;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'tilesets');

/** Une imágenes en una fila (a escala `SCALE`, sin suavizado). */
function sheet(images: readonly PixelImage[], width: number, height: number): PixelImage {
  const out = new PixelImage(width * SCALE * images.length, height * SCALE);
  images.forEach((image, index) => {
    for (let y = 0; y < height * SCALE; y++) {
      for (let x = 0; x < width * SCALE; x++) {
        const sx = Math.floor(x / SCALE);
        const sy = Math.floor(y / SCALE);
        const alpha = image.alphaAt(sx, sy);
        if (alpha > 0) out.set(index * width * SCALE + x, y, image.colorAt(sx, sy), alpha);
      }
    }
  });
  return out;
}

async function writeTileset(
  name: string,
  images: readonly PixelImage[],
  size: { width: number; height: number },
  property: string,
  values: readonly string[],
  tileoffset?: { x: number; y: number },
): Promise<void> {
  const image = sheet(images, size.width, size.height);
  await writeFile(join(OUT, `${name}.png`), encodePng(image.width, image.height, image.data));
  const tileset: TiledTileset = {
    type: 'tileset',
    name,
    tilewidth: size.width * SCALE,
    tileheight: size.height * SCALE,
    tilecount: images.length,
    columns: images.length,
    image: `${name}.png`,
    imagewidth: image.width,
    imageheight: image.height,
    ...(tileoffset ? { tileoffset } : {}),
    tiles: values.map((value, id) => ({
      id,
      properties: [{ name: property, type: 'string', value }],
    })),
  };
  await writeFile(join(OUT, `${name}.json`), `${JSON.stringify(tileset, null, 2)}\n`);
  console.info(`[tilesets] ${name}: ${images.length} tiles`);
}

await writeTileset(
  'terreno',
  ALL_TERRAINS.map((terrain) => drawTerrainTile(terrain, 0)),
  { width: TERRAIN_ART_SIZE, height: TERRAIN_ART_SIZE },
  TILED.terrainProperty,
  ALL_TERRAINS.map((terrain) => TERRAINS[terrain].key),
);

// Los objetos son más anchos que un tile: se corren para quedar centrados.
await writeTileset(
  'objetos',
  STATIC_KINDS.map((kind) => drawStatic(kind, 0)),
  { width: STATIC_ART_WIDTH, height: STATIC_ART_HEIGHT },
  TILED.staticProperty,
  STATIC_KINDS,
  { x: -((STATIC_ART_WIDTH - TERRAIN_ART_SIZE) * SCALE) / 2, y: 0 },
);
