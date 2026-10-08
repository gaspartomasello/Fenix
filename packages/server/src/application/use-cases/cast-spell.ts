import type { EntityId, Position, SpellKey } from '@fenix/shared';
import { startCast } from '../../domain/magic/spellcasting';
import type { World } from '../../domain/world';
import type { ItemNotifications } from '../item-notifications';
import type { MobileNotifications } from '../mobile-notifications';
import type { Clock, Notifier } from '../ports';
import type { SocialNotifications } from '../social-notifications';
import { commitAggression } from './aggression';

export interface CastSpellInput {
  readonly spell: SpellKey;
  readonly targetId?: EntityId;
  readonly position?: Position;
  readonly scrollId?: EntityId;
}

/** Empezar a lanzar un hechizo; el ciclo del juego lo resuelve al terminar el tiempo de lanzamiento. */
export class CastSpell {
  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly mobiles: MobileNotifications,
    private readonly items: ItemNotifications,
    private readonly social: SocialNotifications,
    private readonly notifier: Notifier,
  ) {}

  execute(playerId: EntityId, { spell, ...request }: CastSpellInput): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const now = this.clock.now();
    const result = startCast(player, spell, request, this.world, now);
    if (!result.ok) {
      this.notifier.send(playerId, { type: 'system', text: result.reason });
      return;
    }
    if (result.aggressionAgainst)
      commitAggression(player, result.aggressionAgainst, now, this.notifier, this.social);
    this.items.publish(result.itemChanges, playerId);
    this.mobiles.sendVitals(player);
    this.mobiles.castStart(player, spell);
  }
}
