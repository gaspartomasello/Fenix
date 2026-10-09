import { RESOURCE_REGROW_MS, RESOURCES_PER_SPOT, type Position } from '@fenix/shared';

/** Cuánto le queda a cada árbol o roca; se recuperan con el tiempo. */
export class ResourceSpots {
  private readonly spots = new Map<string, { left: number; regrowAt: number }>();

  /** Saca una unidad si queda. Devuelve false si el lugar está agotado. */
  take(position: Position, now: number): boolean {
    const key = `${position.x},${position.y}`;
    let spot = this.spots.get(key);
    if (!spot || now >= spot.regrowAt) {
      spot = { left: RESOURCES_PER_SPOT, regrowAt: Number.POSITIVE_INFINITY };
      this.spots.set(key, spot);
    }
    if (spot.left <= 0) return false;
    spot.left -= 1;
    if (spot.left === 0) spot.regrowAt = now + RESOURCE_REGROW_MS;
    return true;
  }
}
