import { Terrain, type RegionData, type TileMap } from '@fenix/shared';
import { Container, Rectangle, Sprite } from 'pixi.js';
import { projectedDepth } from './depth';
import type { Ground } from './ground';
import { ART_SCALE, TILE_HALF } from './iso';
import { variantFor } from './terrain-layer';
import type { TextureCache } from './texture-cache';

interface Floor {
  readonly region: RegionData;
  readonly bounds: Rectangle;
  container: Container | null;
}

/**
 * El suelo de los pisos altos, dibujado encima de su edificio (a la altura de
 * las paredes), como en UO: desde un piso se ve la calle y desde la calle se
 * ven los pisos y las azoteas. Va en la capa ordenada, por delante de todo lo
 * de la planta baja de su edificio y por detrás de lo que hay en el mismo piso.
 */
export class FloorLayer {
  private readonly floors: Floor[];

  constructor(
    private readonly map: TileMap,
    private readonly textures: TextureCache,
    private readonly target: Container,
    private readonly ground: Ground,
  ) {
    this.floors = map.anchoredFloors().map((region) => ({
      region,
      bounds: boundsOf(region, ground),
      container: null,
    }));
  }

  /** Arma los pisos que entran en pantalla y esconde los de arriba del edificio de uno. */
  update(view: Rectangle): void {
    for (const floor of this.floors) {
      const visible = floor.bounds.intersects(view);
      if (visible && !floor.container) floor.container = this.build(floor.region);
      if (floor.container) floor.container.visible = visible && !this.ground.hidden(floor.region);
    }
  }

  destroy(): void {
    for (const floor of this.floors) floor.container?.destroy({ children: true });
  }

  private build(region: RegionData): Container {
    const container = new Container();
    const { map } = this;
    for (let y = region.y; y < region.y + region.height; y++)
      for (let x = region.x; x < region.x + region.width; x++) {
        const terrain = map.terrainAt({ x, y });
        // La roca de alrededor es el vacío: no se dibuja.
        if (terrain === undefined || terrain === Terrain.Rock) continue;
        const same = (t: Terrain | undefined): Terrain | undefined =>
          t === terrain ? t : undefined;
        const texture = this.textures.terrain(terrain, variantFor(x, y), {
          north: same(map.terrainAt({ x, y: y - 1 })),
          east: same(map.terrainAt({ x: x + 1, y })),
          south: same(map.terrainAt({ x, y: y + 1 })),
          west: same(map.terrainAt({ x: x - 1, y })),
        });
        const sprite = new Sprite(texture);
        const screen = this.ground.toScreen({ x, y });
        sprite.anchor.set(0.5);
        sprite.scale.set(ART_SCALE);
        sprite.position.set(screen.x, screen.y);
        container.addChild(sprite);
      }
    // Todo el piso va antes que lo que hay parado en él (la profundidad de su esquina de atrás).
    container.zIndex = projectedDepth({ x: region.x, y: region.y }) * 10 - 1;
    this.target.addChild(container);
    return container;
  }
}

function boundsOf(region: RegionData, ground: Ground): Rectangle {
  const corners = [
    { x: region.x, y: region.y },
    { x: region.x + region.width, y: region.y },
    { x: region.x, y: region.y + region.height },
    { x: region.x + region.width, y: region.y + region.height },
  ].map((p) =>
    ground.toScreen({
      x: Math.min(p.x, region.x + region.width - 1),
      y: Math.min(p.y, region.y + region.height - 1),
    }),
  );
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs) - TILE_HALF * 2;
  const minY = Math.min(...ys) - TILE_HALF * 2;
  return new Rectangle(
    minX,
    minY,
    Math.max(...xs) + TILE_HALF * 2 - minX,
    Math.max(...ys) + TILE_HALF * 2 - minY,
  );
}
