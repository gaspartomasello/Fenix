import { drawItem } from '@fenix/art';
import type { ItemKind } from '@fenix/shared';
import { toCanvas } from '../platform/canvas';

const cache = new Map<ItemKind, string>();

/** Ícono de un objeto como imagen para la interfaz HTML (se genera una sola vez). */
export function itemIconUrl(kind: ItemKind): string {
  let url = cache.get(kind);
  if (!url) {
    url = toCanvas(drawItem(kind)).toDataURL();
    cache.set(kind, url);
  }
  return url;
}
