import {
  OVERHEAD_TEXT_DURATION_MS,
  type Appearance,
  type Direction,
  type EntityId,
  type PlayerSnapshot,
  type Position,
} from '@fenix/shared';

/** Posición en tiles con decimales: la que se usa para dibujar entre dos tiles. */
export interface FractionalPosition {
  readonly x: number;
  readonly y: number;
}

interface Movement {
  readonly from: FractionalPosition;
  readonly startedAt: number;
  readonly duration: number;
}

export interface OverheadText {
  readonly text: string;
  readonly expiresAt: number;
}

const MAX_OVERHEAD_TEXTS = 3;

/**
 * Fracción extra de paso en la que se sigue considerando "caminando", para
 * que la animación no parpadee entre dos pasos consecutivos.
 */
const STEP_GRACE = 0.25;

/** Estado de un personaje visible, tal como lo conoce el cliente. */
export class Entity {
  readonly id: EntityId;
  readonly name: string;
  readonly appearance: Appearance;
  private _position: Position;
  private _direction: Direction;
  private movement: Movement | null = null;
  private _stepCount = 0;
  private _overhead: OverheadText[] = [];

  constructor(snapshot: PlayerSnapshot) {
    this.id = snapshot.id;
    this.name = snapshot.name;
    this.appearance = snapshot.appearance;
    this._position = snapshot.position;
    this._direction = snapshot.direction;
  }

  /** Tile lógico actual (destino del paso en curso). */
  get position(): Position {
    return this._position;
  }

  get direction(): Direction {
    return this._direction;
  }

  /** Cantidad de pasos dados: alterna la pierna en la animación. */
  get stepCount(): number {
    return this._stepCount;
  }

  get overheadTexts(): readonly OverheadText[] {
    return this._overhead;
  }

  /** Inicia un paso animado desde donde se esté dibujando ahora hacia `to`. */
  moveTo(to: Position, direction: Direction, duration: number, now: number): void {
    this.movement = { from: this.renderPosition(now), startedAt: now, duration };
    this._position = to;
    this._direction = direction;
    this._stepCount += 1;
  }

  /** Coloca al personaje sin animación (correcciones del servidor). */
  teleport(to: Position, direction: Direction): void {
    this.movement = null;
    this._position = to;
    this._direction = direction;
  }

  face(direction: Direction): void {
    this._direction = direction;
  }

  /** Progreso del paso actual en [0, 1]; null si está quieto. */
  stepProgress(now: number): number | null {
    if (!this.movement) return null;
    const t = (now - this.movement.startedAt) / this.movement.duration;
    if (t >= 1 + STEP_GRACE) return null;
    return Math.min(1, Math.max(0, t));
  }

  renderPosition(now: number): FractionalPosition {
    const progress = this.stepProgress(now);
    if (progress === null || !this.movement) return this._position;
    const { from } = this.movement;
    return {
      x: from.x + (this._position.x - from.x) * progress,
      y: from.y + (this._position.y - from.y) * progress,
    };
  }

  say(text: string, now: number): void {
    this._overhead = [
      ...this._overhead,
      { text, expiresAt: now + OVERHEAD_TEXT_DURATION_MS },
    ].slice(-MAX_OVERHEAD_TEXTS);
  }

  /** Quita los textos vencidos. Devuelve true si cambió algo. */
  pruneOverhead(now: number): boolean {
    const before = this._overhead.length;
    this._overhead = this._overhead.filter((t) => t.expiresAt > now);
    return this._overhead.length !== before;
  }
}
