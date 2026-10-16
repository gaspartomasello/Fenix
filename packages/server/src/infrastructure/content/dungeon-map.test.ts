import { DOORS, STATICS, Terrain, doorPartner } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { generateDungeon } from './dungeon-map';

describe('generateDungeon', () => {
  for (const seed of [7, 99, 1234, 2004, 31337]) {
    const d = generateDungeon({ width: 60, height: 60, seed });
    const blocking = new Set(
      d.statics
        .filter((s) => STATICS[s.kind].blocking && !DOORS[s.kind])
        .map((s) => `${s.x},${s.y}`),
    );
    const free = (x: number, y: number): boolean =>
      d.terrain[y * d.width + x] === Terrain.Cave && !blocking.has(`${x},${y}`);

    it(`semilla ${seed}: con las puertas abiertas se llega a todo el suelo libre`, () => {
      const seen = new Set<string>([`${d.arrival.x},${d.arrival.y}`]);
      const queue = [d.arrival];
      while (queue.length) {
        const p = queue.pop();
        if (!p) break;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const n = { x: p.x + dx, y: p.y + dy };
          const key = `${n.x},${n.y}`;
          if (seen.has(key) || !free(n.x, n.y)) continue;
          seen.add(key);
          queue.push(n);
        }
      }
      for (let y = 0; y < d.height; y++)
        for (let x = 0; x < d.width; x++) if (free(x, y)) expect(seen.has(`${x},${y}`)).toBe(true);
    });

    it(`semilla ${seed}: las puertas son dobles, cierran el pasillo y nada las tapa`, () => {
      const doors = d.statics.filter((s) => DOORS[s.kind]);
      expect(doors.length).toBeGreaterThan(0);
      expect(doors.some((s) => s.kind.startsWith('bone-door'))).toBe(true);
      for (const door of doors) {
        const partner = doorPartner(door.kind, door);
        expect(partner).not.toBeNull();
        if (!partner) continue;
        expect(doors.some((o) => o.x === partner.x && o.y === partner.y)).toBe(true);
        // Delante y detrás de cada hoja, pasillo libre.
        const across = door.kind.includes('-y-') ? 'y' : 'x';
        const ahead =
          across === 'y'
            ? [
                [door.x - 1, door.y],
                [door.x + 1, door.y],
              ]
            : [
                [door.x, door.y - 1],
                [door.x, door.y + 1],
              ];
        for (const [x = 0, y = 0] of ahead) expect(free(x, y)).toBe(true);
      }
    });
  }
});
