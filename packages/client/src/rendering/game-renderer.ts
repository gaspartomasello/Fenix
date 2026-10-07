import type { EntityId, TileMap } from '@fenix/shared';
import { Application, Container, Rectangle } from 'pixi.js';
import type { ClientGame } from '../core/client-game';
import type { Entity } from '../core/entity';
import { CharacterView } from './character-view';
import { tileToScreen, type ScreenPoint } from './iso';
import { TerrainLayer } from './terrain-layer';
import { TextureCache } from './texture-cache';

const ZOOM_LEVELS = [1, 1.5, 2] as const;
/** El personaje se dibuja un poco por debajo del centro, como en UO. */
const CAMERA_VERTICAL_OFFSET = 30;

/**
 * Dibuja el estado de `ClientGame` con Pixi. Solo lee el estado: nunca lo
 * modifica ni decide nada del juego.
 */
export class GameRenderer {
  private readonly app = new Application();
  private readonly textures = new TextureCache();
  private readonly world = new Container();
  private readonly entityLayer = new Container({ sortableChildren: true });
  private readonly views = new Map<EntityId, CharacterView>();
  private terrain: TerrainLayer | null = null;
  private zoomIndex = 0;
  private readonly unsubscribe: (() => void)[] = [];

  private constructor(private readonly game: ClientGame) {}

  static async create(host: HTMLElement, game: ClientGame): Promise<GameRenderer> {
    const renderer = new GameRenderer(game);
    await renderer.init(host);
    return renderer;
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  /** Dónde está el personaje propio en la pantalla (para apuntar con el mouse). */
  selfScreenPosition(): ScreenPoint {
    return {
      x: this.app.screen.width / 2,
      y: this.app.screen.height / 2 + CAMERA_VERTICAL_OFFSET - 30 * this.zoom,
    };
  }

  /** Cambia el nivel de zoom: +1 acerca, -1 aleja. */
  stepZoom(delta: 1 | -1): void {
    this.zoomIndex = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, this.zoomIndex + delta));
    this.world.scale.set(this.zoom);
  }

  /** Actualiza y pinta un frame. Se llama desde el loop principal. */
  render(now: number): void {
    const self = this.game.self;
    if (!self) return;

    for (const view of this.views.values()) view.update(now);
    this.updateCamera(self, now);
    this.app.render();
  }

  destroy(): void {
    this.unsubscribe.forEach((off) => off());
    this.views.forEach((view) => view.destroy());
    this.terrain?.destroy();
    this.textures.destroy();
    this.app.destroy(true, { children: true });
  }

  private get zoom(): number {
    return ZOOM_LEVELS[this.zoomIndex] ?? 1;
  }

  private async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: 0x0b1a26,
      antialias: false,
      roundPixels: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    // El loop lo maneja la aplicación: Pixi solo renderiza cuando se le pide.
    this.app.ticker.stop();
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);

    const map = this.game.map;
    if (map) this.setMap(map);
    for (const entity of this.game.allEntities()) this.addView(entity);

    this.unsubscribe.push(
      this.game.on('ready', ({ map: newMap }) => {
        this.views.forEach((view) => view.destroy());
        this.views.clear();
        this.setMap(newMap);
        for (const entity of this.game.allEntities()) this.addView(entity);
      }),
      this.game.on('entityAdded', (entity) => this.addView(entity)),
      this.game.on('entityRemoved', (id) => {
        this.views.get(id)?.destroy();
        this.views.delete(id);
      }),
    );
  }

  private setMap(map: TileMap): void {
    this.terrain?.destroy();
    this.world.removeChildren();
    this.terrain = new TerrainLayer(map, this.textures);
    this.world.addChild(this.terrain.container, this.entityLayer);
  }

  private addView(entity: Entity): void {
    if (this.views.has(entity.id)) return;
    const view = new CharacterView(entity, this.textures, entity.id === this.game.self?.id);
    this.views.set(entity.id, view);
    this.entityLayer.addChild(view.container);
  }

  private updateCamera(self: Entity, now: number): void {
    const focus = tileToScreen(self.renderPosition(now));
    const { width, height } = this.app.screen;
    const zoom = this.zoom;
    const offsetX = Math.round(width / 2 - focus.x * zoom);
    const offsetY = Math.round(height / 2 + CAMERA_VERTICAL_OFFSET - focus.y * zoom);
    this.world.position.set(offsetX, offsetY);

    // Rectángulo visible en coordenadas del mundo, con margen.
    const margin = 64;
    this.terrain?.cull(
      new Rectangle(
        (-offsetX - margin) / zoom,
        (-offsetY - margin) / zoom,
        (width + margin * 2) / zoom,
        (height + margin * 2) / zoom,
      ),
    );
  }
}
