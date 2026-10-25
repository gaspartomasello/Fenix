import type { ClientMessage, EntityId } from '@fenix/shared/protocol/messages';
import { Accounts } from './features/session/accounts';
import { CharacterPersistence } from './features/session/character-persistence';
import { JoinWorld, type JoinWorldResult } from './features/session/join-world';
import { LeaveWorld } from './features/session/leave-world';
import { GameKernel, type KernelDeps } from './kernel/game-kernel';
import type {
  GameMessage,
  GameModule,
  MessageHandlers,
  ModuleFactory,
  SessionMessage,
} from './kernel/game-module';
import type { AccountStore, CharacterStore, PasswordHasher } from './ports';

export interface GameApplicationDeps extends KernelDeps {
  /** Dónde guardar los personajes; sin almacén no se guarda nada. */
  readonly characters?: CharacterStore;
  /** Cuentas (cada una con hasta cinco personajes); sin almacén, en memoria. */
  readonly accounts?: AccountStore;
  /** Con hasher, cada personaje tiene contraseña (servidor en línea). */
  readonly passwords?: PasswordHasher;
}

type Handler = (playerId: EntityId, message: ClientMessage) => void;

/** Los pedidos de antes de entrar: si llegan estando dentro, se ignoran. */
const SESSION_MESSAGES: ReadonlySet<string> = new Set<SessionMessage>([
  'join',
  'login',
  'createCharacter',
  'play',
  'deleteCharacter',
]);

/**
 * Fachada de la capa de aplicación: el único punto de entrada que usa la
 * infraestructura. Atiende la sesión (cuentas, entrar, guardar, salir) y
 * reparte el resto entre los módulos que recibe: cada pedido va al módulo
 * que lo declaró. No conoce a ningún módulo por nombre.
 */
export class GameApplication {
  /** Cuentas y creación de personajes (antes de entrar al mundo). */
  readonly accounts: Accounts;
  readonly kernel: GameKernel;
  private readonly persistence: CharacterPersistence;
  private readonly joinWorld: JoinWorld;
  private readonly leaveWorld: LeaveWorld;
  private readonly modules: readonly GameModule[];
  private readonly handlers = new Map<string, Handler>();

  constructor(deps: GameApplicationDeps, modules: readonly ModuleFactory[]) {
    const kernel = new GameKernel(deps);
    this.kernel = kernel;
    const testCharacters = deps.testCharacters ?? [];
    this.persistence = new CharacterPersistence(kernel.world, deps.characters, deps.passwords);
    this.joinWorld = new JoinWorld(
      kernel.world,
      kernel.worldClock,
      kernel.clock,
      kernel.ids,
      kernel.random,
      kernel.notifier,
      kernel.items,
      this.persistence,
      testCharacters,
    );
    this.accounts = new Accounts(
      deps.accounts,
      this.persistence,
      deps.passwords,
      this.joinWorld,
      testCharacters,
    );
    this.leaveWorld = new LeaveWorld(kernel.world, kernel.notifier);
    // Las habilidades con botón las reparte el núcleo entre los módulos que las registraron.
    this.register({
      name: 'habilidades',
      handles: { useSkill: (playerId, m) => kernel.skills.use(m.skill, playerId, m.targetId) },
    });
    this.modules = modules.map((build) => build(kernel));
    for (const module of this.modules) this.register(module);
  }

  private register(module: GameModule): void {
    const handles: MessageHandlers = module.handles ?? {};
    for (const type of Object.keys(handles) as GameMessage[]) {
      if (this.handlers.has(type))
        throw new Error(`Dos módulos atienden "${type}" (el último es "${module.name}").`);
      this.handlers.set(type, handles[type] as Handler);
    }
  }

  /** ¿Algún módulo atiende este pedido? (para las pruebas del armado) */
  handles(type: GameMessage): boolean {
    return this.handlers.has(type);
  }

  /** Avanza el mundo: cada módulo hace lo suyo, y se guarda cada tanto. */
  tick(now: number): void {
    for (const module of this.modules) module.tick?.(now);
    this.persistence.autosave(now);
  }

  /** Guarda a todos los conectados (por ejemplo, antes de apagar el servidor). */
  saveAll(): void {
    this.persistence.saveAll();
    for (const module of this.modules) module.saveAll?.();
  }

  join(message: Extract<ClientMessage, { type: 'join' }>): JoinWorldResult {
    return this.joinWorld.execute({
      name: message.name,
      appearance: message.appearance,
      password: message.password,
    });
  }

  /** ¿Hay un personaje con ese nombre en el mundo? */
  isOnline(name: string): boolean {
    return this.kernel.world.isNameTaken(name);
  }

  /** Llamar después de asociar la conexión al jugador recién creado. */
  announceJoin(playerId: EntityId): void {
    this.joinWorld.announce(playerId);
    const player = this.kernel.world.get(playerId);
    if (!player) return;
    const { mobiles, social } = this.kernel;
    mobiles.sendVitals(player);
    mobiles.sendSkills(player);
    mobiles.sendEffects(player);
    social.sendSocial(player);
    for (const module of this.modules) module.joined?.(player);
  }

  /** Maneja un mensaje de un jugador que ya está dentro del mundo. */
  handle(playerId: EntityId, message: ClientMessage): void {
    // Ya está en el mundo: se ignora un segundo ingreso.
    if (SESSION_MESSAGES.has(message.type)) return;
    this.handlers.get(message.type)?.(playerId, message);
  }

  leave(playerId: EntityId): void {
    const player = this.kernel.world.get(playerId);
    if (player) {
      for (const module of this.modules) module.leaving?.(player);
      this.persistence.release(player);
    }
    for (const module of this.modules) module.left?.(playerId);
    this.leaveWorld.execute(playerId);
  }
}
