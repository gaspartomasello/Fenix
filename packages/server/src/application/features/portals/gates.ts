import type { Position } from '@fenix/shared/geometry/position';
import { GATE_DURATION_MS } from '@fenix/shared/magic/spell-catalog';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { emptyChanges } from '../../../domain/items/items';
import type { World } from '../../../domain/world';
import type { ItemNotifications } from '../../kernel/item-notifications';
import type { IdGenerator } from '../../ports';

interface Gate {
  readonly ids: readonly [EntityId, EntityId];
  readonly ends: readonly [Position, Position];
  readonly closesAt: number;
}

/**
 * Portales del hechizo Portal: dos puertas (objetos fijos en el suelo, así
 * todos las ven) unidas entre sí. Quien pisa una aparece en la otra; se
 * cierran solas al rato. Llegar por un portal no vuelve a mandar de vuelta:
 * hay que salir y volver a pisarlo.
 */
export class Gates {
  private gates: Gate[] = [];

  constructor(
    private readonly world: World,
    private readonly ids: IdGenerator,
    private readonly items: ItemNotifications,
  ) {}

  open(from: Position, to: Position, now: number, casterId: EntityId): void {
    const changes = emptyChanges();
    const place = (at: Position): EntityId => {
      const id = this.ids.next();
      changes.groundAdded.push(
        this.world.items.add(id, 'moongate', 1, { type: 'ground', position: at }),
      );
      return id;
    };
    this.gates.push({
      ids: [place(from), place(to)],
      ends: [from, to],
      closesAt: now + GATE_DURATION_MS,
    });
    changes.message = 'Se abrió un portal: cruzalo antes de que se cierre.';
    this.items.publish(changes, casterId);
  }

  /** Si en esa posición hay una puerta, a dónde lleva. */
  destinationFrom(at: Position): Position | null {
    for (const gate of this.gates) {
      const [a, b] = gate.ends;
      if (a.x === at.x && a.y === at.y) return b;
      if (b.x === at.x && b.y === at.y) return a;
    }
    return null;
  }

  /** Cierra los portales que vencieron. */
  tick(now: number): void {
    const due = this.gates.filter((g) => now >= g.closesAt);
    if (due.length === 0) return;
    this.gates = this.gates.filter((g) => now < g.closesAt);
    const changes = emptyChanges();
    for (const gate of due)
      gate.ids.forEach((id, i) => {
        if (this.world.items.remove(id))
          changes.groundRemoved.push({ id, position: gate.ends[i] ?? { x: 0, y: 0 } });
      });
    this.items.publish(changes, '');
  }
}
