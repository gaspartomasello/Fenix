import type { EntityId } from '@fenix/shared';
import { Player } from '../../domain/player';
import type { World } from '../../domain/world';
import type { MobileNotifications } from '../mobile-notifications';
import type { Notifier } from '../ports';

/** Elegir a quién atacar (el golpe lo da el ciclo del juego cuando está al alcance). */
export class Attack {
  constructor(
    private readonly world: World,
    private readonly mobiles: MobileNotifications,
    private readonly notifier: Notifier,
  ) {}

  execute(playerId: EntityId, targetId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const refuse = (text: string): void => this.notifier.send(playerId, { type: 'system', text });

    if (player.combat.isDead) return refuse('Los fantasmas no pueden pelear.');
    const target = this.world.getMobile(targetId);
    if (!target || target.id === playerId) return;
    if (target instanceof Player) return refuse('Todavía no se puede atacar a otros jugadores.');
    if (target.combat.isDead) return;

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
