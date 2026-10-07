import {
  canStep,
  moveDuration,
  step,
  type Appearance,
  type Direction,
  type EntityId,
  type MoveMode,
  type PlayerSnapshot,
  type Position,
  type TileMap,
} from '@fenix/shared';

/**
 * Cuánto antes de su turno puede llegar un paso (jitter de red) y cuánto
 * "crédito" se recupera tras estar quieto. Acotan la ventaja de un speedhack
 * sin castigar conexiones con latencia irregular.
 */
export const MOVE_EARLY_TOLERANCE_MS = 150;
export const MOVE_IDLE_CREDIT_MS = 200;

export type MoveOutcome = { ok: true } | { ok: false; reason: 'too-fast' | 'blocked' };

export interface PlayerProps {
  readonly id: EntityId;
  readonly name: string;
  readonly appearance: Appearance;
  readonly position: Position;
  readonly direction: Direction;
}

export class Player {
  readonly id: EntityId;
  readonly name: string;
  readonly appearance: Appearance;
  private _position: Position;
  private _direction: Direction;
  private nextMoveAt = 0;

  constructor(props: PlayerProps) {
    this.id = props.id;
    this.name = props.name;
    this.appearance = props.appearance;
    this._position = props.position;
    this._direction = props.direction;
  }

  get position(): Position {
    return this._position;
  }

  get direction(): Direction {
    return this._direction;
  }

  /** Intenta dar un paso. Aun si el paso es bloqueado, el personaje gira. */
  tryMove(map: TileMap, direction: Direction, mode: MoveMode, now: number): MoveOutcome {
    if (this.nextMoveAt - now > MOVE_EARLY_TOLERANCE_MS) {
      return { ok: false, reason: 'too-fast' };
    }
    this._direction = direction;
    if (!canStep(map, this._position, direction)) {
      return { ok: false, reason: 'blocked' };
    }
    this._position = step(this._position, direction);
    this.nextMoveAt = Math.max(this.nextMoveAt, now - MOVE_IDLE_CREDIT_MS) + moveDuration(mode);
    return { ok: true };
  }

  toSnapshot(): PlayerSnapshot {
    return {
      id: this.id,
      name: this.name,
      position: this._position,
      direction: this._direction,
      appearance: this.appearance,
    };
  }
}
