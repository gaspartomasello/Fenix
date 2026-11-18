import { FURNITURE_KINDS, ITEMS, type BaseItemKind } from '../items/item-catalog';
import type { StaticKind } from '../world/statics';
import { HOUSE_PLANS, type HouseKind } from './houses';

/**
 * Los muebles de una casa, como en UO: se fabrican (carpintería), se llevan
 * en la mochila y, soltados adentro de la casa propia, quedan puestos (ocupan
 * su lugar, no se roban y se guardan con la casa). El dueño o un copropietario
 * los gira o los vuelve a guardar en la mochila.
 */

/** Hacia dónde mira cada pieza al girarla (las que no están, no se giran). */
const TURNS: readonly (readonly StaticKind[])[] = [
  ['chair-s', 'chair-w', 'chair-n', 'chair-e'],
  ['bench-x', 'bench-y'],
  ['bookshelf-x', 'bookshelf-y'],
  ['bed-x', 'bed-y'],
  ['double-bed-x', 'double-bed-y'],
  ['chest-x', 'chest-y'],
];

/** La pieza girada un cuarto de vuelta (la misma si no se gira). */
export function turned(kind: StaticKind): StaticKind {
  const cycle = TURNS.find((c) => c.includes(kind));
  if (!cycle) return kind;
  return cycle[(cycle.indexOf(kind) + 1) % cycle.length] ?? kind;
}

/** El mueble (objeto) que se vuelve a guardar al levantar una pieza puesta, o null si no es un mueble. */
export function furnitureItemOf(kind: StaticKind): BaseItemKind | null {
  const cycle = TURNS.find((c) => c.includes(kind)) ?? [kind];
  return FURNITURE_KINDS.find((item) => cycle.includes(ITEMS[item].furniture ?? 'oak')) ?? null;
}

/** Cuántos muebles entran en una casa: más en las más grandes (doce por cada cofre que trae). */
export function furnitureLimit(kind: HouseKind): number {
  return HOUSE_PLANS[kind].chests * 12;
}

/** A cuántos tiles de uno se puede poner un mueble. */
export const FURNITURE_REACH = 2;
