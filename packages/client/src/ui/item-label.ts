import { describeItem, type ItemSnapshot } from '@fenix/shared';

/** Nombre de un objeto para la interfaz: "3 manzanas"; una runa dice qué lugar guarda y un libro, su título. */
export function itemLabel(item: ItemSnapshot): string {
  const base = describeItem(item.kind, item.amount);
  if (item.kind === 'book')
    return item.bookTitle ? `libro: «${item.bookTitle}»` : 'libro en blanco';
  if (item.kind !== 'rune') return base;
  return item.mark
    ? `${base}: ${item.mark.label} (${item.mark.x}, ${item.mark.y})`
    : `${base} en blanco`;
}
