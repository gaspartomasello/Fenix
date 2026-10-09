import type { EntityId, GroundItemSnapshot, Position, TileMap } from '@fenix/shared';
import { Application, Container, Rectangle } from 'pixi.js';
// Evita `eval` en Pixi: necesario en páginas con Content Security Policy estricta.
import 'pixi.js/unsafe-eval';
import type { ClientGame } from '../core/client-game';
import type { Entity } from '../core/entity';
import { CharacterView } from './character-view';
import { EffectsLayer } from './effects-layer';
import { ItemLayer } from './item-layer';
import { screenToTile, tileToScreen, type ScreenPoint } from './iso';
import { Lighting } from './lighting';
import { StaticLayer } from './static-layer';
import { TerrainLayer } from './terrain-layer';
import { TextureCache } from './texture-cache';

const ZOOM_LEVELS = [1, 1.5, 2] as const;
const GHOST_TINT = 0x8c8c9c;
/** Caja de un personaje en pantalla respecto de sus pies, para saber si se lo tocó. */
const MOBILE_HIT_BOX = { halfWidth: 16, height: 64 };
/** El personaje se dibuja un poco por debajo del centro, como en UO. */
const CAMERA_VERTICAL_OFFSET = 30;
/** Margen alrededor de la pantalla para crear objetos antes de que entren. */
const VIEW_MARGIN = 96;

/**
 * Dibuja el estado de `ClientGame` con Pixi. Solo lee el estado: nunca lo
 * modifica ni decide nada del juego.
 */
export class GameRenderer {
  private readonly app = new Application();
  private readonly textures = new TextureCache();
  private readonly world = new Container();
  /** Hechizos y flechas: van sobre la luz (brillan de noche) con la misma cámara que el mundo. */
  private readonly glowing = new Container();
  /** Terreno y entidades: lo que se oscurece de noche. */
  private readonly scene = new Container();
  private readonly entityLayer = new Container({ sortableChildren: true });
  private readonly lighting = new Lighting(this.textures);
  private readonly views = new Map<EntityId, CharacterView>();
  private terrain: TerrainLayer | null = null;
  private statics: StaticLayer | null = null;
  private readonly groundItems = new ItemLayer(this.textures, this.entityLayer);
  private readonly effects = new EffectsLayer((id, now) => {
    for (const entity of this.game.allEntities())
      if (entity.id === id) return entity.renderPosition(now);
    return null;
  });
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

  /** Tile del mundo bajo un punto de la pantalla (relativo al canvas). */
  screenToTile(point: ScreenPoint): Position {
    const tile = screenToTile(this.toWorld(point));
    return { x: Math.round(tile.x), y: Math.round(tile.y) };
  }

  /** Objeto del suelo bajo un punto de la pantalla, si hay. */
  groundItemAt(point: ScreenPoint): GroundItemSnapshot | null {
    return this.groundItems.itemAt(this.toWorld(point));
  }

  /** Criatura viva bajo un punto de la pantalla (la de más adelante si hay varias). */
  creatureAt(point: ScreenPoint): EntityId | null {
    return this.mobileAt(point, (view) => view.isAliveCreature);
  }

  /** Otra persona viva bajo un punto de la pantalla. */
  playerAt(point: ScreenPoint): EntityId | null {
    return this.mobileAt(point, (view) => view.isOtherLivingPlayer);
  }

  /** Cualquier persona (incluido uno mismo) bajo un punto de la pantalla. */
  humanAt(point: ScreenPoint): EntityId | null {
    return this.mobileAt(point, (view) => view.isHuman);
  }

  /** Personaje del pueblo bajo un punto de la pantalla. */
  npcAt(point: ScreenPoint): EntityId | null {
    return this.mobileAt(point, (view) => view.isNpc);
  }

  private mobileAt(point: ScreenPoint, accept: (view: CharacterView) => boolean): EntityId | null {
    const world = this.toWorld(point);
    let best: { id: EntityId; y: number } | null = null;
    for (const view of this.views.values()) {
      if (!accept(view)) continue;
      const { x, y } = view.feet;
      const inside =
        Math.abs(world.x - x) <= MOBILE_HIT_BOX.halfWidth * (view.spriteHeight > 70 ? 2.5 : 1) &&
        world.y <= y + 6 &&
        world.y >= y - Math.max(MOBILE_HIT_BOX.height, view.spriteHeight);
      if (inside && (!best || y > best.y)) best = { id: view.entityId, y };
    }
    return best?.id ?? null;
  }

