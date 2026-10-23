import type { Position } from '../geometry/position';
import type { TileMap } from '../world/tile-map';

/**
 * Línea de visión, como en UO: entre dos lugares no tiene que haber nada que
 * tape la vista (una pared, una reja, una puerta cerrada, la roca). Se recorre
 * la recta tile por tile sin contar las puntas; al pasar en diagonal entre dos
 * tiles tapados (una esquina de pared) tampoco se ve. Además, los dos lugares
 * tienen que estar en el mismo nivel: desde un piso alto no se ve la calle.
 */
export function hasLineOfSight(map: TileMap, from: Position, to: Position): boolean {
  if (map.levelAt(from) !== map.levelAt(to)) return false;
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - x);
  const dy = Math.abs(to.y - y);
  const sx = to.x > x ? 1 : -1;
  const sy = to.y > y ? 1 : -1;
  let error = dx - dy;
  while (x !== to.x || y !== to.y) {
    const doubled = error * 2;
    const stepX = doubled > -dy;
    const stepY = doubled < dx;
    if (stepX && stepY && map.blocksSight({ x: x + sx, y }) && map.blocksSight({ x, y: y + sy }))
      return false;
    if (stepX) {
      error -= dy;
      x += sx;
    }
    if (stepY) {
      error += dx;
      y += sy;
    }
    if ((x !== to.x || y !== to.y) && map.blocksSight({ x, y })) return false;
  }
  return true;
}
