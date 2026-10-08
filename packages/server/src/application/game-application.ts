import type { ClientMessage, EntityId } from '@fenix/shared';
import type { WorldClock } from '../domain/world-clock';
import type { World } from '../domain/world';
import { GameLoop } from './game-loop';
import { ItemNotifications } from './item-notifications';
import { MobileNotifications } from './mobile-notifications';
import type { Clock, IdGenerator, Notifier, RandomSource } from './ports';
import { SocialNotifications } from './social-notifications';
import { Attack } from './use-cases/attack';
import { CastSpell } from './use-cases/cast-spell';
import { EconomyActions } from './use-cases/economy-actions';
import { MoveItem } from './use-cases/move-item';
import { UseItem } from './use-cases/use-item';
import { JoinWorld, type JoinWorldResult } from './use-cases/join-world';
import { LeaveWorld } from './use-cases/leave-world';
import { MovePlayer } from './use-cases/move-player';
import { SendChat } from './use-cases/send-chat';
import { SocialActions } from './use-cases/social-actions';

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
  private readonly attack: Attack;
  private readonly castSpell: CastSpell;
  private readonly economy: EconomyActions;
  private readonly socialActions: SocialActions;
  private readonly social: SocialNotifications;
  private readonly loop: GameLoop;
  private readonly mobiles: MobileNotifications;
  private readonly world: World;

  constructor({ world, worldClock, clock, ids, random, notifier }: GameApplicationDeps) {
    this.world = world;
    const notifications = new ItemNotifications(world, notifier);
    this.mobiles = new MobileNotifications(world, notifier);
    this.social = new SocialNotifications(world, clock, this.mobiles, notifier);
    this.socialActions = new SocialActions(world, clock, this.social);
    this.joinWorld = new JoinWorld(world, worldClock, clock, ids, random, notifier, notifications);
    this.leaveWorld = new LeaveWorld(world, notifier);
    this.movePlayer = new MovePlayer(world, clock, notifier, notifications, this.mobiles);
    this.sendChat = new SendChat(world, notifier);
    this.economy = new EconomyActions(
      world,
      clock,
      ids,
      random,
      notifications,
      this.mobiles,
      notifier,
    );
    this.moveItem = new MoveItem(world, notifications, notifier, this.economy);
    this.useItem = new UseItem(world, notifications, notifier, this.mobiles, this.economy);
    this.attack = new Attack(world, clock, this.mobiles, this.social, notifier);
    this.castSpell = new CastSpell(world, clock, this.mobiles, notifications, notifier);
    this.loop = new GameLoop(
      world,
      this.mobiles,
      notifications,
      notifier,
      ids,
      random,
      this.social,
    );
  }

  /** Avanza el mundo: criaturas, golpes, regeneración. La infraestructura lo llama seguido. */
  tick(now: number): void {
    this.loop.tick(now);
  }

  join(message: Extract<ClientMessage, { type: 'join' }>): JoinWorldResult {
    return this.joinWorld.execute({ name: message.name, appearance: message.appearance });
  }

  /** Llamar después de asociar la conexión al jugador recién creado. */
  announceJoin(playerId: EntityId): void {
    this.joinWorld.announce(playerId);
    const player = this.world.get(playerId);
    if (player) {
      this.mobiles.sendVitals(player);
      this.mobiles.sendSkills(player);
      this.social.sendSocial(player);
    }
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
        this.sendChat.execute(playerId, message.text, message.channel);
        break;
      case 'moveItem':
        this.moveItem.execute(playerId, message.itemId, message.to);
        break;
      case 'useItem':
        this.useItem.execute(playerId, message.itemId);
        break;
      case 'attack':
        this.attack.execute(playerId, message.targetId);
        break;
      case 'stopAttack':
        this.attack.stop(playerId);
        break;
      case 'castSpell':
        this.castSpell.execute(playerId, message.spell, message.targetId);
        break;
      case 'gather':
        this.economy.gather(playerId, message.toolId, message.position);
        break;
      case 'buy':
        this.economy.buy(playerId, message.vendorId, message.kind, message.amount);
        break;
      case 'sell':
        this.economy.sell(playerId, message.vendorId, message.itemId);
        break;
      case 'craft':
        this.economy.craft(playerId, message.recipe);
        break;
      case 'social':
        this.socialActions.execute(playerId, message);
        break;
      case 'join':
        // Ya está en el mundo: se ignora un segundo ingreso.
        break;
    }
  }

  leave(playerId: EntityId): void {
    const player = this.world.get(playerId);
    if (player) this.socialActions.disconnect(player);
    this.leaveWorld.execute(playerId);
  }
}
