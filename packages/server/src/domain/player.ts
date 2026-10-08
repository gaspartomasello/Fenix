import {
  PLAYER_ATTRIBUTES,
  SKILL_STATS,
  STARTING_SKILLS,
  STAT_GAIN_MIN_USES,
  STAT_TOTAL_CAP,
  statGainChance,
  type AttributeKey,
  type Attributes,
  type SkillKey,
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
  /** Atributos guardados (fuerza, destreza, inteligencia). */
  readonly attributes?: Attributes;
}

export class Player implements Mobile {
  readonly id: EntityId;
  readonly name: string;
  readonly body = 'human' as const;
  readonly appearance: Appearance;
  readonly combat: Combatant;
  readonly skills: SkillSet;
  readonly reputation = new Reputation();
  /** Hechizo que está lanzando, que se resuelve en `resolveAt`. */
  pendingCast: PendingCast | null = null;
  /** Venda que está poniendo, que termina en `resolveAt`. */
  pendingBandage: { targetId: EntityId; resolveAt: number } | null = null;
  /** Atributos que subieron y todavía no se avisaron. */
  readonly statGains: AttributeKey[] = [];
  private usesSinceStatGain = 0;
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
    this.combat = new Combatant(props.attributes ?? PLAYER_ATTRIBUTES);
    this.skills = new SkillSet(props.skills ?? STARTING_SKILLS, (key, random) =>
      this.trainAttributes(key, random),
    );
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

  /**
   * Usar una habilidad entrena sus atributos, como en UO: sube de a un punto,
   * no muy seguido, hasta 100 cada uno y 225 entre los tres.
   */
  private trainAttributes(skill: SkillKey, random: () => number): void {
    this.usesSinceStatGain += 1;
    if (this.usesSinceStatGain < STAT_GAIN_MIN_USES) return;
    const base = this.combat.baseAttributes;
    if (base.strength + base.dexterity + base.intelligence >= STAT_TOTAL_CAP) return;
    for (const [index, key] of SKILL_STATS[skill].entries()) {
      if (random() >= statGainChance(base[key], index === 0)) continue;
      this.combat.raiseAttribute(key);
      this.statGains.push(key);
      this.usesSinceStatGain = 0;
      return;
    }
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
