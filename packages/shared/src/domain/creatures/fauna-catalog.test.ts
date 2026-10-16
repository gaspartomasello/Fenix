import { describe, expect, it } from 'vitest';
import { MOUNTS, isMountKind } from '../mounts/mount-catalog';
import { CREATURES } from './creature-catalog';
import { FAUNA_KINDS } from './fauna-catalog';

describe('fauna', () => {
  it('las presas huyen apenas las tocan y no buscan pelea', () => {
    for (const kind of ['rabbit', 'hind', 'sheep', 'raven'] as const) {
      expect(CREATURES[kind].aggroRange, kind).toBe(0);
      expect(CREATURES[kind].abilities?.fleeAt, kind).toBe(1);
    }
  });

  it('los mansos se defienden pero no atacan; las fieras atacan a quien se acerca', () => {
    for (const kind of ['cow', 'bull', 'gorilla', 'walrus'] as const) {
      expect(CREATURES[kind].aggroRange, kind).toBe(0);
      expect(CREATURES[kind].abilities?.fleeAt, kind).toBeUndefined();
    }
    for (const kind of ['grizzly', 'jaguar', 'crocodile', 'scorpion', 'lizardman'] as const)
      expect(CREATURES[kind].aggroRange, kind).toBeGreaterThan(0);
  });

  it('las serpientes y los escorpiones envenenan; el hombre lagarto pelea con lanza', () => {
    for (const kind of ['snake', 'king-cobra', 'scorpion', 'king-scorpion'] as const)
      expect(CREATURES[kind].abilities?.poison, kind).toBeDefined();
    expect(CREATURES.lizardman.humanoid).toBe(true);
    expect(CREATURES.lizardman.weapon.skill).toBe('fencing');
  });

  it('cada animal tiene nombre en español y vida', () => {
    for (const kind of FAUNA_KINDS) {
      expect(CREATURES[kind].name.length, kind).toBeGreaterThan(2);
      expect(CREATURES[kind].maxHits, kind).toBeGreaterThan(0);
      expect(CREATURES[kind].summoned, kind).toBe(false);
    }
  });

  it('el camello se compra en la caballeriza', () => {
    expect(isMountKind('camel')).toBe(true);
    expect(MOUNTS.camel.name).toBe('camello');
  });

  it('el elefante es una montura especial: la más cara y la más fuerte', () => {
    expect(isMountKind('elephant')).toBe(true);
    const others = Object.values(MOUNTS).filter((m) => m.kind !== 'elephant');
    expect(MOUNTS.elephant.price).toBeGreaterThan(Math.max(...others.map((m) => m.price)));
    expect(CREATURES.elephant.maxHits).toBeGreaterThan(
      Math.max(...others.map((m) => CREATURES[m.kind].maxHits)),
    );
    // El salvaje no busca pelea, pero se defiende.
    expect(CREATURES['wild-elephant'].aggroRange).toBe(0);
    expect(CREATURES['wild-elephant'].abilities?.fleeAt).toBeUndefined();
  });
});
