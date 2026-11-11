import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import { SKILL_KEYS } from '@fenix/shared/skills/skill-catalog';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { World } from '../world';
import { resolveBandage } from './bandage';

/** Azar con semilla (para que la prueba dé siempre lo mismo). */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('subir Primeros auxilios con vendas', () => {
  it('de 50 a 100 alcanza con unas 300 vendas (no miles)', () => {
    const map = new TileMap({
      width: 4,
      height: 4,
      terrain: new Array<Terrain>(16).fill(Terrain.Grass),
    });
    const world = new World(map, { x: 1, y: 1 });
    const random = seeded(7);
    const player = world.spawn({ id: 'a', name: 'Ana', appearance: DEFAULT_APPEARANCE }, random);
    // Sin otras habilidades que llenen el tope total.
    for (const key of SKILL_KEYS) player.skills.set(key, 0);
    player.skills.set('healing', 500);
    let bandages = 0;
    while (player.skills.get('healing') < 1000 && bandages < 2000) {
      player.combat.heal(1000);
      player.combat.takeDamage(20);
      player.pendingBandage = { targetId: player.id, resolveAt: 0 };
      resolveBandage(player, world, random);
      bandages++;
    }
    expect(player.skills.get('healing')).toBe(1000);
    expect(bandages).toBeLessThan(350);
  });
});
