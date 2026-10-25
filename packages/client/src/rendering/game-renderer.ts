import type { Position } from '@fenix/shared/geometry/position';
import type { HouseKind } from '@fenix/shared/housing/houses';
import type { MapStructure } from '@fenix/shared/world/tile-map';
import { ITEMS } from '@fenix/shared/items/item-catalog';
import type { EntityId, GroundItemSnapshot, ShipSnapshot } from '@fenix/shared/protocol/messages';
import { STATIC_CONTAINERS } from '@fenix/shared/world/statics';
import type { TileMap } from '@fenix/shared/world/tile-map';
import { Application, Container, Rectangle } from 'pixi.js';
// Evita `eval` en Pixi: necesario en páginas con Content Security Policy estricta.
import 'pixi.js/unsafe-eval';
import type { ClientGame } from '../core/client-game';
import type { Entity, FractionalPosition } from '../core/entity';
import { CharacterView, type OverheadLabels } from './character-view';
import { EffectsLayer } from './effects-layer';
import { FieldLayer } from './field-layer';
import { FloorLayer } from './floor-layer';
import { HousePreview } from './house-preview';
import { ItemLayer } from './item-layer';
import { Ground } from './ground';
import { renderResolution, type ScreenPoint } from './iso';
import { Lighting } from './lighting';
import { ShipLayer } from './ship-layer';
import { StaticLayer } from './static-layer';
import { TerrainLayer } from './terrain-layer';
import { TextureCache } from './texture-cache';

