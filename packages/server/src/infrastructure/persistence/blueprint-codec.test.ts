import { describe, expect, it } from 'vitest';
import { planWorld, worldFromBlueprint } from '../content/world-builder';
import { SequentialIds } from '../../test-support/fakes';
import { packBlueprint, unpackBlueprint } from './blueprint-codec';

describe('el mundo guardado del modo solo', () => {
  const blueprint = planWorld({ size: 96, seed: 7 });

  it('empaquetado y desempaquetado queda igual que recién generado', () => {
    const packed = packBlueprint(blueprint);
    // Así lo guarda el navegador (IndexedDB copia con structuredClone).
    const back = unpackBlueprint(structuredClone(packed));
    expect(back).toEqual(blueprint);
    expect(packed.terrain).toBeInstanceOf(Uint8Array);
  });

  it('lo guardado de otra forma no se usa', () => {
    expect(unpackBlueprint(null)).toBeNull();
    expect(unpackBlueprint({ version: 0 })).toBeNull();
  });

  it('del plano sale el mundo vivo, con su gente y sus criaturas', () => {
    const world = worldFromBlueprint(blueprint, new SequentialIds());
    expect(world.mapId).toBe(blueprint.mapId);
    expect(world.allNpcs().length).toBe(blueprint.npcs.length);
  });
});
