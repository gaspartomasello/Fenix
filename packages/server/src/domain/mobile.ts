import type { Body } from '@fenix/shared/creatures/creature-catalog';
import type { Direction } from '@fenix/shared/geometry/direction';
import type { Position } from '@fenix/shared/geometry/position';
import type { EntityId } from '@fenix/shared/protocol/messages';
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
