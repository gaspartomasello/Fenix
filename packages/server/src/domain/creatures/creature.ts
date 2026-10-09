import {
  CREATURES,
  Direction,
  type CreatureDefinition,
  type CreatureKind,
  type EntityId,
  type Position,
  type SpellKey,
} from '@fenix/shared';
import { Combatant } from '../combat/combatant';
import type { Mobile } from '../mobile';

/** Cuánto se aleja una criatura de su lugar antes de volver. */
export const LEASH_RANGE = 14;
export const WANDER_RANGE = 4;
/** Tiempo que el cuerpo queda visible antes de desaparecer, y hasta reaparecer. */
export const CORPSE_MS = 1500;
export const RESPAWN_MS = 30_000;

export class Creature implements Mobile {
  readonly body: CreatureKind;
  readonly name: string;
  readonly definition: CreatureDefinition;
  combat: Combatant;
  position: Position;
  direction: Direction = Direction.South;
  nextMoveAt = 0;
  /** Cuándo deja de verse el cuerpo (null mientras vive). */
  despawnAt: number | null = null;
  /** Cuándo vuelve a aparecer (null mientras vive o se ve el cuerpo). */
  respawnAt: number | null = null;
  /** Ya no está en el mundo (murió y su cuerpo desapareció). */
  gone = false;
  /** Hechizo que está lanzando (las que saben magia). */
  pendingCast: { spell: SpellKey; targetId: EntityId; resolveAt: number } | null = null;
  /** Cuándo puede volver a lanzar un hechizo o escupir fuego. */
  nextSpellAt = 0;
  nextBreathAt = 0;
  /** Vida recuperada en fracciones, hasta juntar un punto (regeneración). */
  regenCarry = 0;
  lastTickAt = 0;
  /** Invocada: jugador que la llamó (pelea para él) y cuándo se desvanece. */
  readonly ownerId: EntityId | null;
  readonly expiresAt: number | null;

  constructor(
    readonly id: EntityId,
    kind: CreatureKind,
    readonly home: Position,
    summon: { ownerId: EntityId; expiresAt: number } | null = null,
  ) {
    this.ownerId = summon?.ownerId ?? null;
    this.expiresAt = summon?.expiresAt ?? null;
    this.body = kind;
    this.definition = CREATURES[kind];
    this.name = this.definition.name;
    this.position = home;
    this.combat = this.freshCombatant();
  }

  /** Vuelve a aparecer en su lugar, con la vida llena. */
  respawn(): void {
    this.combat = this.freshCombatant();
    this.pendingCast = null;
    this.position = this.home;
    this.despawnAt = null;
    this.respawnAt = null;
    this.gone = false;
  }

  /** ¿Está huyendo? (las que escapan cuando les queda poca vida). */
  get fleeing(): boolean {
    const fleeAt = this.definition.abilities?.fleeAt;
    return fleeAt !== undefined && this.combat.health <= fleeAt;
  }

  private freshCombatant(): Combatant {
    const { strength, dexterity, maxHits, abilities } = this.definition;
    // Las que saben magia tienen maná (para que les puedan drenar).
    const intelligence = abilities?.spells ? 60 : 0;
    return new Combatant({ strength, dexterity, intelligence }, maxHits);
  }
}
