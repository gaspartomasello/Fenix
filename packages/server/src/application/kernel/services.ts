import type { MountKind } from '@fenix/shared/mounts/mount-catalog';
import type { Position } from '@fenix/shared/geometry/position';
import type { CorpseDrop } from '../../domain/items/items';
import type { EntityId } from '@fenix/shared/protocol/messages';
import type { Creature } from '../../domain/creatures/creature';
import type { Mobile } from '../../domain/mobile';
import type { Player } from '../../domain/player';

/**
 * Lo que un módulo ofrece a los demás. Cada uno es una interfaz chica: quien
 * la usa no sabe qué módulo la da, y el que la da no sabe quién la usa.
 */
export interface GameServices {
  /** Mover a alguien al instante (avisando a los que lo ven). */
  movement: { teleport(player: Player, to: Position): void };
  /** Daño, muertes y desapariciones con todo lo que trae (avisos, cuerpos, botín). */
  combat: {
    hurt(target: Mobile, amount: number, now: number): void;
    slay(victim: Mobile, by: Mobile, now: number): void;
    dismiss(creature: Creature): void;
  };
  /** Esconderse, descubrirse y caminar escondido. */
  stealth: {
    reveal(player: Player, text?: string): void;
    conceal(player: Player, until: number | null): void;
    revealArea(at: Position, radius: number, by: Player): number;
    step(player: Player, running: boolean): void;
  };
  /** Los portales abiertos con el hechizo Portal. */
  portals: {
    open(from: Position, to: Position, now: number, casterId: EntityId): void;
    destinationFrom(at: Position): Position | null;
  };
  /** Los cuerpos de las criaturas y su botín. */
  corpses: {
    fill(creature: Creature, drops: readonly CorpseDrop[]): boolean;
    remove(corpseId: EntityId): void;
  };
  /** Las monturas de los jugadores. */
  mounts: {
    grant(player: Player, kind: MountKind): boolean;
    dismountOnDeath(player: Player): void;
  };
  /** Los recipientes: bolsas, cofres y muebles que guardan cosas. */
  containers: {
    openFor(playerId: EntityId, containerId: string): void;
    describe(containerId: string): string | null;
    lockOf(containerId: string): number;
    unlock(containerId: string): void;
  };
  /** El banco (estar cerca de la banquera). */
  banking: { nearBanker(player: Player): boolean };
}

export type ServiceName = keyof GameServices;

/** Los servicios sin los que el juego anda igual (con menos cosas). */
type OptionalService = 'stealth' | 'portals' | 'corpses' | 'mounts';

/** Qué pasa sin el módulo que da cada servicio opcional: nada. */
const WITHOUT: { readonly [K in OptionalService]: GameServices[K] } = {
  stealth: { reveal: () => {}, conceal: () => {}, revealArea: () => 0, step: () => {} },
  portals: { open: () => {}, destinationFrom: () => null },
  corpses: { fill: () => false, remove: () => {} },
  mounts: { grant: () => false, dismountOnDeath: () => {} },
};

/**
 * Registro de servicios. Un módulo da un servicio con `provide`; los demás lo
 * piden con `lazy`, que lo busca recién al usarlo (así no importa en qué
 * orden se arman los módulos). Si falta el módulo que lo da, avisa claro.
 */
export class ServiceRegistry {
  private readonly provided = new Map<ServiceName, unknown>();

  provide<K extends ServiceName>(name: K, service: GameServices[K]): void {
    if (this.provided.has(name)) throw new Error(`Dos módulos dan el servicio "${name}".`);
    this.provided.set(name, service);
  }

  has(name: ServiceName): boolean {
    return this.provided.has(name);
  }

  get<K extends ServiceName>(name: K): GameServices[K] {
    const service = this.provided.get(name);
    if (!service) throw new Error(`Falta el módulo que da el servicio "${name}".`);
    return service as GameServices[K];
  }

  /** El servicio, buscado recién cuando se llama a uno de sus métodos. */
  lazy<K extends ServiceName>(name: K): GameServices[K] {
    return this.proxy(() => this.get(name));
  }

  /**
   * Un servicio que se puede no tener: si ningún módulo lo da, hace lo que
   * pasaría sin ese módulo (`WITHOUT`: nadie se esconde, no hay portales…).
   */
  optional<K extends OptionalService>(name: K): GameServices[K] {
    return this.proxy(() => (this.provided.get(name) ?? WITHOUT[name]) as GameServices[K]);
  }

  private proxy<S extends object>(resolve: () => S): S {
    return new Proxy({} as S, {
      get: (_, method) => {
        const service = resolve() as Record<PropertyKey, unknown>;
        const value = service[method];
        return typeof value === 'function' ? value.bind(service) : value;
      },
    });
  }
}