  /** Cambia el nivel de zoom: +1 acerca, -1 aleja. */
  stepZoom(delta: 1 | -1): void {
    this.zoomIndex = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, this.zoomIndex + delta));
    this.world.scale.set(this.zoom);
    this.glowing.scale.set(this.zoom);
  }

  /** Actualiza y pinta un frame. Se llama desde el loop principal. */
  render(now: number): void {
    const self = this.game.self;
    if (!self) return;

    const targetId = this.game.targetId;
    for (const view of this.views.values())
      view.update(now, { targeted: view.entityId === targetId });
    const focus = self.renderPosition(now);
    const view = this.updateCamera(focus);
    this.terrain?.cull(view);
    this.statics?.update(view, focus);

    this.effects.update(now);
    // De fantasma el mundo se ve gris, como en UO.
    this.scene.tint = self.dead ? GHOST_TINT : 0xffffff;
    const time = this.game.worldTime();
    if (time) {
      const { width, height } = this.app.screen;
      const offset = this.world.position;
      const zoom = this.zoom;
      this.lighting.update({
        renderer: this.app.renderer,
        width,
        height,
        toScreen: (p) => ({ x: offset.x + p.x * zoom, y: offset.y + p.y * zoom }),
        zoom,
        dayProgress: time.dayProgress,
        focus,
        lights: this.statics?.visibleLights() ?? [],
        nightVision: this.game.hasEffect('night-sight'),
      });
    }
    this.app.render();
  }

  destroy(): void {
    this.unsubscribe.forEach((off) => off());
    this.views.forEach((view) => view.destroy());
    this.statics?.destroy();
    this.terrain?.destroy();
    this.lighting.destroy();
    this.textures.destroy();
    this.app.destroy(true, { children: true });
  }

  private toWorld(point: ScreenPoint): ScreenPoint {
    return {
      x: (point.x - this.world.position.x) / this.zoom,
      y: (point.y - this.world.position.y) / this.zoom,
    };
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
    this.world.addChild(this.scene);
    this.glowing.addChild(this.effects.container);
    this.app.stage.addChild(this.world, this.lighting.overlay, this.glowing);

    const map = this.game.map;
    if (map) this.setMap(map);
    for (const entity of this.game.allEntities()) this.addView(entity);
    this.groundItems.apply([...this.game.groundItems()], []);

    this.unsubscribe.push(
      this.game.on('groundItemsChanged', ({ added, removed }) =>
        this.groundItems.apply(added, removed),
      ),
      this.game.on('ready', ({ map: newMap }) => {
        this.views.forEach((view) => view.destroy());
        this.views.clear();
        this.groundItems.clear();
        this.setMap(newMap);
        for (const entity of this.game.allEntities()) this.addView(entity);
      }),
      this.game.on('entityAdded', (entity) => this.addView(entity)),
      this.game.on('spellEffect', ({ spell, casterId, targetId }) =>
        this.effects.addSpell(spell, casterId, targetId, performance.now()),
      ),
      this.game.on('arrowShot', ({ attackerId, targetId }) =>
        this.effects.addArrow(attackerId, targetId, performance.now()),
      ),
      this.game.on('entityRemoved', (id) => {
        this.views.get(id)?.destroy();
        this.views.delete(id);
      }),
    );
  }

  private setMap(map: TileMap): void {
    this.statics?.destroy();
    this.terrain?.destroy();
    this.scene.removeChildren();
    this.terrain = new TerrainLayer(map, this.textures);
    this.statics = new StaticLayer(map, this.textures, this.entityLayer);
    this.scene.addChild(this.terrain.container, this.entityLayer);
  }

  private addView(entity: Entity): void {
    if (this.views.has(entity.id)) return;
    const view = new CharacterView(entity, this.textures, entity.id === this.game.self?.id);
    this.views.set(entity.id, view);
    this.entityLayer.addChild(view.container);
  }

  /** Centra la cámara y devuelve el rectángulo visible en coordenadas del mundo. */
  private updateCamera(focus: { x: number; y: number }): Rectangle {
    const center = tileToScreen(focus);
    const { width, height } = this.app.screen;
    const zoom = this.zoom;
    const offsetX = Math.round(width / 2 - center.x * zoom);
    const offsetY = Math.round(height / 2 + CAMERA_VERTICAL_OFFSET - center.y * zoom);
    this.world.position.set(offsetX, offsetY);
    this.glowing.position.set(offsetX, offsetY);
    return new Rectangle(
      (-offsetX - VIEW_MARGIN) / zoom,
      (-offsetY - VIEW_MARGIN) / zoom,
      (width + VIEW_MARGIN * 2) / zoom,
      (height + VIEW_MARGIN * 2) / zoom,
    );
  }
}
