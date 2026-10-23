import {
  CREATURES,
  type CreatureDefinition,
  type CreatureKind,
} from '@fenix/shared/creatures/creature-catalog';
import { Direction } from '@fenix/shared/geometry/direction';
import type { Position } from '@fenix/shared/geometry/position';
import type { SpellKey } from '@fenix/shared/magic/spell-catalog';
import { isMountKind } from '@fenix/shared/mounts/mount-catalog';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { Combatant } from '../combat/combatant';
import type { Mobile } from '../mobile';

/** Cuánto se aleja una criatura de su lugar antes de volver. */
export const LEASH_RANGE = 14;
export const WANDER_RANGE = 4;
/** Cuerpo de una invocación (no deja botín) hasta desaparecer, y tiempo hasta reaparecer. */
export const CORPSE_MS = 1500;
export const RESPAWN_MS = 30_000;

export class Creature implements Mobile {
  readonly body: CreatureKind;
  /** El de su especie; los jefes de las leyendas tienen nombre propio. */
  name: string;
  readonly definition: CreatureDefinition;
  combat: Combatant;
  private _position: Position;
  /** Aviso de que cambió de lugar (el mundo lo reubica en su índice). */
  moved: (() => void) | null = null;
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
  /** Maná recuperado en fracciones, hasta juntar un punto. */
  manaCarry = 0;
  lastTickAt = 0;
  /** Creada por un administrador: al morir no reaparece (se va del mundo). */
  temporary = false;
  /** Montura: hasta cuándo no se vuelve a avisar al dueño que la atacan. */
  ownerWarnedUntil = 0;
  /** Invocada: jugador que la llamó (pelea para él) y cuándo se desvanece. */
  readonly ownerId: EntityId | null;
  readonly expiresAt: number | null;

  constructor(
    readonly id: EntityId,
    kind: CreatureKind,
    readonly home: Position,
    /** Invocación (vence en `expiresAt`) o montura (`expiresAt` null). */
    summon: { ownerId: EntityId; expiresAt: number | null } | null = null,
  ) {
    this.ownerId = summon?.ownerId ?? null;
    this.expiresAt = summon?.expiresAt ?? null;
    this.body = kind;
    this.definition = CREATURES[kind];
    this.name = this.definition.name;
    this._position = home;
    this.combat = this.freshCombatant();
  }

  get position(): Position {
    return this._position;
  }

  set position(position: Position) {
    this._position = position;
    this.moved?.();
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

  /** Montura suelta: sigue a su dueño, lo defiende y se puede montar. */
  get isPet(): boolean {
    return this.ownerId !== null && isMountKind(this.body);
  }

  /** ¿Está huyendo? (las que escapan cuando les queda poca vida). */
  get fleeing(): boolean {
    const fleeAt = this.definition.abilities?.fleeAt;
    return fleeAt !== undefined && this.combat.health <= fleeAt;
  }

  private freshCombatant(): Combatant {
    const { strength, dexterity, maxHits, abilities } = this.definition;
    // Las que saben magia tienen el maná de su catálogo: lo gastan al lanzar.
    const intelligence = abilities?.spells ? (this.definition.intelligence ?? 40) : 0;
    return new Combatant({ strength, dexterity, intelligence }, maxHits);
  }
}
