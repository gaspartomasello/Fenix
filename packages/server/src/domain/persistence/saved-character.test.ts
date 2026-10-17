import { DEFAULT_APPEARANCE, Terrain, TileMap } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { World } from '../world';
import { captureCharacter, parseSavedCharacter, restoreCharacter } from './saved-character';

function worldWithId(mapId: string): World {
  const map = new TileMap({
    width: 20,
    height: 20,
    terrain: new Array<Terrain>(400).fill(Terrain.Grass),
  });
  return new World(map, { x: 2, y: 2 }, mapId);
}

describe('personaje guardado y cambio de mundo', () => {
  it('vuelve a su lugar en el mismo mundo, pero en otro mundo aparece en la capital', () => {
    let n = 0;
    const id = () => `p${n++}`;
    const old = worldWithId('mundo-viejo');
    const player = old.spawn({ id: id(), name: 'Ana', appearance: DEFAULT_APPEARANCE }, () => 0);
    player.teleport({ x: 15, y: 15 });
    const saved = parseSavedCharacter(
      JSON.parse(JSON.stringify(captureCharacter(player, old, null))),
    );
    if (!saved) throw new Error('no se pudo leer');
    expect(saved.world).toBe('mundo-viejo');

    const same = restoreCharacter(saved, worldWithId('mundo-viejo'), id, () => 0, 0);
    expect(same.position).toEqual({ x: 15, y: 15 });

    const other = restoreCharacter(saved, worldWithId('mundo-nuevo'), id, () => 0, 0);
    expect(Math.abs(other.position.x - 2) + Math.abs(other.position.y - 2)).toBeLessThan(6);
  });
});
