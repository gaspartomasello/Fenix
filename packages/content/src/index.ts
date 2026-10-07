import puertoCeniza from '../maps/puerto-ceniza.json';
import objetos from '../tilesets/objetos.json';
import terreno from '../tilesets/terreno.json';

export * from './tiled-format';

/**
 * Archivos de Tiled tal como están en disco. Se exportan como `unknown`:
 * quien los use debe validarlos (ver el cargador del servidor).
 */
export const TOWN_MAP: unknown = puertoCeniza;

/** Tilesets indexados por el nombre de archivo con el que los referencia el mapa. */
export const TILESETS: Readonly<Record<string, unknown>> = {
  'terreno.json': terreno,
  'objetos.json': objetos,
};
