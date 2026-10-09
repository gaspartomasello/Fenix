import type { Body, Direction, EntityId, Position } from '@fenix/shared';
import type { Combatant } from './combat/combatant';

/** Lo común a jugadores y criaturas: algo que se mueve, se ve y pelea. */
export interface Mobile {
  readonly id: EntityId;
  readonly name: string;
  readonly body: Body;
  readonly position: Position;
  readonly direction: Direction;
  readonly combat: Combatant;
}
