import type { Position } from '@fenix/shared/geometry/position';
import { SPELLS, type SpellKey } from '@fenix/shared/magic/spell-catalog';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { startCast } from '../../../domain/magic/spellcasting';
import { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { ItemNotifications } from '../../kernel/item-notifications';
import type { MobileNotifications } from '../../kernel/mobile-notifications';
import type { Clock, Notifier } from '../../ports';
import type { SocialNotifications } from '../../kernel/social-notifications';
import { safetyRefusal } from '../../kernel/aggression';

export interface CastSpellInput {
  readonly spell: SpellKey;
  readonly targetId?: EntityId;
  readonly position?: Position;
  readonly scrollId?: EntityId;
  readonly runeId?: EntityId;
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
    // Con el seguro puesto, nada dañino contra un inocente.
    const target = request.targetId ? this.world.getMobile(request.targetId) : undefined;
    const unsafe =
      target && SPELLS[spell].target === 'harmful' ? safetyRefusal(player, target) : null;
    if (unsafe) {
      this.notifier.send(playerId, { type: 'system', text: unsafe });
      return;
    }
    const result = startCast(player, spell, request, this.world, now);
    if (!result.ok) {
      this.notifier.send(playerId, { type: 'system', text: result.reason });
      return;
    }
    // El crimen no es empezar el hechizo: es que lastime (lo marca el ciclo del juego).
    const victim = result.aggressionAgainst;
    if (victim instanceof Player)
      this.notifier.send(victim.id, {
        type: 'system',
        text: `¡${player.name} te está atacando!`,
      });
    this.items.publish(result.itemChanges, playerId);
    this.mobiles.sendVitals(player);
    this.mobiles.castStart(player, spell);
  }
}
