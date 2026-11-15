/**
 * Portales lunares, como en UO: uno en las afueras de cada ciudad importante,
 * siempre abiertos. Al pisarlo se elige a qué ciudad ir (en este continente o
 * en otro) y se aparece al lado del portal de esa ciudad.
 */

/** Las ciudades con portal (si el mapa las tiene). */
export const MOONGATE_TOWNS: readonly string[] = [
  'Puerto Ceniza',
  'Roca Alta',
  'Junco Verde',
  'Puerto Brasa',
  'Altamar',
  'Puerto Esmeralda',
];

/** A qué distancia del borde de la ciudad queda su portal (en casilleros): en las afueras. */
export const MOONGATE_DISTANCE = { min: 16, max: 30 } as const;
