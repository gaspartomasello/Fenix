import {
  isWater,
  treasureHint,
  type Position,
  type TileMap,
  type TreasureLevel,
  type TreasureMark,
} from '@fenix/shared';

/** Cuántos lugares al azar se prueban antes de rendirse. */
const TRIES = 600;

/**
 * Elige dónde enterrar un tesoro: tierra firme que se pueda caminar, lejos de
 * los pueblos y fuera de las mazmorras (los lugares salvajes con nombre, como
 * una cala de piratas, sí valen).
 */
export function chartTreasure(
  map: TileMap,
  level: TreasureLevel,
  random: () => number,
): TreasureMark | null {
  for (let i = 0; i < TRIES; i++) {
    const p = { x: Math.floor(random() * map.width), y: Math.floor(random() * map.height) };
    const terrain = map.terrainAt(p);
    if (terrain === undefined || isWater(terrain) || !map.isWalkable(p)) continue;
    const region = map.regionAt(p);
    if (region && !region.wild) continue;
    if (map.teleporters.some((t) => t.x === p.x && t.y === p.y)) continue;
    return { ...p, level };
  }
  return null;
}

/** La pista escrita en el mapa: respecto del pueblo o lugar con nombre más cercano. */
export function hintFor(map: TileMap, mark: Position): string {
  let best: { name: string; x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (const region of map.regions) {
    if (region.dungeon) continue;
    const center = { x: region.x + region.width / 2, y: region.y + region.height / 2 };
    const distance = Math.hypot(center.x - mark.x, center.y - mark.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { name: region.name, ...center };
    }
  }
  return best ? treasureHint(mark, best) : 'en algún lugar de las tierras salvajes';
}
