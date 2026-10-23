import type { Position } from '@fenix/shared/geometry/position';
import type { EntityId } from '@fenix/shared/protocol/messages';
import type { Player } from '../../domain/player';
import { isTestCharacter } from '../../domain/testing/test-character';
import type { World } from '../../domain/world';
import type { WorldClock } from '../../domain/world-clock';
import type { Clock, IdGenerator, Notifier, RandomSource } from '../ports';
import { EventBus } from './event-bus';
import type { GameEvents } from './game-events';
import { Guards } from './guards';
import { ItemNotifications } from './item-notifications';
import { ItemUses } from './item-uses';
import { MobileNotifications } from './mobile-notifications';
import { ServiceRegistry } from './services';
import { SkillUses } from './skill-uses';
import { SocialNotifications } from './social-notifications';

export interface KernelDeps {
  readonly world: World;
  readonly worldClock: WorldClock;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly random: RandomSource;
  readonly notifier: Notifier;
  /** Personajes de prueba: entran con todo al máximo (solo para probar el juego). */
  readonly testCharacters?: readonly string[];
  /** Administradores del juego (los de prueba también lo son). */
  readonly admins?: readonly string[];
}

/**
 * El núcleo del juego: lo que comparten todos los módulos (el mundo, el
 * reloj, los avisos a los jugadores) y los puntos donde se enchufan (eventos,
 * servicios, reglas, usos de objetos y de habilidades). No conoce a ningún
 * módulo: los módulos lo conocen a él.
 */
export class GameKernel {
  readonly world: World;
  readonly worldClock: WorldClock;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly random: RandomSource;
  readonly notifier: Notifier;
  /** Avisos de objetos (suelo, mochilas, recipientes) a quienes corresponda. */
  readonly items: ItemNotifications;
  /** Avisos de personajes y criaturas (aparecer, moverse, vida, hechizos). */
  readonly mobiles: MobileNotifications;
  /** Avisos sociales (reputación, grupos, gremios). */
  readonly social: SocialNotifications;
  readonly events = new EventBus<GameEvents>();
  readonly services = new ServiceRegistry();
  /** Reglas que niegan cosas: caminar de un tile a otro, abrir un recipiente. */
  readonly guards = {
    move: new Guards<[player: Player, from: Position, to: Position]>(),
    container: new Guards<[playerId: EntityId, containerId: string]>(),
  };
  readonly itemUses = new ItemUses();
  readonly skills = new SkillUses();
  private readonly testCharacters: readonly string[];
  private readonly admins: readonly string[];

  constructor(deps: KernelDeps) {
    this.world = deps.world;
    this.worldClock = deps.worldClock;
    this.clock = deps.clock;
    this.ids = deps.ids;
    this.random = deps.random;
    this.notifier = deps.notifier;
    this.testCharacters = deps.testCharacters ?? [];
    this.admins = deps.admins ?? [];
    this.items = new ItemNotifications(this.world, this.notifier);
    this.mobiles = new MobileNotifications(this.world, this.notifier, this.clock);
    this.social = new SocialNotifications(this.world, this.clock, this.mobiles, this.notifier);
  }

  /** ¿Es un personaje de prueba? */
  isTestCharacter(name: string): boolean {
    return isTestCharacter(name, this.testCharacters);
  }

  /** ¿Es administrador del juego? (los de prueba también lo son) */
  isAdmin(name: string): boolean {
    return isTestCharacter(name, [...this.testCharacters, ...this.admins]);
  }

  /** Un aviso del sistema a un jugador. */
  say(playerId: EntityId, text: string): void {
    this.notifier.send(playerId, { type: 'system', text });
  }
}
