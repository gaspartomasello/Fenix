import { ITEMS, type ItemKind } from './item-catalog';

/** Colores de tintura, como en UO: cada uno con su nombre. */
export const DYE_HUES: readonly { readonly hue: number; readonly name: string }[] = [
  { hue: 0xb02a2a, name: 'rojo' },
  { hue: 0x7a1424, name: 'bordó' },
  { hue: 0xd2702a, name: 'naranja' },
  { hue: 0xd8b23a, name: 'amarillo' },
  { hue: 0x3e8a3a, name: 'verde' },
  { hue: 0x1f5a3a, name: 'verde bosque' },
  { hue: 0x2a8a8a, name: 'turquesa' },
  { hue: 0x2a4a9a, name: 'azul' },
  { hue: 0x1a2a5a, name: 'azul marino' },
  { hue: 0x6a2a8a, name: 'violeta' },
  { hue: 0xc86a9a, name: 'rosa' },
  { hue: 0x6a4a2a, name: 'marrón' },
  { hue: 0xd8d0c0, name: 'blanco' },
  { hue: 0x7a7a7a, name: 'gris' },
  { hue: 0x2a2626, name: 'negro' },
];

export function isDyeHue(hue: number): boolean {
  return DYE_HUES.some((d) => d.hue === hue);
}

export function dyeName(hue: number): string {
  return DYE_HUES.find((d) => d.hue === hue)?.name ?? 'teñido';
}

/** ¿Se puede teñir? La ropa de tela y las piezas de cuero, sí; el metal y el hueso, no. */
export function isDyeable(kind: ItemKind): boolean {
  return ITEMS[kind].dyeable === true;
}
