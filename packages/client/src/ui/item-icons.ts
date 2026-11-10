import { drawItem, itemVariant } from '@fenix/art';
import type { ItemKind } from '@fenix/shared/items/item-catalog';
import { toCanvas } from '../platform/canvas';
import rawFishSprite from '../assets/raw-fish-72.png?inline';

const cache = new Map<string, string>();

/**
 * Ícono de un objeto como imagen para la interfaz HTML (se genera una sola
 * vez por variante). La cantidad cambia el dibujo del oro: de una moneda a
 * una montaña.
 */
export function itemIconUrl(kind: ItemKind, amount = 1, hue?: number): string {
  // Sprite de prueba: pequeño e incrustado para que el HTML del modo solo siga siendo un archivo.
  if (kind === 'raw-fish') return rawFishSprite;
  const key = `${kind}:${itemVariant(kind, amount)}:${hue ?? ''}`;
  let url = cache.get(key);
  if (!url) {
    url = toCanvas(drawItem(kind, 'icon', amount, hue)).toDataURL();
    cache.set(key, url);
  }
  return url;
}
