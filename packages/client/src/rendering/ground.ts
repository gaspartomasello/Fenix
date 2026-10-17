import type { TileMap } from '@fenix/shared';
import type { FractionalPosition } from '../core/entity';
import { screenToTile, tileToScreen, type ScreenPoint } from './iso';

/** Cuánto sube en pantalla cada escalón de altura (pixeles). */
export const LEVEL_PX = 2;

/**
 * Las lomas del terreno vistas en pantalla. Cada tile tiene una altura en
 * escalones; las esquinas del rombo toman el promedio de los cuatro tiles que
 * las comparten, así el suelo forma laderas suaves. Todo lo que se dibuja
 * sobre el suelo (personajes, árboles, objetos) sube con él.
 */
export class Ground {
  private map: TileMap | null = null;

  setMap(map: TileMap | null): void {
    this.map = map;
  }

  /** Altura (pixeles) de la esquina de vértice (i, j): la esquina de arriba del tile (i, j). */
  corner(i: number, j: number): number {
    const map = this.map;
    if (!map) return 0;
    const sum =
      map.heightAt({ x: i - 1, y: j - 1 }) +
      map.heightAt({ x: i, y: j - 1 }) +
      map.heightAt({ x: i - 1, y: j }) +
      map.heightAt({ x: i, y: j });
    return (sum / 4) * LEVEL_PX;
  }

  /** Altura (pixeles) del suelo en una posición, interpolada entre las esquinas. */
  lift({ x, y }: FractionalPosition): number {
    if (!this.map) return 0;
    const u = x + 0.5;
    const v = y + 0.5;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = u - i;
    const fv = v - j;
    const top = this.corner(i, j) * (1 - fu) + this.corner(i + 1, j) * fu;
    const bottom = this.corner(i, j + 1) * (1 - fu) + this.corner(i + 1, j + 1) * fu;
    return top * (1 - fv) + bottom * fv;
  }

  /** Punto en pantalla (del mundo, antes de la cámara) de una posición sobre el suelo. */
  toScreen(position: FractionalPosition): ScreenPoint {
    const screen = tileToScreen(position);
    return { x: screen.x, y: screen.y - this.lift(position) };
  }

  /** La posición del suelo que se ve en un punto de la pantalla (teniendo en cuenta las lomas). */
  pick(point: ScreenPoint): FractionalPosition {
    let tile = screenToTile(point);
    for (let i = 0; i < 4; i++) tile = screenToTile({ x: point.x, y: point.y + this.lift(tile) });
    return tile;
  }
}
