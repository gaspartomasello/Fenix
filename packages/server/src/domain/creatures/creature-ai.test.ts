import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { World } from '../world';
import { Creature } from './creature';
import { updateTarget } from './creature-ai';

const map = new TileMap({ width: 30, height: 30, terrain: new Array(900).fill(Terrain.Grass) });

describe('a quién atacan las criaturas', () => {
  it('un lobo ataca al mercenario de alguien (no solo a las personas)', () => {
    const world = new World(map, { x: 2, y: 2 });
    const owner = world.spawn({ id: 'ana', name: 'Ana', appearance: DEFAULT_APPEARANCE }, () => 0);
    owner.teleport({ x: 25, y: 25 });
    const merc = new Creature(
      'merc',
      'sellsword',
      { x: 10, y: 10 },
      { ownerId: 'ana', expiresAt: null },
    );
    world.addCreature(merc);
    const wolf = new Creature('lobo', 'wolf', { x: 12, y: 10 });
    world.addCreature(wolf);
    expect(updateTarget(wolf, world)).toBe(merc);
  });
});
