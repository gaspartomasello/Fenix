import { formatGameTime, type ClientMessage, type EntityId, type Position } from '@fenix/shared';
import { isTestCharacter } from '../domain/testing/test-character';
import type { WorldClock } from '../domain/world-clock';
import type { World } from '../domain/world';
import { GameLoop } from './game-loop';
import { ItemNotifications } from './item-notifications';
import { MobileNotifications } from './mobile-notifications';
import { CharacterPersistence } from './character-persistence';
import type {
  CharacterStore,
  Clock,
  IdGenerator,
  Notifier,
  PasswordHasher,
  RandomSource,
} from './ports';
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
  /** Dónde guardar los personajes; sin almacén no se guarda nada. */
  readonly characters?: CharacterStore;
  /** Con hasher, cada personaje tiene contraseña (servidor en línea). */
  readonly passwords?: PasswordHasher;
  /** Personajes de prueba: entran con todo al máximo (solo para probar el juego). */
  readonly testCharacters?: readonly string[];
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
  private readonly persistence: CharacterPersistence;
  private readonly worldClock: WorldClock;
  private readonly clock: Clock;
  private readonly notifier: Notifier;
  private readonly testCharacters: readonly string[];

  constructor({
    world,
    worldClock,
    clock,
    ids,
    random,
    notifier,
    characters,
    passwords,
    testCharacters = [],
  }: GameApplicationDeps) {
    this.world = world;
    this.worldClock = worldClock;
    this.clock = clock;
    this.notifier = notifier;
    this.testCharacters = testCharacters;
    this.persistence = new CharacterPersistence(world, characters, passwords);
    const notifications = new ItemNotifications(world, notifier);
    this.mobiles = new MobileNotifications(world, notifier, clock);
    this.social = new SocialNotifications(world, clock, this.mobiles, notifier);
    this.socialActions = new SocialActions(world, clock, this.social);
    this.joinWorld = new JoinWorld(
      world,
      worldClock,
      clock,
      ids,
      random,
      notifier,
      notifications,
      this.persistence,
      testCharacters,
    );
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
    this.useItem = new UseItem(
      world,
      clock,
      ids,
      random,
      notifications,
      notifier,
      this.mobiles,
      this.economy,
    );
    this.attack = new Attack(world, clock, this.mobiles, this.social, notifier);
    this.castSpell = new CastSpell(
      world,
      clock,
      this.mobiles,
      notifications,
      this.social,
      notifier,
    );
    this.loop = new GameLoop(
      world,
      this.mobiles,
      notifications,
      notifier,
      ids,
      random,
      this.social,
      (player, position) => this.movePlayer.teleport(player, position),
    );
  }

  /** Avanza el mundo: criaturas, golpes, regeneración. La infraestructura lo llama seguido. */
  tick(now: number): void {
    this.loop.tick(now);
    this.persistence.autosave(now);
  }

  /** Guarda a todos los conectados (por ejemplo, antes de apagar el servidor). */
  saveAll(): void {
    this.persistence.saveAll();
  }

  join(message: Extract<ClientMessage, { type: 'join' }>): JoinWorldResult {
    return this.joinWorld.execute({
      name: message.name,
      appearance: message.appearance,
      password: message.password,
    });
  }

  /** Llamar después de asociar la conexión al jugador recién creado. */
  announceJoin(playerId: EntityId): void {
    this.joinWorld.announce(playerId);
    const player = this.world.get(playerId);
    if (player) {
      this.mobiles.sendVitals(player);
      this.mobiles.sendSkills(player);
      this.mobiles.sendEffects(player);
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
      case 'useOn':
        this.useItem.useOn(playerId, message.itemId, message.targetId);
        break;
      case 'attack':
        this.attack.execute(playerId, message.targetId);
        break;
      case 'stopAttack':
        this.attack.stop(playerId);
        break;
      case 'castSpell':
        this.castSpell.execute(playerId, {
          spell: message.spell,
          ...(message.targetId ? { targetId: message.targetId } : {}),
          ...(message.position ? { position: message.position } : {}),
          ...(message.scrollId ? { scrollId: message.scrollId } : {}),
        });
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
      case 'setHour':
        this.setHour(playerId, message.hour);
        break;
      case 'testTravel':
        this.testTravel(playerId, message.to);
        break;
      case 'join':
        // Ya está en el mundo: se ignora un segundo ingreso.
        break;
    }
  }

  /** `/hora`: un personaje de prueba mueve la hora del mundo, para todos. */
  private setHour(playerId: EntityId, hour: number): void {
    const player = this.world.get(playerId);
    if (!player) return;
    if (!isTestCharacter(player.name, this.testCharacters)) {
      this.notifier.send(playerId, {
        type: 'system',
        text: 'Solo los personajes de prueba pueden cambiar la hora.',
      });
      return;
    }
    const now = this.clock.now();
    this.worldClock.setHour(hour, now);
    this.notifier.broadcast({ type: 'worldTime', time: this.worldClock.timeAt(now) });
    this.notifier.send(playerId, {
      type: 'system',
      text: `Ahora son las ${formatGameTime(hour / 24)}.`,
    });
  }

  /**
   * `/cueva`: un personaje de prueba va a la boca de la mazmorra (afuera);
   * `/cueva fondo`, al lado del jefe de la última sala.
   */
  private testTravel(playerId: EntityId, to: 'cave' | 'lair'): void {
    const player = this.world.get(playerId);
    if (!player) return;
    if (!isTestCharacter(player.name, this.testCharacters)) {
      this.notifier.send(playerId, {
        type: 'system',
        text: 'Solo los personajes de prueba pueden viajar así.',
      });
      return;
    }
    const map = this.world.map;
    const destination =
      to === 'cave' ? map.teleporters.find((t) => map.regionAt(t)?.dungeon)?.to : this.nearLair();
    if (!destination) {
      this.notifier.send(playerId, { type: 'system', text: 'Este mundo no tiene mazmorra.' });
      return;
    }
    this.movePlayer.teleport(player, destination);
  }

  /** Un tile libre cerca del jefe de la mazmorra (el dragón). */
  private nearLair(): Position | undefined {
    const boss = this.world.allCreatures().find((c) => c.body === 'dragon');
    if (!boss) return undefined;
    for (let r = 7; r >= 3; r--) {
      const spot = { x: boss.home.x - r, y: boss.home.y };
      if (this.world.map.isWalkable(spot)) return spot;
    }
    return boss.home;
  }

  leave(playerId: EntityId): void {
    const player = this.world.get(playerId);
    if (player) {
      // Sus invocaciones se van con él.
      for (const summon of this.world.summonsOf(playerId)) this.loop.dismiss(summon);
      this.socialActions.disconnect(player);
      this.persistence.release(player);
    }
    this.leaveWorld.execute(playerId);
  }
}
