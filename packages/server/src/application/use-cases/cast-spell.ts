import type { EntityId, SpellKey } from '@fenix/shared';
import { startCast } from '../../domain/magic/spellcasting';
import type { World } from '../../domain/world';
import type { ItemNotifications } from '../item-notifications';
import type { MobileNotifications } from '../mobile-notifications';
import type { Clock, Notifier } from '../ports';

/** Empezar a lanzar un hechizo; el ciclo del juego lo resuelve al terminar el tiempo de lanzamiento. */
export class CastSpell {
  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly mobiles: MobileNotifications,
    private readonly items: ItemNotifications,
    private readonly notifier: Notifier,
  ) {}

  execute(playerId: EntityId, spell: SpellKey, targetId: EntityId | undefined): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const result = startCast(player, spell, targetId, this.world, this.clock.now());
    if (!result.ok) {
      this.notifier.send(playerId, { type: 'system', text: result.reason });
      return;
    }
    this.items.publish(result.itemChanges, playerId);
    this.mobiles.sendVitals(player);
    this.mobiles.castStart(player, spell);
  }
}
