import {
  PLAYER_ATTRIBUTES,
  STARTING_SKILLS,
  type SpellKey,
  RUN_STEPS_PER_STAMINA,
  canStep,
  moveDuration,
  step,
  type Appearance,
  type Direction,
  type EntityId,
  type MoveMode,
  type MobileSnapshot,
  type Position,
  type SkillValues,
  type TileMap,
} from '@fenix/shared';
import { Combatant } from './combat/combatant';
import { SkillSet } from './skills/skill-set';
import { Reputation } from './social/reputation';
import type { Mobile } from './mobile';

/**
 * Cuánto antes de su turno puede llegar un paso (jitter de red) y cuánto
 * "crédito" se recupera tras estar quieto. Acotan la ventaja de un speedhack
 * sin castigar conexiones con latencia irregular.
 */
export const MOVE_EARLY_TOLERANCE_MS = 150;
export const MOVE_IDLE_CREDIT_MS = 200;

export type MoveOutcome = { ok: true } | { ok: false; reason: 'too-fast' | 'blocked' };

export interface PendingCast {
  readonly spell: SpellKey;
  /** A quién va (uno mismo en los que no eligen objetivo). */
  readonly targetId: EntityId;
  /** A qué lugar va (teletransporte). */
  readonly position?: Position;
  readonly resolveAt: number;
}

export interface PlayerProps {
  readonly id: EntityId;
  readonly name: string;
  readonly appearance: Appearance;
  readonly position: Position;
  readonly direction: Direction;
  /** Habilidades guardadas; un personaje nuevo empieza con las iniciales. */
  readonly skills?: SkillValues;
}

export class Player implements Mobile {
  readonly id: EntityId;
  readonly name: string;
  readonly body = 'human' as const;
  readonly appearance: Appearance;
  readonly combat = new Combatant(PLAYER_ATTRIBUTES);
  readonly skills: SkillSet;
  readonly reputation = new Reputation();
  /** Hechizo que está lanzando, que se resuelve en `resolveAt`. */
  pendingCast: PendingCast | null = null;
  /** Venda que está poniendo, que termina en `resolveAt`. */
  pendingBandage: { targetId: EntityId; resolveAt: number } | null = null;
  /** Cuándo puede volver a recolectar o fabricar. */
  nextActionAt = 0;
  private runSteps = 0;
  private _position: Position;
  private _direction: Direction;
  private nextMoveAt = 0;

  constructor(props: PlayerProps) {
    this.id = props.id;
    this.name = props.name;
    this.appearance = props.appearance;
    this.skills = new SkillSet(props.skills ?? STARTING_SKILLS);
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
    if (this.combat.isParalyzed) return { ok: false, reason: 'blocked' };
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

  /** Aparece en otro lugar al instante (teletransporte). */
  teleport(position: Position): void {
    this._position = position;
  }

  /** Cuenta un paso corriendo; cada RUN_STEPS_PER_STAMINA gasta un punto de energía. */
  registerRunStep(): boolean {
    this.runSteps += 1;
    if (this.runSteps < RUN_STEPS_PER_STAMINA) return false;
    this.runSteps = 0;
    this.combat.spendStamina(1);
    return true;
  }

  /** Datos públicos del jugador; lo que tiene puesto y su gremio los agrega `World`. */
  toSnapshot(): Omit<MobileSnapshot, 'equipment'> {
    return {
      id: this.id,
      name: this.name,
      position: this._position,
      direction: this._direction,
      appearance: this.appearance,
      body: this.body,
      health: this.combat.health,
      dead: this.combat.isDead,
      npc: null,
      notoriety: this.reputation.notoriety,
      guildTag: null,
    };
  }
}
