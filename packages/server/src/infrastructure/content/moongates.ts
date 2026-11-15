import type { Position } from '@fenix/shared/geometry/position';
import { MOONGATE_DISTANCE, MOONGATE_TOWNS } from '@fenix/shared/travel/moongates';
import { isWater } from '@fenix/shared/world/terrain';
import type { TileMap } from '@fenix/shared/world/tile-map';

/**
 * Dónde va el portal lunar de cada ciudad: en las afueras (ni pegado a la
 * muralla ni perdido en el monte), en un claro de 3 × 3 sin árboles ni
 * piedras, fuera de cualquier lugar con nombre y con suelo firme. Se prueba en
 * anillos cada vez más lejos y, en cada anillo, mirando hacia todos lados.
 */
export function placeMoongates(map: TileMap): Position[] {
  const blocked = new Set(map.statics.map((s) => `${s.x},${s.y}`));
  const clear = (x: number, y: number): boolean => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const p = { x: x + dx, y: y + dy };
        const t = map.terrainAt(p);
        if (t === undefined || isWater(t) || !map.isWalkable(p) || blocked.has(`${p.x},${p.y}`))
          return false;
        if (map.regionAt(p)) return false;
      }
    return true;
  };
  const gates: Position[] = [];
  for (const name of MOONGATE_TOWNS) {
    const town = map.regions.find((r) => r.name === name && !r.wild && !r.dungeon && !r.floor);
    if (!town) continue;
    const cx = town.x + town.width / 2;
    const cy = town.y + town.height / 2;
    const half = Math.max(town.width, town.height) / 2;
    let found: Position | null = null;
    for (let d = MOONGATE_DISTANCE.min; d <= MOONGATE_DISTANCE.max && !found; d++) {
      const r = half + d;
      for (let i = 0; i < 32 && !found; i++) {
        const a = (i / 32) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(a) * r);
        const y = Math.round(cy + Math.sin(a) * r);
        if (clear(x, y)) found = { x, y };
      }
    }
    if (found) gates.push(found);
  }
  return gates;
}
