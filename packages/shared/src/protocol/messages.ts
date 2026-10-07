import type { Appearance } from '../domain/character/appearance';
import type { Direction } from '../domain/geometry/direction';
import type { Position } from '../domain/geometry/position';
import type { MoveMode } from '../domain/rules/movement';
import type { TileMapData } from '../domain/world/tile-map';

export type EntityId = string;

/** Lo que un cliente necesita saber de otro jugador para mostrarlo. */
export interface PlayerSnapshot {
  readonly id: EntityId;
  readonly name: string;
  readonly position: Position;
  readonly direction: Direction;
  readonly appearance: Appearance;
}

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

export type ClientMessage = JoinRequest | MoveRequest | ChatRequest;

// ── Servidor → Cliente ────────────────────────────────────────────────

export interface WelcomeMessage {
  readonly type: 'welcome';
  readonly selfId: EntityId;
  readonly map: TileMapData;
  readonly players: readonly PlayerSnapshot[];
}

export interface JoinRejectedMessage {
  readonly type: 'joinRejected';
  readonly reason: string;
}

export interface PlayerJoinedMessage {
  readonly type: 'playerJoined';
  readonly player: PlayerSnapshot;
}

export interface PlayerLeftMessage {
  readonly type: 'playerLeft';
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

export interface SystemMessage {
  readonly type: 'system';
  readonly text: string;
}

export type ServerMessage =
  | WelcomeMessage
  | JoinRejectedMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | PlayerMovedMessage
  | MoveAckMessage
  | MoveRejectedMessage
  | ChatMessage
  | SystemMessage;

export type ServerMessageType = ServerMessage['type'];
