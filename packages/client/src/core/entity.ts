import {
  OVERHEAD_TEXT_DURATION_MS,
  type Appearance,
  type Body,
  type Direction,
  type EntityId,
  type EquipmentLook,
  type NpcRole,
  type MobileSnapshot,
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

/** Número de daño (o "¡Falla!") que sube y se desvanece sobre la cabeza. */
export interface CombatText {
  readonly text: string;
  readonly kind: 'damage-taken' | 'damage-dealt' | 'miss' | 'heal';
  readonly startedAt: number;
}

/** Embestida corta hacia el objetivo al golpear. */
interface Lunge {
  readonly dx: number;
  readonly dy: number;
  readonly startedAt: number;
}

export const COMBAT_TEXT_MS = 1200;
export const LUNGE_MS = 220;

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
  private _equipment: EquipmentLook;
  readonly body: Body;
  /** Oficio si es un personaje del pueblo. */
  readonly npc: NpcRole | null;
  private _health: number;
  private _dead: boolean;
  private _combatTexts: CombatText[] = [];
  private lunge: Lunge | null = null;

  constructor(snapshot: MobileSnapshot) {
    this.id = snapshot.id;
    this.name = snapshot.name;
    this.appearance = snapshot.appearance;
    this._position = snapshot.position;
    this._direction = snapshot.direction;
    this._equipment = snapshot.equipment;
    this.body = snapshot.body;
    this.npc = snapshot.npc;
    this._health = snapshot.health;
    this._dead = snapshot.dead;
  }

  get health(): number {
    return this._health;
  }

  get dead(): boolean {
    return this._dead;
  }

  setHealth(health: number, dead: boolean): void {
    this._health = health;
    this._dead = dead;
  }

  get combatTexts(): readonly CombatText[] {
    return this._combatTexts;
  }

  addCombatText(text: string, kind: CombatText['kind'], now: number): void {
    this._combatTexts = [...this._combatTexts, { text, kind, startedAt: now }].slice(-4);
  }

  /** Inicia una embestida hacia `toward` (en tiles). */
  lungeToward(toward: FractionalPosition, now: number): void {
    const dx = Math.sign(toward.x - this._position.x);
    const dy = Math.sign(toward.y - this._position.y);
    this.lunge = { dx, dy, startedAt: now };
  }

  /** Desplazamiento de la embestida en tiles (sube y baja en LUNGE_MS). */
  lungeOffset(now: number): FractionalPosition {
    if (!this.lunge) return { x: 0, y: 0 };
    const t = (now - this.lunge.startedAt) / LUNGE_MS;
    if (t >= 1) {
      this.lunge = null;
      return { x: 0, y: 0 };
    }
    const amount = Math.sin(t * Math.PI) * 0.25;
    return { x: this.lunge.dx * amount, y: this.lunge.dy * amount };
  }

  /** Lo que tiene puesto (se ve sobre el personaje). */
  get equipment(): EquipmentLook {
    return this._equipment;
  }

  setEquipment(equipment: EquipmentLook): void {
    this._equipment = equipment;
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
    this._combatTexts = this._combatTexts.filter((t) => now - t.startedAt < COMBAT_TEXT_MS);
    return this._overhead.length !== before;
  }
}
