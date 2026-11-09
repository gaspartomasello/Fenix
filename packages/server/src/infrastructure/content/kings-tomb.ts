import { Terrain } from '@fenix/shared/world/terrain';
import { SeededRandom } from '../system/seeded-random';
import { Grid, type Underground } from './underground';

export const KINGS_TOMB_NAME = 'Tumba de los Reyes';

const WIDTH = 64;
const HEIGHT = 72;

/**
 * La Tumba de los Reyes, bajo el desierto: de la escalera de la entrada baja
 * un pasillo angosto que dobla varias veces hasta el vestíbulo; de ahí sale el
 * gran salón de los reyes, largo y con seis nichos a cada lado (cada uno con
 * su sarcófago y su muerto) y, al fondo, la cripta del rey de la tumba con su
 * trono y su guardia. Del vestíbulo sale además un corredor al este que baja
 * hasta una cámara en cruz, donde los magos de la corte cuidan el tesoro.
 * Diseño propio, inspirado en la tumba de los reyes de UO.
 */
export function generateKingsTomb(seed: number): Underground {
  const random = new SeededRandom(seed);
  const g = new Grid(WIDTH, HEIGHT);
  const cx = 26;
  const sand = Terrain.Sandstone;
  const dark = Terrain.MarbleDark;

  // La entrada y el pasillo que serpentea hasta el vestíbulo.
  g.dig(cx - 3, 2, cx + 3, 6, sand);
  const ladder = { x: cx, y: 2 };
  g.put('ladder', ladder.x, ladder.y);
  const arrival = { x: cx + 1, y: 4 };
  g.put('brazier', cx - 3, 3);
  g.put('brazier', cx + 3, 3);
  for (const [x0, y0, x1, y1] of [
    [cx, 7, cx + 1, 9],
    [cx, 9, cx + 6, 10],
    [cx + 5, 10, cx + 6, 12],
    [cx - 4, 12, cx + 6, 13],
    [cx - 4, 13, cx - 3, 15],
  ] as const)
    g.dig(x0, y0, x1, y1, sand);

  // El vestíbulo, con dos columnas.
  g.dig(cx - 5, 15, cx + 5, 19, dark);
  g.put('column', cx - 4, 16);
  g.put('column', cx + 4, 16);

  // El gran salón: cinco tiles de ancho, con un camino oscuro al medio.
  const hallTop = 20;
  const hallEnd = 58;
  g.dig(cx - 2, hallTop, cx + 2, hallEnd, sand);
  g.dig(cx, hallTop, cx, hallEnd, dark);
  const dwellers = ['mummy', 'skeleton', 'mummy', 'zombie', 'mummy', 'skeleton-mage'] as const;
  for (let i = 0; i < 6; i++) {
    const y = hallTop + 2 + i * 6;
    for (const side of [-1, 1] as const) {
      const x0 = side < 0 ? cx - 9 : cx + 3;
      const x1 = side < 0 ? cx - 3 : cx + 9;
      g.dig(x0, y - 1, x1, y + 1, sand);
      const far = side < 0 ? x0 : x1;
      g.put('sarcophagus', far, y);
      if (random.next() < 0.5) g.put('cobweb', far, y - 1);
      if (random.next() < 0.5) g.put('bones', far - side * 2, y + 1);
      g.live(dwellers[(i + (side > 0 ? 3 : 0)) % dwellers.length] ?? 'mummy', far - side * 3, y);
    }
    g.put('brazier', cx + (i % 2 === 0 ? -2 : 2), y + 3);
  }

  // La cripta del rey, al fondo.
  const crypt = { x0: cx - 8, y0: hallEnd + 1, x1: cx + 8, y1: HEIGHT - 3 };
  g.dig(crypt.x0, crypt.y0, crypt.x1, crypt.y1, dark);
  g.put('throne', cx, crypt.y1);
  g.put('sarcophagus', cx - 4, crypt.y1 - 1);
  g.put('sarcophagus', cx + 4, crypt.y1 - 1);
  for (const [x, y] of [
    [crypt.x0, crypt.y0],
    [crypt.x1, crypt.y0],
    [crypt.x0, crypt.y1],
    [crypt.x1, crypt.y1],
  ] as const)
    g.put('brazier', x, y);
  g.put('candelabra', cx - 2, crypt.y1);
  g.put('candelabra', cx + 2, crypt.y1);
  g.put('skull-pile', crypt.x0 + 2, crypt.y1 - 2);
  g.put('skull-pile', crypt.x1 - 2, crypt.y1 - 2);
  g.live('tomb-king', cx, crypt.y1 - 3);
  g.live('skeleton-mage', cx - 4, crypt.y0 + 3);
  g.live('skeleton-mage', cx + 4, crypt.y0 + 3);
  g.live('mummy', cx - 6, crypt.y1 - 4);
  g.live('mummy', cx + 6, crypt.y1 - 4);

  // El corredor del este y la cámara en cruz.
  const ex = 50;
  g.dig(cx + 6, 17, ex, 18, sand);
  g.dig(ex - 1, 17, ex, 40, sand);
  const c = { x: ex, y: 47 };
  g.dig(c.x - 3, c.y - 6, c.x + 3, c.y + 6, Terrain.Granite);
  g.dig(c.x - 6, c.y - 3, c.x + 6, c.y + 3, Terrain.Granite);
  g.dig(c.x - 1, c.y - 1, c.x + 1, c.y + 1, dark);
  g.put('chest', c.x, c.y);
  for (const [x, y] of [
    [c.x, c.y + 6],
    [c.x - 6, c.y],
    [c.x + 6, c.y],
  ] as const)
    g.put('chest', x, y);
  for (const [x, y] of [
    [c.x - 3, c.y - 3],
    [c.x + 3, c.y - 3],
    [c.x - 3, c.y + 3],
    [c.x + 3, c.y + 3],
  ] as const)
    g.put('brazier', x, y);
  g.live('lich', c.x, c.y - 3);
  g.live('wraith', c.x - 4, c.y);
  g.live('wraith', c.x + 4, c.y);
  g.live('skeleton-mage', c.x, c.y + 4);
  g.put('cobweb', ex, 20);
  g.put('bones', ex - 1, 30);

  g.walls('tomb-wall');
  return {
    name: KINGS_TOMB_NAME,
    width: WIDTH,
    height: HEIGHT,
    terrain: g.terrain,
    statics: g.statics,
    ladder,
    arrival,
    lairs: g.lairs,
  };
}
