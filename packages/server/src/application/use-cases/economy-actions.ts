import {
  VENDOR_RANGE,
  tileDistance,
  type EntityId,
  type ItemKind,
  type Position,
} from '@fenix/shared';
import { buy, craft, gather, sell, smelt, type EconomyResult } from '../../domain/economy/economy';
import { ResourceSpots } from '../../domain/economy/resource-spots';
import type { Player } from '../../domain/player';
import type { World } from '../../domain/world';
import type { ItemNotifications } from '../item-notifications';
import type { MobileNotifications } from '../mobile-notifications';
import type { Clock, IdGenerator, Notifier, RandomSource } from '../ports';

/**
 * Casos de uso de la economía: recolectar, fundir, fabricar, comprar y
 * vender. Las reglas están en `domain/economy`; acá se avisan los resultados.
 */
export class EconomyActions {
  private readonly spots = new ResourceSpots();

  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly random: RandomSource,
    private readonly items: ItemNotifications,
    private readonly mobiles: MobileNotifications,
    private readonly notifier: Notifier,
  ) {}

  gather(playerId: EntityId, toolId: EntityId, position: Position): void {
    this.run(playerId, (player) =>
      gather(
        player,
        toolId,
        position,
        this.world,
        this.spots,
        this.newId,
        this.clock.now(),
        this.roll,
      ),
    );
  }

  smelt(playerId: EntityId): void {
    this.run(playerId, (player) => smelt(player, this.world, this.newId));
  }

  craft(playerId: EntityId, recipe: string): void {
    this.run(playerId, (player) =>
      craft(player, recipe, this.world, this.newId, this.clock.now(), this.roll),
    );
  }

  buy(playerId: EntityId, vendorId: EntityId, kind: ItemKind, amount: number): void {
    this.run(playerId, (player) =>
      buy(player, this.world.getNpc(vendorId), kind, amount, this.world, this.newId),
    );
  }

  sell(playerId: EntityId, vendorId: EntityId, itemId: EntityId): void {
    this.run(playerId, (player) =>
      sell(player, this.world.getNpc(vendorId), itemId, this.world, this.newId),
    );
  }

  /** ¿Está el jugador cerca de una banquera? (para usar la caja del banco) */
  nearBanker(player: Player): boolean {
    return this.world
      .allNpcs()
      .some(
        (n) => n.role === 'banker' && tileDistance(n.position, player.position) <= VENDOR_RANGE,
      );
  }

  private readonly newId = (): EntityId => this.ids.next();
  private readonly roll = (): number => this.random.next();

  private run(playerId: EntityId, action: (player: Player) => EconomyResult): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const result = action(player);
    if (!result.ok) {
      this.notifier.send(playerId, { type: 'system', text: result.reason });
      return;
    }
    this.items.publish(result.changes, playerId);
    this.notifier.send(playerId, { type: 'system', text: result.message });
    if (result.gained) this.mobiles.skillGains([{ player, skill: result.gained }]);
  }
}
