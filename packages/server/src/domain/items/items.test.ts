import { MAX_BACKPACK_ITEMS, Terrain, TileMap } from '@fenix/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { Items } from './items';

const G = Terrain.Grass;
const W = Terrain.Water;
// Pasillo de 6 tiles con agua al final.
const map = new TileMap({ width: 6, height: 1, terrain: [G, G, G, G, G, W] });
const ana = { id: 'ana', position: { x: 0, y: 0 } };

describe('Items', () => {
  let items: Items;

  beforeEach(() => {
    items = new Items();
  });

  it('levanta un objeto cercano a la mochila', () => {
    items.add('i1', 'short-sword', 1, { type: 'ground', position: { x: 2, y: 0 } });
    const result = items.move(ana, 'i1', { type: 'backpack' }, map);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes.groundRemoved).toEqual([{ id: 'i1', position: { x: 2, y: 0 } }]);
    expect(result.changes.message).toBe('Levantaste una espada corta.');
    expect(items.backpackOf('ana').map((i) => i.id)).toEqual(['i1']);
  });

  it('no deja levantar lo que está lejos ni tocar lo ajeno', () => {
    items.add('far', 'apple', 1, { type: 'ground', position: { x: 3, y: 0 } });
    items.add('his', 'apple', 1, { type: 'backpack', ownerId: 'bruno', position: { x: 0, y: 0 } });
    expect(items.move(ana, 'far', { type: 'backpack' }, map)).toEqual({
      ok: false,
      reason: 'Está demasiado lejos.',
    });
    expect(items.move(ana, 'his', { type: 'backpack' }, map)).toEqual({
      ok: false,
      reason: 'Eso no es tuyo.',
    });
  });

  it('tira al suelo solo en tiles cercanos y transitables', () => {
    items.add('i1', 'apple', 1, { type: 'backpack', ownerId: 'ana', position: { x: 0, y: 0 } });
    const far = { id: 'ana', position: { x: 4, y: 0 } };
    expect(items.move(far, 'i1', { type: 'ground', position: { x: 5, y: 0 } }, map).ok).toBe(false);
    expect(items.move(ana, 'i1', { type: 'ground', position: { x: 4, y: 0 } }, map).ok).toBe(false);
    const result = items.move(ana, 'i1', { type: 'ground', position: { x: 1, y: 0 } }, map);
    expect(result.ok && result.changes.groundAdded.map((i) => i.id)).toEqual(['i1']);
  });

  it('junta lo apilable en la mochila', () => {
    items.add('bag', 'gold', 50, { type: 'backpack', ownerId: 'ana', position: { x: 0, y: 0 } });
    items.add('pile', 'gold', 25, { type: 'ground', position: { x: 1, y: 0 } });
    items.move(ana, 'pile', { type: 'backpack' }, map);
    expect(items.get('pile')).toBeUndefined();
    expect(items.get('bag')?.amount).toBe(75);
  });

  it('equipa en el lugar correcto y guarda lo que había puesto', () => {
    items.add('dagger', 'dagger', 1, { type: 'equipment', ownerId: 'ana', slot: 'rightHand' });
    items.add('sword', 'short-sword', 1, {
      type: 'backpack',
      ownerId: 'ana',
      position: { x: 0, y: 0 },
    });
    expect(items.move(ana, 'sword', { type: 'equipment', slot: 'head' }, map)).toEqual({
      ok: false,
      reason: 'Eso no se puede poner ahí.',
    });
    const result = items.move(ana, 'sword', { type: 'equipment', slot: 'rightHand' }, map);
    expect(result.ok && [...result.changes.looks]).toEqual(['ana']);
    expect(items.lookOf('ana')).toEqual({ rightHand: 'short-sword' });
    expect(items.get('dagger')?.location.type).toBe('backpack');
  });

  it('con doble clic se come, se bebe y se pone o se saca', () => {
    items.add('apples', 'apple', 2, { type: 'backpack', ownerId: 'ana', position: { x: 0, y: 0 } });
    items.add('cap', 'leather-cap', 1, {
      type: 'backpack',
      ownerId: 'ana',
      position: { x: 44, y: 0 },
    });

    const eat = items.use(ana, 'apples');
    expect(eat.ok && eat.changes.consumed).toBe('apple');
    expect(items.get('apples')?.amount).toBe(1);
    items.use(ana, 'apples');
    expect(items.get('apples')).toBeUndefined();

    items.use(ana, 'cap');
    expect(items.lookOf('ana')).toEqual({ head: 'leather-cap' });
    items.use(ana, 'cap');
    expect(items.lookOf('ana')).toEqual({});
  });

  it('respeta el límite de la mochila', () => {
    for (let i = 0; i < MAX_BACKPACK_ITEMS; i++) {
      items.add(`b${i}`, 'dagger', 1, {
        type: 'backpack',
        ownerId: 'ana',
        position: { x: 0, y: 0 },
      });
    }
    items.add('extra', 'axe', 1, { type: 'ground', position: { x: 0, y: 0 } });
    expect(items.move(ana, 'extra', { type: 'backpack' }, map)).toEqual({
      ok: false,
      reason: 'Tu mochila está llena.',
    });
  });

  it('borra lo que lleva un jugador al salir, pero no lo del suelo', () => {
    items.add('mine', 'apple', 1, { type: 'backpack', ownerId: 'ana', position: { x: 0, y: 0 } });
    items.add('floor', 'apple', 1, { type: 'ground', position: { x: 0, y: 0 } });
    items.removeOwnedBy('ana');
    expect(items.get('mine')).toBeUndefined();
    expect(items.get('floor')).toBeDefined();
  });
});
