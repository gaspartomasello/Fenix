import type { DisplayPosition, RegionData, TileMap } from '@fenix/shared/world/tile-map';
import type { FractionalPosition } from '../core/entity';
import { setDepthProjection } from './depth';
import { screenToTile, tileToScreen, type ScreenPoint } from './iso';

/** Cuánto sube en pantalla cada escalón de altura (pixeles). */
export const LEVEL_PX = 2;

/** Cuánto sube en pantalla un piso alto: lo que mide una pared (pixeles). */
export const FLOOR_PX = 50;

/**
 * Cuánto "más adelante" se dibuja cada piso: así un piso alto queda sobre
 * todo lo de su planta baja (paredes, muebles, gente adentro).
 */
const LEVEL_DEPTH = 30;

/**
 * Las lomas del terreno vistas en pantalla. Cada tile tiene una altura en
 * escalones; las esquinas del rombo toman el promedio de los cuatro tiles que
 * las comparten, así el suelo forma laderas suaves. Todo lo que se dibuja
 * sobre el suelo (personajes, árboles, objetos) sube con él.
 */
export class Ground {
  private map: TileMap | null = null;
  /** Pisos altos que no se dibujan: los de arriba del edificio donde uno está. */
  private hiddenFloors: ReadonlySet<RegionData> = new Set();

  setMap(map: TileMap | null): void {
    this.map = map;
    setDepthProjection((p) => this.depth(p));
  }

  /** Dónde se ve una posición: un piso alto, encima de su edificio y a su altura. */
  display(position: FractionalPosition): DisplayPosition {
    return this.map?.displayOf(position) ?? { x: position.x, y: position.y, level: 0 };
  }

  /** Profundidad de dibujo (en tiles): más al sur y más arriba, más adelante. */
  depth(position: FractionalPosition): number {
    const d = this.display(position);
    return d.x + d.y + d.level * LEVEL_DEPTH;
  }

  /** Qué pisos altos se esconden (los cambia el renderizador según dónde está uno). */
  setHiddenFloors(floors: ReadonlySet<RegionData>): void {
    this.hiddenFloors = floors;
  }

  /** ¿Lo que está en esta posición queda escondido (en un piso de arriba del edificio de uno)? */
  hidden(position: FractionalPosition | RegionData): boolean {
    if (this.hiddenFloors.size === 0 || !this.map) return false;
    const region = 'name' in position ? position : this.map.anchoredAt(position.x, position.y);
    return region !== undefined && this.hiddenFloors.has(region);
  }

  /**
   * Los pisos que se esconden estando en `position`: los que están arriba de
   * uno dentro del mismo edificio (como en UO, al entrar se ve el interior).
   */
  floorsAbove(position: FractionalPosition): Set<RegionData> {
    const hidden = new Set<RegionData>();
    if (!this.map) return hidden;
    const me = this.display(position);
    for (const region of this.map.anchoredFloors()) {
      if (!region.anchor || (region.floor ?? 0) <= me.level) continue;
      // El edificio, con sus paredes (la fila y la columna de cada lado).
      const x0 = region.x + region.anchor.x;
      const y0 = region.y + region.anchor.y;
      if (
        me.x >= x0 + 0.5 &&
        me.y >= y0 + 0.5 &&
        me.x <= x0 + region.width - 1.5 &&
        me.y <= y0 + region.height - 1.5
      )
        hidden.add(region);
    }
    return hidden;
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
    const d = this.display(position);
    const screen = tileToScreen(d);
    return { x: screen.x, y: screen.y - this.lift(d) - d.level * FLOOR_PX };
  }

  /** La posición del suelo que se ve en un punto de la pantalla (teniendo en cuenta las lomas). */
  pick(point: ScreenPoint): FractionalPosition {
    let tile = screenToTile(point);
    for (let i = 0; i < 4; i++) tile = screenToTile({ x: point.x, y: point.y + this.lift(tile) });
    return tile;
  }

  /**
   * Como `pick`, pero mirando primero el piso `level` (el de uno): si ahí hay
   * un piso alto, devuelve su posición de verdad; si no, la del suelo.
   */
  pickAt(point: ScreenPoint, level: number): FractionalPosition {
    if (level > 0 && this.map) {
      const up = this.pick({ x: point.x, y: point.y + level * FLOOR_PX });
      const raw = this.map.rawOf({ x: Math.round(up.x), y: Math.round(up.y) }, level);
      if (raw)
        return { x: raw.x + (up.x - Math.round(up.x)), y: raw.y + (up.y - Math.round(up.y)) };
    }
    return this.pick(point);
  }
}
