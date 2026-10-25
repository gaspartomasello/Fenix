import { describe, expect, it } from 'vitest';
import type { Position } from '../geometry/position';
import { DOORS } from '../world/statics';
import { Terrain } from '../world/terrain';
import { TileMap } from '../world/tile-map';
import {
  HOUSE_DEEDS,
  HOUSE_KINDS,
  HOUSE_PLANS,
  houseKindOfDeed,
  houseLevel,
  isHouseName,
  type HouseKind,
} from './houses';
import { houseLayout } from './layout';
import {
  HOUSE_SLOT,
  houseDoors,
  houseFront,
  houseOrigin,
  houseStructure,
  insideHouse,
  placementProblem,
  slotsNeeded,
  type HouseSite,
} from './structure';

const G = Terrain.Grass;

/** Un campo de pasto con lugar a la derecha para los pisos altos. */
function field(width = 120, height = 100): TileMap {
  const terrain = new Array<Terrain>(width * height).fill(G);
  for (let y = 0; y < height; y++)
    for (let x = 60; x < width; x++) terrain[y * width + x] = Terrain.Rock;
  return new TileMap({ width, height, terrain });
}

function siteOf(kind: HouseKind, center: Position = { x: 25, y: 25 }): HouseSite {
  const slots = Array.from({ length: slotsNeeded(kind) }, (_, i) => ({
    x: 62 + (i % 2) * HOUSE_SLOT,
    y: 2 + Math.floor(i / 2) * HOUSE_SLOT,
  }));
  return { id: `casa-${kind}`, kind, ...houseOrigin(kind, center), slots, name: 'Casa de Ana' };
}

/** Desde `from`, ¿a qué tiles se llega caminando (abriendo puertas y usando escaleras)? */
function reach(map: TileMap, from: Position): Set<string> {
  const seen = new Set([`${from.x},${from.y}`]);
  const queue = [from];
  for (let at = queue.pop(); at; at = queue.pop()) {
    const next: Position[] = [
      { x: at.x + 1, y: at.y },
      { x: at.x - 1, y: at.y },
      { x: at.x, y: at.y + 1 },
      { x: at.x, y: at.y - 1 },
    ];
    const jump = map.teleportAt(at);
    if (jump) next.push(jump);
    for (const p of next) {
      const key = `${p.x},${p.y}`;
      if (seen.has(key) || (!map.isWalkable(p) && !map.doorAt(p))) continue;
      seen.add(key);
      queue.push(p);
    }
  }
  return seen;
}

