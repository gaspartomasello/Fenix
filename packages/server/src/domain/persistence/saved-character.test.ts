import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
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
  it('guarda las flechas y conserva el valor por defecto de personajes viejos', () => {
    const world = worldWithId('mundo');
    const player = world.spawn({ id: 'p1', name: 'Ana', appearance: DEFAULT_APPEARANCE }, () => 0);
    player.skills.setDirection('fishing', 'down');
    player.skills.setDirection('magery', 'lock');
    const saved = parseSavedCharacter(
      JSON.parse(JSON.stringify(captureCharacter(player, world, null))),
    );
    if (!saved) throw new Error('no se pudo leer');
    const restored = restoreCharacter(
      saved,
      worldWithId('mundo'),
      () => 'p2',
      () => 0,
      0,
    );
    expect(restored.skills.direction('fishing')).toBe('down');
    expect(restored.skills.direction('magery')).toBe('lock');
    const old = { ...saved };
    delete old.skillDirections;
    const legacy = restoreCharacter(
      old,
      worldWithId('mundo'),
      () => 'p3',
      () => 0,
      0,
    );
    expect(legacy.skills.direction('fishing')).toBe('up');
  });
});
