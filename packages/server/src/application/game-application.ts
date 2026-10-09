import type { ClientMessage, EntityId } from '@fenix/shared';
import type { WorldClock } from '../domain/world-clock';
import type { World } from '../domain/world';
import { ItemNotifications } from './item-notifications';
import type { Clock, IdGenerator, Notifier, RandomSource } from './ports';
import { MoveItem } from './use-cases/move-item';
import { UseItem } from './use-cases/use-item';
import { JoinWorld, type JoinWorldResult } from './use-cases/join-world';
import { LeaveWorld } from './use-cases/leave-world';
import { MovePlayer } from './use-cases/move-player';
import { SendChat } from './use-cases/send-chat';

export interface GameApplicationDeps {
  readonly world: World;
  readonly worldClock: WorldClock;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly random: RandomSource;
  readonly notifier: Notifier;
}

/**
 * Fachada de la capa de aplicación: el único punto de entrada que usa la
 * infraestructura. Traduce mensajes del protocolo a casos de uso.
 */
export class GameApplication {
  private readonly joinWorld: JoinWorld;
  private readonly leaveWorld: LeaveWorld;
  private readonly movePlayer: MovePlayer;
  private readonly sendChat: SendChat;
  private readonly moveItem: MoveItem;
  private readonly useItem: UseItem;

  constructor({ world, worldClock, clock, ids, random, notifier }: GameApplicationDeps) {
    const notifications = new ItemNotifications(world, notifier);
    this.joinWorld = new JoinWorld(world, worldClock, clock, ids, random, notifier, notifications);
    this.leaveWorld = new LeaveWorld(world, notifier);
    this.movePlayer = new MovePlayer(world, clock, notifier, notifications);
    this.sendChat = new SendChat(world, notifier);
    this.moveItem = new MoveItem(world, notifications, notifier);
    this.useItem = new UseItem(world, notifications, notifier);
  }

  join(message: Extract<ClientMessage, { type: 'join' }>): JoinWorldResult {
    return this.joinWorld.execute({ name: message.name, appearance: message.appearance });
  }

  /** Llamar después de asociar la conexión al jugador recién creado. */
  announceJoin(playerId: EntityId): void {
    this.joinWorld.announce(playerId);
  }

  /** Maneja un mensaje de un jugador que ya está dentro del mundo. */
  handle(playerId: EntityId, message: ClientMessage): void {
    switch (message.type) {
      case 'move':
        this.movePlayer.execute({
          playerId,
          direction: message.direction,
          mode: message.mode,
          seq: message.seq,
        });
        break;
      case 'chat':
        this.sendChat.execute(playerId, message.text);
        break;
      case 'moveItem':
        this.moveItem.execute(playerId, message.itemId, message.to);
        break;
      case 'useItem':
        this.useItem.execute(playerId, message.itemId);
        break;
      case 'join':
        // Ya está en el mundo: se ignora un segundo ingreso.
        break;
    }
  }

  leave(playerId: EntityId): void {
    this.leaveWorld.execute(playerId);
  }
}
