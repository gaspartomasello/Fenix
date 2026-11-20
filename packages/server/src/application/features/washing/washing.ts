import type { Position } from '@fenix/shared/geometry/position';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { isWater } from '@fenix/shared/world/terrain';
import type { StaticKind } from '@fenix/shared/world/statics';
import { emptyChanges } from '../../../domain/items/items';
import type { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { ItemNotifications } from '../../kernel/item-notifications';
import type { IdGenerator, Notifier } from '../../ports';

/** A cuántos tiles del agua se puede lavar. */
export const WASH_RANGE = 2;

/** Lo que tiene agua limpia para lavar, además del mar, los ríos y las orillas. */
const WATER_SOURCES: ReadonlySet<StaticKind> = new Set<StaticKind>([
  'well',
  'fountain',
  'water-trough',
]);

/**
 * Las vendas usadas: al terminar de vendar, la venda queda ensangrentada en
 * la mochila. Con doble clic cerca del agua (el mar, un río, la orilla, un
 * aljibe, una fuente o un bebedero de caballos) se lavan todas y vuelven a
 * ser vendas.
 */
export class Washing {
  /** Dónde hay aljibes, fuentes y bebederos (no cambian). */
  private readonly sources = new Set<string>();

  constructor(
    private readonly world: World,
    private readonly ids: IdGenerator,
    private readonly items: ItemNotifications,
    private readonly notifier: Notifier,
  ) {
    for (const s of world.map.statics)
      if (WATER_SOURCES.has(s.kind)) this.sources.add(`${s.x},${s.y}`);
  }

  /** Terminó de vendar: la venda queda usada, con sangre. */
  bandageUsed(player: Player): void {
    const changes = emptyChanges();
    if (
      this.world.items.addToBackpack(player.id, 'bloody-bandage', 1, () => this.ids.next(), changes)
    )
      this.items.publish(changes, player.id);
  }

  /** Doble clic sobre las vendas ensangrentadas: lavarlas si hay agua cerca. */
  wash(playerId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const say = (text: string): void => this.notifier.send(playerId, { type: 'system', text });
    if (player.combat.isDead) return say('Los fantasmas no pueden lavar.');
    if (!this.nearWater(player.position))
      return say(
        'Necesitás agua cerca para lavarlas: el mar, un río, un aljibe, una fuente o un bebedero.',
      );
    const amount = this.world.items.countInBackpack(playerId, 'bloody-bandage');
    if (amount === 0) return;
    const changes = emptyChanges();
    this.world.items.consumeFromBackpack(playerId, 'bloody-bandage', amount, changes);
    this.world.items.addToBackpack(playerId, 'bandage', amount, () => this.ids.next(), changes);
    changes.message =
      amount === 1
        ? 'Lavás la venda: queda limpia otra vez.'
        : `Lavás las ${amount} vendas: quedan limpias otra vez.`;
    this.items.publish(changes, playerId);
  }

  /** ¿Hay agua a menos de `WASH_RANGE` tiles? */
  nearWater(at: Position): boolean {
    for (let dy = -WASH_RANGE; dy <= WASH_RANGE; dy++)
      for (let dx = -WASH_RANGE; dx <= WASH_RANGE; dx++) {
        const p = { x: at.x + dx, y: at.y + dy };
        if (isWater(this.world.map.terrainAt(p)) || this.sources.has(`${p.x},${p.y}`)) return true;
      }
    return false;
  }
}
