import {
  canStep,
  moveDuration,
  positionsEqual,
  step,
  type Direction,
  type MoveMode,
  type MoveRequest,
  type Position,
  type TileMap,
} from '@fenix/shared';
import type { Entity } from './entity';

/** Máximo de pasos sin confirmar antes de esperar al servidor. */
export const MAX_PENDING_STEPS = 4;

/**
 * Predicción del lado del cliente: el jugador propio se mueve al instante
 * y el servidor confirma (`moveAck`) o corrige (`moveRejected`) después.
 * Aplica las mismas reglas que el servidor para que las correcciones sean raras.
 */
export class MovementPredictor {
  private seq = 0;
  private readonly pending = new Set<number>();
  private nextStepAt = 0;

  constructor(private readonly map: TileMap) {}

  get pendingCount(): number {
    return this.pending.size;
  }

  /** Devuelve el mensaje a enviar, o null si todavía no puede dar el paso. */
  tryStep(self: Entity, direction: Direction, mode: MoveMode, now: number): MoveRequest | null {
    if (now < this.nextStepAt || this.pending.size >= MAX_PENDING_STEPS) return null;
    // Sobre la boca de una cueva (u otro teletransporte) se espera a que el
    // servidor nos lleve: no se predicen pasos desde un lugar que vamos a dejar.
    if (this.pending.size > 0 && this.map.teleportAt(self.position)) return null;

    const duration = moveDuration(mode);
    this.nextStepAt = now + duration;
    this.seq += 1;
    this.pending.add(this.seq);

    if (canStep(this.map, self.position, direction)) {
      self.moveTo(step(self.position, direction), direction, duration, now, mode);
    } else {
      // Contra un obstáculo el personaje solo gira, igual que en el servidor.
      self.face(direction);
    }
    return { type: 'move', direction, mode, seq: this.seq };
  }

  /**
   * Confirma un paso. Cuando ya no quedan pasos sin confirmar, la posición
   * del servidor es la verdad: si difiere de la predicha, se corrige.
   */
  acknowledge(self: Entity, seq: number, serverPosition: Position): void {
    this.pending.delete(seq);
    if (this.pending.size === 0 && !positionsEqual(self.position, serverPosition)) {
      self.teleport(serverPosition, self.direction);
    }
  }

  /** El servidor rechazó un paso: se descarta toda la predicción pendiente. */
  reject(): void {
    this.pending.clear();
  }
}
