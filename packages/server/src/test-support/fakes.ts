import type { EntityId, ServerMessage } from '@fenix/shared';
import type { Clock, IdGenerator, Notifier, RandomSource } from '../application/ports';

export class FakeClock implements Clock {
  constructor(public time = 1000) {}
  now(): number {
    return this.time;
  }
  advance(ms: number): void {
    this.time += ms;
  }
}

export class SequentialIds implements IdGenerator {
  private counter = 0;
  next(): EntityId {
    this.counter += 1;
    return `p${this.counter}`;
  }
}

export class FixedRandom implements RandomSource {
  next(): number {
    return 0.5;
  }
}

export interface Delivery {
  readonly to: EntityId | 'all';
  readonly except?: EntityId | undefined;
  readonly message: ServerMessage;
}

/** Registra lo que se habría enviado por red, para hacer aserciones. */
export class RecordingNotifier implements Notifier {
  readonly deliveries: Delivery[] = [];

  send(playerId: EntityId, message: ServerMessage): void {
    this.deliveries.push({ to: playerId, message });
  }

  sendMany(playerIds: Iterable<EntityId>, message: ServerMessage): void {
    for (const to of playerIds) this.deliveries.push({ to, message });
  }

  broadcast(message: ServerMessage, options?: { except?: EntityId }): void {
    this.deliveries.push({ to: 'all', except: options?.except, message });
  }

  ofType<T extends ServerMessage['type']>(type: T): Delivery[] {
    return this.deliveries.filter((d) => d.message.type === type);
  }

  clear(): void {
    this.deliveries.length = 0;
  }
}
