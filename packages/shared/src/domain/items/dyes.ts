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

/** Una familia de colores del panel de la tina: un tono con todos sus matices. */
export interface DyeFamily {
  readonly name: string;
  /** De más claro a más oscuro. */
  readonly hues: readonly number[];
}

/** Los tonos del panel (como el de UO): cada uno con su nombre y su ángulo de color. */
const FAMILIES: readonly (readonly [string, number])[] = [
  ['rojo', 0],
  ['bermellón', 16],
  ['naranja', 30],
  ['ámbar', 42],
  ['amarillo', 54],
  ['lima', 76],
  ['verde', 110],
  ['esmeralda', 145],
  ['verde mar', 165],
  ['turquesa', 182],
  ['celeste', 200],
  ['azul', 220],
  ['añil', 240],
  ['violeta', 265],
  ['púrpura', 285],
  ['magenta', 305],
  ['rosa', 330],
  ['carmesí', 348],
];

/** Matices de cada tono, de más claro a más oscuro: [nombre, luz, saturación]. */
const SHADES: readonly (readonly [string, number, number])[] = [
  ['pálido', 0.8, 0.45],
  ['claro', 0.66, 0.55],
  ['', 0.52, 0.62],
  ['intenso', 0.42, 0.72],
  ['oscuro', 0.32, 0.6],
  ['muy oscuro', 0.22, 0.5],
  ['sombrío', 0.14, 0.35],
];

/** Grises: del blanco al negro. */
const GRAYS: readonly (readonly [string, number])[] = [
  ['blanco', 0.9],
  ['perla', 0.78],
  ['gris claro', 0.64],
  ['gris', 0.5],
  ['gris oscuro', 0.38],
  ['pizarra', 0.27],
  ['carbón', 0.18],
  ['negro', 0.1],
];

/** Color de luz `l`, saturación `s` y ángulo `h` (grados) en 0xRRGGBB. */
function hsl(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number): number => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (channel(0) << 16) | (channel(8) << 8) | channel(4);
}

/**
 * El panel de colores de la tina, como el de UO: cada tono con siete
 * matices, y los grises. Son todos los colores con que se puede teñir.
 */
export const DYE_FAMILIES: readonly DyeFamily[] = [
  ...FAMILIES.map(([name, angle]) => ({
    name,
    hues: SHADES.map(([, light, saturation]) => hsl(angle, saturation, light)),
  })),
  { name: 'gris', hues: GRAYS.map(([, light]) => hsl(0, 0, light)) },
];

const NAMES = new Map<number, string>([
  ...FAMILIES.flatMap(([name, angle]) =>
    SHADES.map(([shade, light, saturation]): [number, string] => [
      hsl(angle, saturation, light),
      shade ? `${name} ${shade}` : name,
    ]),
  ),
  ...GRAYS.map(([name, light]): [number, string] => [hsl(0, 0, light), name]),
  // Los de antes siguen valiendo (lo que ya se tiñó con ellos).
  ...DYE_HUES.map(({ hue, name }): [number, string] => [hue, name]),
]);

/** ¿Es uno de los colores con que se puede teñir? */
export function isDyeHue(hue: number): boolean {
  return NAMES.has(hue);
}

export function dyeName(hue: number): string {
  return NAMES.get(hue) ?? 'teñido';
}

/** ¿Se puede teñir? La ropa de tela y las piezas de cuero, sí; el metal y el hueso, no. */
export function isDyeable(kind: ItemKind): boolean {
  return ITEMS[kind].dyeable === true;
}
