import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_LABELS, discover, mapLabels, visibleLabels } from './map-labels';

const map = new TileMap({
  width: 200,
  height: 60,
  terrain: new Array<Terrain>(200 * 60).fill(Terrain.Grass),
  regions: [
    { name: 'Puerto Ceniza', x: 0, y: 0, width: 30, height: 30 },
    { name: 'Cruce del Lobo', x: 60, y: 10, width: 9, height: 9, wild: true },
    { name: 'Chacra del Ombú', x: 100, y: 10, width: 19, height: 19, wild: true, hidden: true },
    { name: 'Cueva del Lamento', x: 160, y: 0, width: 40, height: 60, dungeon: true },
  ],
  teleporters: [{ x: 140, y: 40, to: { x: 170, y: 20 } }],
});

describe('los nombres del mapa', () => {
  it('se separan en ciudades, mazmorras (por su boca), encrucijadas y lugares', () => {
    const labels = mapLabels(map);
    expect(labels.map((l) => [l.name, l.kind])).toEqual([
      ['Puerto Ceniza', 'town'],
      ['Cruce del Lobo', 'crossroad'],
      ['Chacra del Ombú', 'place'],
      ['Cueva del Lamento', 'dungeon'],
    ]);
    expect(labels.find((l) => l.kind === 'dungeon')?.at).toEqual({ x: 140, y: 40 });
  });

  it('las ciudades se ven siempre; lo demás, recién al descubrirlo', () => {
    const labels = mapLabels(map);
    const known = new Set<string>();
    expect(visibleLabels(labels, known, DEFAULT_MAP_LABELS).map((l) => l.name)).toEqual([
      'Puerto Ceniza',
    ]);
    // Pasando cerca de la chacra (no de la cueva).
    const found = discover(labels, known, { x: 95, y: 20 });
    expect(found).toEqual(['Chacra del Ombú']);
    for (const name of found) known.add(name);
    expect(visibleLabels(labels, known, DEFAULT_MAP_LABELS).map((l) => l.name)).toEqual([
      'Puerto Ceniza',
      'Chacra del Ombú',
    ]);
  });

  it('cada categoría se puede ocultar (las encrucijadas, ocultas de entrada)', () => {
    const labels = mapLabels(map);
    const known = new Set(['Cruce del Lobo', 'Cueva del Lamento']);
    expect(visibleLabels(labels, known, DEFAULT_MAP_LABELS).map((l) => l.name)).toEqual([
      'Puerto Ceniza',
      'Cueva del Lamento',
    ]);
    const all = { town: false, dungeon: true, crossroad: true, place: true };
    expect(visibleLabels(labels, known, all).map((l) => l.name)).toEqual([
      'Cruce del Lobo',
      'Cueva del Lamento',
    ]);
  });
});
