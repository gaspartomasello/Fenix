import { tileDistance, type Position } from '../geometry/position';

/** Distancia máxima (en tiles) para levantar, tirar o usar un objeto en el suelo. */
export const ITEM_REACH = 2;

/** Área de la mochila en pixeles: los objetos se ubican libremente adentro, como en UO. */
export const BACKPACK_AREA = { width: 240, height: 160 } as const;
/** Tamaño de un ícono de objeto en la mochila. */
export const ITEM_ICON_SIZE = 44;
export const MAX_BACKPACK_ITEMS = 40;

export function withinReach(a: Position, b: Position): boolean {
  return tileDistance(a, b) <= ITEM_REACH;
}

/** Ajusta una posición para que el ícono quede entero dentro de la mochila. */
export function clampToBackpack({ x, y }: Position): Position {
  return {
    x: Math.round(Math.max(0, Math.min(BACKPACK_AREA.width - ITEM_ICON_SIZE, x))),
    y: Math.round(Math.max(0, Math.min(BACKPACK_AREA.height - ITEM_ICON_SIZE, y))),
  };
}
