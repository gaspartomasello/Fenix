import {
  TileMap,
  advanceTime,
  moveDuration,
  sanitizeChatText,
  type BackpackItemSnapshot,
  type Direction,
  type EntityId,
  type EquippedItemSnapshot,
  type GroundItemSnapshot,
  type ItemDestination,
  type MoveMode,
  type RegionData,
  type ServerMessage,
  type WorldTime,
} from '@fenix/shared';
import { Entity } from './entity';
import { EventEmitter } from './event-emitter';
import { MovementPredictor } from './movement-predictor';
import type { ServerGateway } from './ports';

export type LogKind = 'chat' | 'system';

export interface LogEntry {
  readonly kind: LogKind;
  readonly author?: string;
  readonly text: string;
}

export interface ClientGameEvents extends Record<string, unknown> {
  /** Se recibió el mundo inicial: ya se puede dibujar. */
  ready: { selfId: EntityId; map: TileMap };
  joinRejected: { reason: string };
  log: LogEntry;
  entityAdded: Entity;
  entityRemoved: EntityId;
  /** Cambiaron los objetos del suelo a la vista. */
  groundItemsChanged: { added: readonly GroundItemSnapshot[]; removed: readonly EntityId[] };
  /** Cambió la mochila o el equipo propio. */
  inventoryChanged: Inventory;
}

export interface Inventory {
  readonly backpack: readonly BackpackItemSnapshot[];
  readonly equipment: readonly EquippedItemSnapshot[];
}

/**
 * Estado del juego en el cliente y reglas de cómo cambia con cada mensaje
 * del servidor o acción del jugador. No sabe nada de dibujo ni de red.
 */
export class ClientGame extends EventEmitter<ClientGameEvents> {
  private readonly entities = new Map<EntityId, Entity>();
  private _map: TileMap | null = null;
  private selfId: EntityId | null = null;
  private predictor: MovementPredictor | null = null;
  private time: { value: WorldTime; receivedAt: number } | null = null;
  private readonly ground = new Map<EntityId, GroundItemSnapshot>();
  private _inventory: Inventory = { backpack: [], equipment: [] };

  constructor(
    private readonly gateway: ServerGateway,
    private readonly clock: () => number,
  ) {
    super();
  }

  get map(): TileMap | null {
    return this._map;
  }

  get self(): Entity | undefined {
    return this.selfId ? this.entities.get(this.selfId) : undefined;
  }

  allEntities(): IterableIterator<Entity> {
    return this.entities.values();
  }

  get inventory(): Inventory {
    return this._inventory;
  }

  groundItems(): IterableIterator<GroundItemSnapshot> {
    return this.ground.values();
  }

  /** Busca un objeto propio (mochila o equipo) o del suelo por id. */
  findItem(
    itemId: EntityId,
  ): GroundItemSnapshot | BackpackItemSnapshot | EquippedItemSnapshot | undefined {
    return (
      this.ground.get(itemId) ??
      this._inventory.backpack.find((i) => i.id === itemId) ??
      this._inventory.equipment.find((i) => i.id === itemId)
    );
  }

  /** Jugadores a la vista, incluido el propio. */
  get visibleCount(): number {
    return this.entities.size;
  }

  /** Hora actual del mundo, extrapolada desde la que envió el servidor. */
  worldTime(): WorldTime | null {
    if (!this.time) return null;
    return advanceTime(this.time.value, this.clock() - this.time.receivedAt);
  }

  /** Zona con nombre donde está el jugador, si hay alguna. */
  currentRegion(): RegionData | undefined {
    const self = this.self;
    return self ? this._map?.regionAt(self.position) : undefined;
  }

  // ── Acciones del jugador ────────────────────────────────────────────

  requestStep(direction: Direction, mode: MoveMode): void {
    const self = this.self;
    if (!self || !this.predictor) return;
    const request = this.predictor.tryStep(self, direction, mode, this.clock());
    if (request) this.gateway.send(request);
  }

  say(rawText: string): void {
    const text = sanitizeChatText(rawText);
    if (text && this.self) this.gateway.send({ type: 'chat', text });
  }

  /** Arrastrar y soltar un objeto. El servidor decide si se puede. */
  moveItem(itemId: EntityId, to: ItemDestination): void {
    if (this.self) this.gateway.send({ type: 'moveItem', itemId, to });
  }

  /** Doble clic sobre un objeto. */
  useItem(itemId: EntityId): void {
    if (this.self) this.gateway.send({ type: 'useItem', itemId });
  }

  /** Mantenimiento por frame: vence textos sobre las cabezas. */
  update(): void {
    const now = this.clock();
    for (const entity of this.entities.values()) entity.pruneOverhead(now);
  }

  // ── Mensajes del servidor ───────────────────────────────────────────

  apply(message: ServerMessage): void {
    const now = this.clock();
    switch (message.type) {
      case 'welcome': {
        this.entities.clear();
        this.ground.clear();
        this._map = new TileMap(message.map);
        this.selfId = message.selfId;
        this.predictor = new MovementPredictor(this._map);
        this.time = { value: message.time, receivedAt: now };
        message.players.forEach((p) => this.addEntity(new Entity(p)));
        this.emit('ready', { selfId: message.selfId, map: this._map });
        break;
      }
      case 'joinRejected':
        this.emit('joinRejected', { reason: message.reason });
        break;
      case 'playerAppeared':
        if (!this.entities.has(message.player.id)) this.addEntity(new Entity(message.player));
        break;
      case 'playerDisappeared':
        if (message.id !== this.selfId && this.entities.delete(message.id)) {
          this.emit('entityRemoved', message.id);
        }
        break;
      case 'playerMoved': {
        const entity = this.entities.get(message.id);
        if (entity && message.id !== this.selfId) {
          entity.moveTo(message.position, message.direction, moveDuration(message.mode), now);
        }
        break;
      }
      case 'moveAck':
        if (this.self) this.predictor?.acknowledge(this.self, message.seq, message.position);
        break;
      case 'moveRejected':
        this.predictor?.reject();
        this.self?.teleport(message.position, message.direction);
        break;
      case 'chat':
        this.entities.get(message.id)?.say(message.text, now);
        this.emit('log', { kind: 'chat', author: message.name, text: message.text });
        break;
      case 'system':
        this.emit('log', { kind: 'system', text: message.text });
        break;
      case 'groundItems':
        for (const id of message.removed) this.ground.delete(id);
        for (const item of message.added) this.ground.set(item.id, item);
        this.emit('groundItemsChanged', { added: message.added, removed: message.removed });
        break;
      case 'inventory':
        this._inventory = { backpack: message.backpack, equipment: message.equipment };
        this.emit('inventoryChanged', this._inventory);
        break;
      case 'playerEquipment':
        this.entities.get(message.id)?.setEquipment(message.equipment);
        break;
    }
  }

  private addEntity(entity: Entity): void {
    this.entities.set(entity.id, entity);
    this.emit('entityAdded', entity);
  }
}
