import type { EntityId } from '@fenix/shared';
import { Npc } from '../../domain/npcs/npc';
import { Player } from '../../domain/player';
import { pvpRefusal } from '../../domain/social/pvp';
import type { World } from '../../domain/world';
import type { MobileNotifications } from '../mobile-notifications';
import type { Clock, Notifier } from '../ports';
import type { SocialNotifications } from '../social-notifications';

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
    if (target.combat.isDead) return;
    if (target instanceof Player) {
      const reason = pvpRefusal(player, target, this.world);
      if (reason) return refuse(reason);
      this.commitAggression(player, target);
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

  /** Atacar a un inocente es un crimen: quien ataca queda como criminal un rato. */
  private commitAggression(attacker: Player, target: Player): void {
    this.notifier.send(target.id, { type: 'system', text: `¡${attacker.name} te está atacando!` });
    if (target.reputation.notoriety !== 'innocent') return;
    if (attacker.reputation.markCriminal(this.clock.now())) {
      this.notifier.send(attacker.id, {
        type: 'system',
        text: 'Atacaste a un inocente: ahora sos criminal y atacarte no es delito.',
      });
      this.social.statusChanged(attacker);
    }
  }
}
