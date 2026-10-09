import { drawItem, itemVariant } from '@fenix/art';
import type { ItemKind } from '@fenix/shared';
import { toCanvas } from '../platform/canvas';

const cache = new Map<string, string>();

/**
 * Ícono de un objeto como imagen para la interfaz HTML (se genera una sola
 * vez por variante). La cantidad cambia el dibujo del oro: de una moneda a
 * una montaña.
 */
export function itemIconUrl(kind: ItemKind, amount = 1): string {
  const key = `${kind}:${itemVariant(kind, amount)}`;
  let url = cache.get(key);
  if (!url) {
    url = toCanvas(drawItem(kind, 'icon', amount)).toDataURL();
    cache.set(key, url);
  }
  return url;
}
