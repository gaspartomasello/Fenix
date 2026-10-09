import type { EntityId, ServerMessage } from '@fenix/shared';
import type {
  CharacterStore,
  Clock,
  IdGenerator,
  Notifier,
  RandomSource,
} from '../application/ports';
import type { SavedCharacter } from '../domain/persistence/saved-character';

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
  constructor(private readonly value = 0.5) {}
  next(): number {
    return this.value;
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

/** Almacén de personajes en memoria para los tests de la aplicación. */
export class FakeCharacterStore implements CharacterStore {
  readonly characters = new Map<string, SavedCharacter>();
  saves: string[] = [];

  find(name: string): SavedCharacter | undefined {
    return this.characters.get(name.toLocaleLowerCase());
  }

  save(character: SavedCharacter): void {
    this.saves.push(character.name);
    this.characters.set(character.name.toLocaleLowerCase(), character);
  }
}
