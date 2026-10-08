import type { EntityId } from '@fenix/shared';
import { Creature } from '../../domain/creatures/creature';
import { Npc } from '../../domain/npcs/npc';
import { Player } from '../../domain/player';
import { pvpRefusal } from '../../domain/social/pvp';
import type { World } from '../../domain/world';
import type { MobileNotifications } from '../mobile-notifications';
import type { Clock, Notifier } from '../ports';
import type { SocialNotifications } from '../social-notifications';
import { commitAggression } from './aggression';

/** Elegir a quién atacar (el golpe lo da el ciclo del juego cuando está al alcance). */
export class Attack {
  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly mobiles: MobileNotifications,
    private readonly social: SocialNotifications,
    private readonly notifier: Notifier,
  ) {}

  execute(playerId: EntityId, targetId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const refuse = (text: string): void => this.notifier.send(playerId, { type: 'system', text });

    if (player.combat.isDead) return refuse('Los fantasmas no pueden pelear.');
    const target = this.world.getMobile(targetId);
    if (!target || target.id === playerId) return;
    if (target instanceof Npc) return refuse(`No podés atacar a ${target.name}.`);
    if (target instanceof Creature && target.ownerId === playerId)
      return refuse('Es una criatura que invocaste vos.');
    if (target.combat.isDead) return;
    if (target instanceof Player) {
      const reason = pvpRefusal(player, target, this.world);
      if (reason) return refuse(reason);
      commitAggression(player, target, this.clock.now(), this.notifier, this.social);
    }

    player.combat.targetId = target.id;
    this.mobiles.sendTarget(player);
  }

  stop(playerId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player || player.combat.targetId === null) return;
    player.combat.targetId = null;
    this.mobiles.sendTarget(player);
  }
}