describe('casas de los jugadores', () => {
  it('cada casa tiene su escritura, que vuelve a la clase de casa', () => {
    for (const kind of HOUSE_KINDS) expect(houseKindOfDeed(HOUSE_DEEDS[kind])).toBe(kind);
    expect(houseKindOfDeed('sloop-deed')).toBeNull();
  });

  it('los planos entran en su lugar apartado y traen sus cofres', () => {
    for (const kind of HOUSE_KINDS) {
      const layout = houseLayout(kind);
      expect(layout.chests).toHaveLength(HOUSE_PLANS[kind].chests);
      for (const level of layout.levels) {
        expect(level.width).toBeLessThan(HOUSE_SLOT);
        expect(level.height).toBeLessThan(HOUSE_SLOT);
      }
      expect(layout.levels).toHaveLength(HOUSE_PLANS[kind].floors + 1);
      // La puerta de entrada está en la pared del sur (la que se ve).
      for (const door of layout.doors) {
        const placed = layout.statics.find((s) => s.x === door.x && s.y === door.y);
        expect(placed && DOORS[placed.kind]).toBeTruthy();
        expect(door.y).toBe(HOUSE_PLANS[kind].height + 1);
      }
    }
  });

  it('desde la puerta se llega a toda la casa, a cada cofre y hasta arriba de todo', () => {
    for (const kind of HOUSE_KINDS) {
      const map = field();
      const site = siteOf(kind);
      map.addStructure(houseStructure(site));
      const reached = reach(map, houseFront(site));
      const layout = houseLayout(kind);
      for (let y = layout.interior.y0; y <= layout.interior.y1; y++)
        for (let x = layout.interior.x0; x <= layout.interior.x1; x++) {
          const p = { x: site.x + x, y: site.y + y };
          if (map.isWalkable(p))
            expect(reached.has(`${p.x},${p.y}`), `${kind} ${x},${y}`).toBe(true);
        }
      for (const chest of layout.chests)
        expect(reached.has(`${site.x + chest.x},${site.y + chest.y}`)).toBe(true);
      // El último piso con escalera tiene que llegar a la azotea (si se sube).
      const roof = layout.levels.at(-1);
      const slot = site.slots.at(-1);
      if (roof?.arrival && slot)
        expect(reached.has(`${slot.x + roof.arrival.x},${slot.y + roof.arrival.y}`), kind).toBe(
          true,
        );
    }
  });

  it('cerrada, la casa no deja pasar; los pisos altos se ven encima de la planta baja', () => {
    const map = field();
    const site = siteOf('stone-house');
    map.addStructure(houseStructure(site));
    const [door] = houseDoors(site);
    if (!door) throw new Error('sin puerta');
    expect(map.isWalkable(door)).toBe(false);
    map.setDoorOpen(door, true);
    expect(map.isWalkable(door)).toBe(true);
    // El primer piso se ve encima del piso de adentro de la planta baja.
    const slot = site.slots[0] as Position;
    const layout = houseLayout('stone-house');
    const seen = map.displayOf({ x: slot.x + 2, y: slot.y + 2 });
    expect(seen).toEqual({
      x: site.x + layout.interior.x0,
      y: site.y + layout.interior.y0,
      level: 1,
    });
    expect(insideHouse(site, { x: slot.x + 3, y: slot.y + 3 })).toBe(true);
    expect(map.regionAt({ x: site.x + 2, y: site.y + 2 })?.name).toBe('Casa de Ana');
  });

  it('demolida, el mapa vuelve a ser como antes', () => {
    const map = field();
    const site = siteOf('basalt-tower');
    const before = { x: site.x + 3, y: site.y + 3 };
    const wall = { x: site.x, y: site.y };
    map.addStructure(houseStructure(site));
    expect(map.isWalkable(wall)).toBe(false);
    expect(map.terrainAt(before)).toBe(Terrain.StoneTiles);
    expect(map.anchoredFloors().length).toBe(3);
    map.removeStructure(site.id);
    expect(map.isWalkable(wall)).toBe(true);
    expect(map.terrainAt(before)).toBe(G);
    expect(map.anchoredFloors()).toHaveLength(0);
    expect(map.structureAt(before)).toBeUndefined();
    expect(map.regionAt(before)).toBeUndefined();
  });

  it('se levanta en campo abierto, no en el agua, ni pegada a otra casa ni en un pueblo', () => {
    const map = field();
    const origin = houseOrigin('wood-shack', { x: 20, y: 20 });
    expect(placementProblem(map, 'wood-shack', origin)).toBeNull();
    map.addStructure(houseStructure({ ...siteOf('wood-shack', { x: 20, y: 20 }), slots: [] }));
    expect(
      placementProblem(map, 'wood-shack', houseOrigin('wood-shack', { x: 26, y: 20 })),
    ).toMatch(/otra casa/);
    expect(
      placementProblem(map, 'wood-shack', houseOrigin('wood-shack', { x: 58, y: 20 })),
    ).toBeTruthy();

    const town = new TileMap({
      width: 40,
      height: 40,
      terrain: new Array<Terrain>(1600).fill(G),
      regions: [{ name: 'Puerto Ceniza', x: 0, y: 0, width: 15, height: 15 }],
      statics: [{ kind: 'oak', x: 30, y: 30 }],
    });
    expect(
      placementProblem(town, 'wood-shack', houseOrigin('wood-shack', { x: 10, y: 10 })),
    ).toMatch(/pueblo/);
    expect(
      placementProblem(town, 'wood-shack', houseOrigin('wood-shack', { x: 30, y: 30 })),
    ).toMatch(/árboles/);
  });

  it('se puede construir sobre pasto alto y flores: quedan tapados por el piso', () => {
    const terrain = new Array<Terrain>(40 * 40).fill(G);
    const map = new TileMap({
      width: 40,
      height: 40,
      terrain,
      statics: [
        { kind: 'tall-grass', x: 20, y: 20 },
        { kind: 'flowers', x: 21, y: 19 },
      ],
    });
    const origin = houseOrigin('wood-shack', { x: 20, y: 20 });
    expect(placementProblem(map, 'wood-shack', origin)).toBeNull();
    map.addStructure(houseStructure({ ...siteOf('wood-shack', { x: 20, y: 20 }), slots: [] }));
    expect(map.isCovered({ x: 20, y: 20 })).toBe(true);
    expect(map.isCovered({ x: 30, y: 30 })).toBe(false);
  });

  it('el dueño, los copropietarios, los amigos y los echados', () => {
    const security = { public: false, coOwners: ['Beto'], friends: ['Ceci'], banned: ['Dani'] };
    expect(houseLevel('Ana', security, 'ana')).toBe('owner');
    expect(houseLevel('Ana', security, 'BETO')).toBe('co-owner');
    expect(houseLevel('Ana', security, 'Ceci')).toBe('friend');
    expect(houseLevel('Ana', security, 'Dani')).toBe('banned');
    expect(houseLevel('Ana', security, 'Eva')).toBe('visitor');
    expect(isHouseName('La casa del lago')).toBe(true);
    expect(isHouseName('<script>')).toBe(false);
  });
});