/** Niveles de zoom; el primero (más lejos) solo en el celular, donde la pantalla es chica. */
const ZOOM_LEVELS = [0.75, 1, 1.5, 2] as const;
/** El nivel con que se empieza (tamaño normal). */
const NORMAL_ZOOM = 1;
/** Tiempo por cuadro para dibujar de antemano personajes y criaturas. */
const PREPARE_BUDGET_MS = 4;
/** Distancia (en tiles) a la que se destapa a los demás detrás de árboles y paredes. */
const NEARBY_REVEAL = 4;
const GHOST_TINT = 0x8c8c9c;
/** El jinete sobre la montura: angosto y de la montura para arriba. */
const RIDER_HIT_BOX = { halfWidth: 12, bottom: 44 };
/** El personaje se dibuja un poco por debajo del centro, como en UO. */
const CAMERA_VERTICAL_OFFSET = 30;
/** Margen alrededor de la pantalla para crear objetos antes de que entren. */
const VIEW_MARGIN = 96;
/** Más allá, el terreno y los objetos se preparan de antemano, de a poco (pixeles del mundo). */
const PREPARE_MARGIN = 512;
/** Los objetos fijos se destruyen recién a esta distancia de la pantalla. */
const DISCARD_MARGIN = 768;
/** Margen para armar los pisos altos antes de que entren en pantalla (pixeles). */
const TILE_MARGIN = 256;

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
  /** Nombres, vida y textos sobre las cabezas: arriba de todo (ningún techo los tapa) y sin oscurecerse de noche. */
  private readonly labelLayer = new Container();
  /** Terreno y entidades: lo que se oscurece de noche. */
  private readonly scene = new Container();
  private readonly entityLayer = new Container({ sortableChildren: true });
  /** Las lomas del terreno: todo lo que se dibuja sobre el suelo sube con ellas. */
  private readonly ground = new Ground();
  private readonly lighting = new Lighting(this.textures, this.ground);
  private readonly views = new Map<EntityId, CharacterView>();
  private readonly labels: OverheadLabels = { names: true, numbers: true };
  private terrain: TerrainLayer | null = null;
  private statics: StaticLayer | null = null;
  private floors: FloorLayer | null = null;
  private readonly groundItems = new ItemLayer(this.textures, this.entityLayer, this.ground);
  private readonly fields = new FieldLayer(this.textures, this.entityLayer, this.ground);
  private readonly ships = new ShipLayer(this.textures, this.ground);
  /** La casa que se está por levantar (mientras se elige el lugar). */
  private readonly housePreview = new HousePreview(this.textures, this.ground);
  /** Lo que ocupa cada casa armada (para volver a dibujar el suelo al sacarla). */
  private readonly builtAreas = new Map<string, readonly [number, number, number, number]>();
  private readonly effects = new EffectsLayer((id, now) => {
    for (const entity of this.game.allEntities())
      if (entity.id === id) return entity.renderPosition(now);
    return null;
  }, this.ground);
  private zoomIndex = NORMAL_ZOOM;
  private minZoomIndex = NORMAL_ZOOM;
  private containerMap: TileMap | null = null;
  private containerTiles = new Set<string>();
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
    // Desde un piso alto se apunta primero a ese piso; si ahí no hay, a la calle.
    const self = this.game.self;
    const level = self ? this.ground.display(self.position).level : 0;
    const tile = this.ground.pickAt(this.toWorld(point), level);
    return { x: Math.round(tile.x), y: Math.round(tile.y) };
  }

  /** Levanta un objeto del suelo (se deja de ver) mientras se lo arrastra. */
  liftGroundItem(id: EntityId): () => void {
    return this.groundItems.lift(id);
  }

  /** El barco bajo un punto de la pantalla (un tile de su cubierta). */
  shipAt(point: ScreenPoint): ShipSnapshot | undefined {
    return this.game.shipAt(this.screenToTile(point));
  }

  /**
   * Los tiles bajo un punto de la pantalla y un poco más adelante (lo alto de
   * un objeto sube sobre su tile y tapa los de atrás): `lifts` en pixeles.
   */
  tilesUnder(point: ScreenPoint, lifts: readonly number[]): Position[] {
    return lifts.map((lift) => this.screenToTile({ x: point.x, y: point.y + lift * this.zoom }));
  }

  /** Texto del cartel bajo un punto de la pantalla (el poste sube un poco sobre su tile). */
  signAt(point: ScreenPoint): string | null {
    const map = this.game.map;
    if (!map) return null;
    for (const lift of [0, 14, 28]) {
      const text = map.signAt(this.screenToTile({ x: point.x, y: point.y + lift * this.zoom }));
      if (text) return text;
    }
    return null;
  }

  /**
   * La puerta bajo un punto de la pantalla: la del tile o la de uno o dos
   * tiles más adelante (la puerta sube sobre su tile y tapa los de atrás).
   */
  doorAt(point: ScreenPoint): Position | null {
    const map = this.game.map;
    if (!map) return null;
    for (const lift of [0, 14, 28, 42]) {
      const tile = this.screenToTile({ x: point.x, y: point.y + lift * this.zoom });
      if (map.doorAt(tile)) return tile;
    }
    return null;
  }

  /**
   * El mueble que guarda cosas (cofre, barril, biblioteca…) bajo un punto de
   * la pantalla: el del tile o uno un poco más adelante (sube sobre su tile).
   */
  containerAt(point: ScreenPoint): Position | null {
    const map = this.game.map;
    if (!map) return null;
    if (this.containerMap !== map) {
      this.containerMap = map;
      this.containerTiles = new Set(
        map.statics.filter((s) => STATIC_CONTAINERS[s.kind]).map((s) => `${s.x},${s.y}`),
      );
    }
    for (const lift of [0, 14, 28]) {
      const tile = this.screenToTile({ x: point.x, y: point.y + lift * this.zoom });
      if (this.containerTiles.has(`${tile.x},${tile.y}`)) return tile;
    }
    return null;
  }

  /** Objeto del suelo bajo un punto de la pantalla, si hay. */
  groundItemAt(point: ScreenPoint): GroundItemSnapshot | null {
    return this.groundItems.itemAt(this.toWorld(point));
  }

  /** Criatura viva bajo un punto de la pantalla (la de más adelante si hay varias). */
  creatureAt(point: ScreenPoint): EntityId | null {
    return this.mobileAt(point, (view) => view.isAliveCreature);
  }

  /** La montura suelta propia bajo un punto de la pantalla. */
  ownPetAt(point: ScreenPoint): EntityId | null {
    return this.mobileAt(point, (view) => view.isOwnPet && !view.isCreatureCorpse);
  }

  /**
   * Uno mismo bajo un punto de la pantalla. Montado cuenta solo el jinete
   * (no todo el caballo), para no bajarse por tocar algo que está al lado.
   */
  selfAt(point: ScreenPoint): EntityId | null {
    const self = this.game.self;
    const view = self ? this.views.get(self.id) : undefined;
    if (!self || !view) return null;
    if (!self.mount) return this.mobileAt(point, (v) => v === view);
    const world = this.toWorld(point);
    const { x, y } = view.feet;
    const inside =
      Math.abs(world.x - x) <= RIDER_HIT_BOX.halfWidth &&
      world.y <= y - RIDER_HIT_BOX.bottom &&
      world.y >= y - view.spriteHeight;
    return inside ? self.id : null;
  }

  corpseAt(point: ScreenPoint): EntityId | null {
    return this.mobileAt(point, (view) => view.isCreatureCorpse);
  }

  /** Otra persona viva bajo un punto de la pantalla. */
  playerAt(point: ScreenPoint): EntityId | null {
    return this.mobileAt(point, (view) => view.isOtherLivingPlayer);
  }

  /** Cualquier persona (incluido uno mismo, salvo con `self` en false) bajo un punto de la pantalla. */
  humanAt(point: ScreenPoint, self = true): EntityId | null {
    return this.mobileAt(point, (view) => view.isHuman && (self || !view.isSelf));
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
      const box = view.hitBox;
      const inside =
        Math.abs(world.x - x) <= box.halfWidth && world.y <= y + box.down && world.y >= y - box.up;
      if (inside && (!best || y > best.y)) best = { id: view.entityId, y };
    }
    return best?.id ?? null;
  }

  /** En el celular se puede alejar un nivel más que en la computadora. */
  allowFarZoom(): void {
    this.minZoomIndex = 0;
  }

  /** Cambia el nivel de zoom: +1 acerca, -1 aleja. */
  stepZoom(delta: 1 | -1): void {
    this.zoomIndex = Math.max(
      this.minZoomIndex,
      Math.min(ZOOM_LEVELS.length - 1, this.zoomIndex + delta),
    );
    this.world.scale.set(this.zoom);
    this.glowing.scale.set(this.zoom);
  }

  /** Actualiza y pinta un frame. Se llama desde el loop principal. */
  render(now: number): void {
    const self = this.game.self;
    if (!self) return;

    const targetId = this.game.targetId;
    for (const view of this.views.values())
      view.update(now, {
        targeted: view.entityId === targetId,
        hidden: view.isSelf && this.game.hidden,
        seat: this.game.map?.seatAt(view.tile),
      });
    const focus = self.renderPosition(now);
    // Adentro de un edificio no se ven sus pisos de arriba (ni su techo).
    this.ground.setHiddenFloors(this.ground.floorsAbove(focus));
    const view = this.updateCamera(focus);
    const near = grown(view, PREPARE_MARGIN);
    this.terrain?.cull(view, near);
    this.floors?.update(grown(view, TILE_MARGIN));
    this.groundItems.refreshHidden();
    // Lo que tapa a uno mismo o a quien esté cerca (por ejemplo, un orco que
    // ataca escondido detrás de un árbol) se vuelve translúcido.
    const nearby: FractionalPosition[] = [focus];
    for (const entity of this.game.allEntities()) {
      if (entity.id === self.id || entity.dead) continue;
      const p = entity.renderPosition(now);
      if (Math.max(Math.abs(p.x - focus.x), Math.abs(p.y - focus.y)) <= NEARBY_REVEAL)
        nearby.push(p);
    }
    // También los cofres fijos de cerca (los de las casas, pegados a la pared de adelante).
    for (const item of this.game.groundItems()) {
      const p = item.position;
      if (!ITEMS[item.kind].fixed || !ITEMS[item.kind].capacity) continue;
      if (Math.max(Math.abs(p.x - focus.x), Math.abs(p.y - focus.y)) <= NEARBY_REVEAL)
        nearby.push(p);
    }
    this.statics?.update(view, nearby, near, grown(view, DISCARD_MARGIN));

    this.effects.update(now);
    this.fields.update(now);
    this.ships.update();
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
        carried: this.carriedLights(now),
        nightVision: this.game.hasEffect('night-sight'),
        underground: this.game.currentRegion()?.dungeon === true,
      });
    }
    // Entre cuadro y cuadro, se adelantan unos milisegundos de dibujo de
    // personajes, criaturas, terreno y objetos que están por entrar.
    this.textures.pump(PREPARE_BUDGET_MS);
    this.app.render();
  }

  /** Quienes llevan una antorcha o un farol en la mano: alumbran a su alrededor. */
  private *carriedLights(now: number): Iterable<{ at: FractionalPosition; radius: number }> {
    yield* this.fields.lights();
    for (const entity of this.game.allEntities()) {
      const held = entity.equipment.leftHand;
      const radius = held ? ITEMS[held].light : undefined;
      if (radius && !entity.dead) yield { at: entity.renderPosition(now), radius };
    }
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
    return ZOOM_LEVELS[this.zoomIndex] ?? ZOOM_LEVELS[NORMAL_ZOOM];
  }

  private async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: 0x0b1a26,
      antialias: false,
      roundPixels: true,
      autoDensity: true,
      resolution: renderResolution(window.devicePixelRatio),
    });
    // El loop lo maneja la aplicación: Pixi solo renderiza cuando se le pide.
    this.app.ticker.stop();
    // Cada textura nueva se sube a la placa de video al dibujarla (de a poco,
    // entre cuadros) y no toda junta en el cuadro en que aparece.
    this.textures.onCreate = (texture) => this.app.renderer.texture.initSource(texture.source);
    host.appendChild(this.app.canvas);
    this.world.addChild(this.scene);
    this.glowing.addChild(this.effects.container, this.labelLayer);
    this.app.stage.addChild(this.world, this.lighting.overlay, this.glowing);

    const map = this.game.map;
    if (map) this.setMap(map);
    for (const entity of this.game.allEntities()) this.addView(entity);
    this.groundItems.apply([...this.game.groundItems()], []);
    this.fields.apply([...this.game.groundItems()], []);

    this.unsubscribe.push(
      this.game.on('groundItemsChanged', ({ added, removed }) => {
        this.groundItems.apply(added, removed);
        this.fields.apply(added, removed);
      }),
      this.game.on('doorChanged', ({ position }) => this.statics?.refreshDoor(position)),
      this.game.on('ready', ({ map: newMap }) => {
        this.views.forEach((view) => view.destroy());
        this.views.clear();
        this.groundItems.clear();
        this.fields.clear();
        this.ships.clear();
        this.setMap(newMap);
        for (const entity of this.game.allEntities()) this.addView(entity);
      }),
      this.game.on('entityAdded', (entity) => this.addView(entity)),
      this.game.on('spellEffect', ({ spell, casterId, targetId }) =>
        this.effects.addSpell(spell, casterId, targetId, performance.now()),
      ),
      this.game.on('shipsChanged', (ships) => this.ships.apply(ships)),
      this.game.on('housesChanged', ({ added, removed }) => {
        for (const id of removed) this.unbuild(id);
        for (const house of added) {
          const structure = this.game.map?.structure(house.id);
          if (structure) this.build(structure);
        }
        this.floors?.sync();
      }),
      this.game.on('cannonShot', ({ from, to, hit }) =>
        this.effects.addShot(from, to, hit, performance.now()),
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

  /** Muestra la casa que se levantaría centrada en `center` (verde si se puede). */
  showHousePreview(kind: HouseKind, center: Position, valid: boolean): void {
    this.housePreview.show(kind, center, valid);
  }

  hideHousePreview(): void {
    this.housePreview.hide();
  }

  /** Dibuja lo construido (una casa): sus objetos y el piso nuevo. */
  private build(structure: MapStructure): void {
    this.statics?.addStructure(structure.id, structure.statics);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const t of structure.terrain) {
      x0 = Math.min(x0, t.x);
      y0 = Math.min(y0, t.y);
      x1 = Math.max(x1, t.x);
      y1 = Math.max(y1, t.y);
    }
    if (x0 <= x1) {
      this.builtAreas.set(structure.id, [x0, y0, x1, y1]);
      this.terrain?.invalidate(x0, y0, x1, y1);
    }
  }

  private unbuild(id: string): void {
    this.statics?.removeStructure(id);
    const area = this.builtAreas.get(id);
    this.builtAreas.delete(id);
    if (area) this.terrain?.invalidate(...area);
  }

  private setMap(map: TileMap): void {
    this.statics?.destroy();
    this.terrain?.destroy();
    this.floors?.destroy();
    this.scene.removeChildren();
    this.ground.setMap(map);
    this.terrain = new TerrainLayer(map, this.textures, this.ground);
    this.floors = new FloorLayer(map, this.textures, this.entityLayer, this.ground);
    this.statics = new StaticLayer(map, this.textures, this.entityLayer, this.ground);
    this.builtAreas.clear();
    // Lo que ya estaba construido en el mapa (las casas que llegaron antes de dibujar).
    for (const structure of map.structures()) this.build(structure);
    this.scene.addChild(
      this.terrain.container,
      this.ships.container,
      this.entityLayer,
      this.housePreview.container,
    );
  }

  /** Nombres y números de daño sobre las cabezas: sí o no (opciones del jugador). */
  setLabels(labels: OverheadLabels): void {
    // Las vistas leen este mismo objeto: el cambio se ve en el próximo cuadro.
    Object.assign(this.labels, labels);
  }

  private addView(entity: Entity): void {
    if (this.views.has(entity.id)) return;
    const view = new CharacterView(
      entity,
      this.textures,
      entity.id === this.game.self?.id,
      this.ground,
      this.game.isOwnPet(entity.id),
      this.labels,
    );
    this.views.set(entity.id, view);
    this.entityLayer.addChild(view.container);
    this.labelLayer.addChild(view.labels);
  }

  /** Centra la cámara y devuelve el rectángulo visible en coordenadas del mundo. */
  private updateCamera(focus: { x: number; y: number }): Rectangle {
    const center = this.ground.toScreen(focus);
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

/** Un rectángulo agrandado `margin` pixeles hacia cada lado. */
function grown(rect: Rectangle, margin: number): Rectangle {
  return new Rectangle(
    rect.x - margin,
    rect.y - margin,
    rect.width + margin * 2,
    rect.height + margin * 2,
  );
}
