import { describe, expect, it } from 'vitest';
import { planWorld } from '../content/world-builder';
import { packBlueprint, unpackBlueprint } from './blueprint-codec';
import { decodeWorldFile, encodeWorldFile } from './world-file';

describe('el archivo del mundo del modo solo', () => {
  it('guarda y lee el mismo mundo, con su clave', () => {
    const blueprint = planWorld({ size: 96, seed: 7 });
    const bytes = encodeWorldFile(packBlueprint(blueprint), 'clave-1');
    const read = decodeWorldFile(bytes);
    expect(read?.key).toBe('clave-1');
    const back = unpackBlueprint(read?.packed);
    expect(back?.map.terrain).toEqual(blueprint.map.terrain);
    expect(back?.map.heights).toEqual(blueprint.map.heights);
    expect(back?.map.regions).toEqual(blueprint.map.regions);
    expect(back?.spawnPoint).toEqual(blueprint.spawnPoint);
    const key = (s: { kind: string; x: number; y: number }): string => `${s.y}:${s.x}:${s.kind}`;
    expect(back?.map.statics.map(key).sort()).toEqual(blueprint.map.statics.map(key).sort());
  });

  it('no confunde otra cosa con un mundo', () => {
    expect(decodeWorldFile(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(decodeWorldFile(new TextEncoder().encode('<!doctype html><html></html>'))).toBeNull();
  });
});
