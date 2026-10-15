import juncoVerde from '../maps/junco-verde.json';
import puertoCeniza from '../maps/puerto-ceniza.json';
import rocaAlta from '../maps/roca-alta.json';
import objetos from '../tilesets/objetos.json';
import terreno from '../tilesets/terreno.json';

export * from './tiled-format';

/**
 * Archivos de Tiled tal como están en disco. Se exportan como `unknown`:
 * quien los use debe validarlos (ver el cargador del servidor).
 */
export const TOWN_MAP: unknown = puertoCeniza;

/** Los pueblos del continente: la capital y los de la montaña y el pantano. */
export const TOWN_MAPS: Readonly<Record<'puerto-ceniza' | 'roca-alta' | 'junco-verde', unknown>> = {
  'puerto-ceniza': puertoCeniza,
  'roca-alta': rocaAlta,
  'junco-verde': juncoVerde,
};

/** Tilesets indexados por el nombre de archivo con el que los referencia el mapa. */
export const TILESETS: Readonly<Record<string, unknown>> = {
  'terreno.json': terreno,
  'objetos.json': objetos,
};
