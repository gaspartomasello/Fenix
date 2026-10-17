import { formatGameTime, type ClientMessage, type EntityId, type Position } from '@fenix/shared';
import { isTestCharacter } from '../domain/testing/test-character';
import type { WorldClock } from '../domain/world-clock';
import type { World } from '../domain/world';
import { Doors } from './use-cases/doors';
import { Corpses } from './corpses';
import { MountActions } from './use-cases/mount-actions';
import { Gates } from './gates';
import { Stealth } from './stealth';
import { WarMode } from './war-mode';
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
import { GameMaster } from './use-cases/game-master';
import { TownLife } from './use-cases/town-life';
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
  /** Administradores del juego (los de prueba también lo son). */
  readonly admins?: readonly string[];
}

/**
 * Fachada de la capa de aplicación: el único punto de entrada que usa la
 * infraestructura. Traduce mensajes del protocolo a casos de uso.
 */
export class GameApplication {
  private readonly joinWorld: JoinWorld;
  private readonly leaveWorld: LeaveWorld;
  private readonly gameMaster: GameMaster;
  private readonly townLife: TownLife;
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
  private readonly corpses: Corpses;
  private readonly doors: Doors;
  private readonly mounts: MountActions;
  private readonly stealth: Stealth;
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
    admins = [],
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
    const gates = new Gates(world, ids, notifications);
    this.stealth = new Stealth(world, this.mobiles, notifier, random);
    this.movePlayer = new MovePlayer(
      world,
      clock,
      notifier,
      notifications,
      this.mobiles,
      gates,
      this.stealth,
    );
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
    const warMode = new WarMode(world, this.mobiles, notifier);
    this.attack = new Attack(world, clock, this.mobiles, this.social, notifier, warMode);
    this.castSpell = new CastSpell(
      world,
      clock,
      this.mobiles,
      notifications,
      this.social,
      notifier,
    );
    this.corpses = new Corpses(world, clock, ids, notifications, notifier);
    this.doors = new Doors(world, notifier);
    this.mounts = new MountActions(world, ids, notifications, this.mobiles, notifier);
    this.gameMaster = new GameMaster(
      world,
      clock,
      ids,
      notifier,
      this.mobiles,
      notifications,
      {
        teleport: (player, to) => this.movePlayer.teleport(player, to),
        slay: (victim, by, now) => this.loop.slay(victim, by, now),
        dismiss: (creature) => this.loop.dismiss(creature),
        grantMount: (player, kind) => this.mounts.grant(player, kind),
      },
      (name) => isTestCharacter(name, [...testCharacters, ...admins]),
    );
    this.townLife = new TownLife(
      world,
      this.mobiles,
      notifier,
      () => random.next(),
      (victim, by, now) => this.loop.slay(victim, by, now),
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
      this.corpses,
      this.mounts,
      gates,
      this.stealth,
      warMode,
    );
  }

  private revealPlayer(playerId: EntityId, text: string): void {
    const player = this.world.get(playerId);
    if (player?.hidden) this.stealth.reveal(player, text);
  }

  /** Avanza el mundo: criaturas, golpes, regeneración. La infraestructura lo llama seguido. */
  tick(now: number): void {
    this.loop.tick(now);
    this.townLife.tick(now);
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
        // Hablar en voz alta descubre al escondido (al grupo o al gremio, no).
        if ((message.channel ?? 'say') === 'say')
          this.revealPlayer(playerId, 'Hablaste y te oyeron.');
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
        if (this.world.get(playerId)?.combat.targetId === message.targetId)
          this.revealPlayer(playerId, 'Atacaste y te descubriste.');
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
          ...(message.runeId ? { runeId: message.runeId } : {}),
        });
        // Empezar a lanzar descubre al escondido.
        if (this.world.get(playerId)?.pendingCast)
          this.revealPlayer(playerId, 'Lanzar un hechizo te descubrió.');
        break;
      case 'useSkill':
        this.stealth.use(playerId, message.skill);
        break;
      case 'setWarMode':
        this.attack.setWarMode(playerId, message.war);
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
        this.testTravel(playerId, message.to === 'place' ? { place: message.place } : message.to);
        break;
      case 'toggleInvulnerable':
        this.toggleInvulnerable(playerId);
        break;
      case 'gm':
        this.gameMaster.execute(playerId, message.command);
        break;
      case 'openCorpse':
        this.corpses.open(playerId, message.corpseId);
        break;
      case 'useDoor':
        this.doors.use(playerId, message.position);
        break;
      case 'lootAll':
        this.corpses.lootAll(playerId, message.corpseId);
        break;
      case 'buyMount':
        this.mounts.buy(playerId, message.vendorId, message.mount);
        break;
      case 'mount':
        this.mounts.mount(playerId, message.petId);
        break;
      case 'dismount':
        this.mounts.dismount(playerId);
        break;
      case 'releasePet':
        this.mounts.releasePet(playerId);
        break;
      case 'join':
        // Ya está en el mundo: se ignora un segundo ingreso.
        break;
    }
  }

  /** `/invul`: un personaje de prueba se vuelve invulnerable (nombre amarillo) o deja de serlo. */
  private toggleInvulnerable(playerId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player) return;
    if (!isTestCharacter(player.name, this.testCharacters)) {
      this.notifier.send(playerId, {
        type: 'system',
        text: 'Solo los personajes de prueba pueden volverse invulnerables.',
      });
      return;
    }
    player.combat.invulnerable = !player.combat.invulnerable;
    this.social.statusChanged(player);
    this.notifier.send(playerId, {
      type: 'system',
      text: player.combat.invulnerable
        ? 'Ahora sos invulnerable: nadie puede lastimarte (nombre amarillo).'
        : 'Ya no sos invulnerable.',
    });
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
  private testTravel(playerId: EntityId, to: 'cave' | 'lair' | { place: string }): void {
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
    if (typeof to === 'object') {
      const spot = this.placeSpot(to.place);
      if (!spot) {
        this.notifier.send(playerId, {
          type: 'system',
          text: `No conozco ningún lugar que se llame "${to.place}". Escribí /ir para ver la lista.`,
        });
        return;
      }
      this.movePlayer.teleport(player, spot);
      return;
    }
    const destination =
      to === 'cave' ? map.teleporters.find((t) => map.regionAt(t)?.dungeon)?.to : this.nearLair();
    if (!destination) {
      this.notifier.send(playerId, { type: 'system', text: 'Este mundo no tiene mazmorra.' });
      return;
    }
    this.movePlayer.teleport(player, destination);
  }

  /** Un tile libre en el centro de un lugar con nombre (sin importar mayúsculas ni tildes). */
  private placeSpot(name: string): Position | undefined {
    const plain = (text: string): string =>
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase()
        .trim();
    // También coordenadas: "/ir 120 300" (para revisar el mapa).
    const coords = /^(\d+)[\s,]+(\d+)$/.exec(name.trim());
    if (coords) return this.walkableNear(Number(coords[1]), Number(coords[2]), 30);
    const wanted = plain(name);
    const region = this.world.map.regions.find(
      (r) => !r.dungeon && plain(r.name).startsWith(wanted),
    );
    if (!region) return undefined;
    return this.walkableNear(
      region.x + Math.floor(region.width / 2),
      region.y + Math.floor(region.height / 2),
      Math.max(region.width, region.height),
    );
  }

  /** El tile caminable más cercano a (cx, cy), buscando en cuadrados crecientes. */
  private walkableNear(cx: number, cy: number, reach: number): Position | undefined {
    for (let r = 0; r <= reach; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const spot = { x: cx + dx, y: cy + dy };
          if (this.world.map.isWalkable(spot)) return spot;
        }
    return undefined;
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
      // La montura suelta se guardó con él: se va del mundo hasta que vuelva.
      const pet = this.world.petOf(playerId);
      if (pet) this.loop.dismiss(pet);
    }
    this.corpses.forget(playerId);
    this.leaveWorld.execute(playerId);
  }
}
