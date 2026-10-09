import type { Appearance } from '../domain/character/appearance';
import type { Direction } from '../domain/geometry/direction';
import type { Position } from '../domain/geometry/position';
import type { EquipmentSlot } from '../domain/items/equipment';
import type { ItemKind } from '../domain/items/item-catalog';
import type { WorldTime } from '../domain/rules/daylight';
import type { MoveMode } from '../domain/rules/movement';
import type { TileMapData } from '../domain/world/tile-map';

export type EntityId = string;

/** Lo que se ve puesto un personaje: qué objeto hay en cada lugar del cuerpo. */
export type EquipmentLook = Partial<Readonly<Record<EquipmentSlot, ItemKind>>>;

/** Lo que un cliente necesita saber de otro jugador para mostrarlo. */
export interface PlayerSnapshot {
  readonly id: EntityId;
  readonly name: string;
  readonly position: Position;
  readonly direction: Direction;
  readonly appearance: Appearance;
  readonly equipment: EquipmentLook;
}

export interface ItemSnapshot {
  readonly id: EntityId;
  readonly kind: ItemKind;
  readonly amount: number;
}

export interface GroundItemSnapshot extends ItemSnapshot {
  readonly position: Position;
}

/** Objeto en la mochila; `position` es su lugar en pixeles dentro de la ventana. */
export interface BackpackItemSnapshot extends ItemSnapshot {
  readonly position: Position;
}

export interface EquippedItemSnapshot extends ItemSnapshot {
  readonly slot: EquipmentSlot;
}

/** A dónde se mueve un objeto al soltarlo. */
export type ItemDestination =
  | { readonly type: 'ground'; readonly position: Position }
  | { readonly type: 'backpack'; readonly position?: Position }
  | { readonly type: 'equipment'; readonly slot: EquipmentSlot };

// ── Cliente → Servidor ────────────────────────────────────────────────

export interface JoinRequest {
  readonly type: 'join';
  readonly name: string;
  readonly appearance: Appearance;
}

export interface MoveRequest {
  readonly type: 'move';
  readonly direction: Direction;
  readonly mode: MoveMode;
  /** Número de secuencia para reconciliar la predicción del cliente. */
  readonly seq: number;
}

export interface ChatRequest {
  readonly type: 'chat';
  readonly text: string;
}

export interface MoveItemRequest {
  readonly type: 'moveItem';
  readonly itemId: EntityId;
  readonly to: ItemDestination;
}

/** Doble clic: comer, beber, equipar o sacarse un objeto. */
export interface UseItemRequest {
  readonly type: 'useItem';
  readonly itemId: EntityId;
}

export type ClientMessage =
  JoinRequest | MoveRequest | ChatRequest | MoveItemRequest | UseItemRequest;

// ── Servidor → Cliente ────────────────────────────────────────────────

export interface WelcomeMessage {
  readonly type: 'welcome';
  readonly selfId: EntityId;
  readonly map: TileMapData;
  /** Jugadores dentro del rango de visión (incluido el propio). */
  readonly players: readonly PlayerSnapshot[];
  readonly time: WorldTime;
}

export interface JoinRejectedMessage {
  readonly type: 'joinRejected';
  readonly reason: string;
}

/** Un jugador entró en el rango de visión (o al mundo, cerca). */
export interface PlayerAppearedMessage {
  readonly type: 'playerAppeared';
  readonly player: PlayerSnapshot;
}

/** Un jugador salió del rango de visión (o del mundo). */
export interface PlayerDisappearedMessage {
  readonly type: 'playerDisappeared';
  readonly id: EntityId;
}

export interface PlayerMovedMessage {
  readonly type: 'playerMoved';
  readonly id: EntityId;
  readonly position: Position;
  readonly direction: Direction;
  readonly mode: MoveMode;
}

/** Paso aceptado. `position` es la posición autoritativa tras el paso. */
export interface MoveAckMessage {
  readonly type: 'moveAck';
  readonly seq: number;
  readonly position: Position;
}

/** El servidor rechazó un paso: el cliente debe volver a esta posición. */
export interface MoveRejectedMessage {
  readonly type: 'moveRejected';
  readonly seq: number;
  readonly position: Position;
  readonly direction: Direction;
}

export interface ChatMessage {
  readonly type: 'chat';
  readonly id: EntityId;
  readonly name: string;
  readonly text: string;
}

/** Cambios en los objetos del suelo dentro del rango de visión. */
export interface GroundItemsMessage {
  readonly type: 'groundItems';
  readonly added: readonly GroundItemSnapshot[];
  readonly removed: readonly EntityId[];
}

/** Contenido completo de la mochila y el equipo propios. */
export interface InventoryMessage {
  readonly type: 'inventory';
  readonly backpack: readonly BackpackItemSnapshot[];
  readonly equipment: readonly EquippedItemSnapshot[];
}

/** Cambió lo que se ve puesto un jugador. */
export interface PlayerEquipmentMessage {
  readonly type: 'playerEquipment';
  readonly id: EntityId;
  readonly equipment: EquipmentLook;
}

export interface SystemMessage {
  readonly type: 'system';
  readonly text: string;
}

export type ServerMessage =
  | WelcomeMessage
  | JoinRejectedMessage
  | PlayerAppearedMessage
  | PlayerDisappearedMessage
  | PlayerMovedMessage
  | MoveAckMessage
  | MoveRejectedMessage
  | ChatMessage
  | GroundItemsMessage
  | InventoryMessage
  | PlayerEquipmentMessage
  | SystemMessage;

export type ServerMessageType = ServerMessage['type'];
