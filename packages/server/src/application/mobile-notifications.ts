import type { EntityId } from '@fenix/shared';
import type { SwingResult } from '../domain/combat/combat';
import type { Mobile } from '../domain/mobile';
import { Player } from '../domain/player';
import type { World } from '../domain/world';
import type { Notifier } from './ports';

/**
 * Avisos sobre jugadores y criaturas: vitales propios, vida de quienes se
 * ven, golpes, y aparecer o desaparecer del rango de visión.
 */
export class MobileNotifications {
  constructor(
    private readonly world: World,
    private readonly notifier: Notifier,
  ) {}

  sendVitals(player: Player): void {
    this.notifier.send(player.id, {
      type: 'vitals',
      vitals: player.combat.current,
      dead: player.combat.isDead,
    });
  }

  broadcastHealth(mobile: Mobile): void {
    this.notifier.sendMany(this.watchers(mobile), {
      type: 'mobileHealth',
      id: mobile.id,
      health: mobile.combat.health,
      dead: mobile.combat.isDead,
    });
  }

  swing(result: SwingResult): void {
    const { attacker, target, hit, damage } = result;
    this.notifier.sendMany(this.watchers(target), {
      type: 'swing',
      attackerId: attacker.id,
      targetId: target.id,
      hit,
      damage,
    });
    if (hit) {
      this.broadcastHealth(target);
      if (target instanceof Player) this.sendVitals(target);
    }
  }

  sendTarget(player: Player): void {
    this.notifier.send(player.id, { type: 'combatTarget', targetId: player.combat.targetId });
  }

  appear(mobile: Mobile): void {
    this.notifier.sendMany(this.watchers(mobile), {
      type: 'mobileAppeared',
      mobile: this.world.snapshotOf(mobile),
    });
  }

  disappear(mobile: Mobile, watchers: readonly EntityId[] = this.watchers(mobile)): void {
    this.notifier.sendMany(watchers, { type: 'mobileDisappeared', id: mobile.id });
  }

  /** Después de que una criatura se movió: el paso a quienes la seguían viendo, y aparecer/desaparecer al resto. */
  moved(mobile: Mobile, watchersBefore: readonly EntityId[]): void {
    const before = new Set(watchersBefore);
    const after = this.watchers(mobile);
    const afterSet = new Set(after);
    this.notifier.sendMany(
      after.filter((id) => before.has(id)),
      {
        type: 'mobileMoved',
        id: mobile.id,
        position: mobile.position,
        direction: mobile.direction,
        mode: 'walk',
      },
    );
    this.notifier.sendMany(
      after.filter((id) => !before.has(id)),
      { type: 'mobileAppeared', mobile: this.world.snapshotOf(mobile) },
    );
    this.disappear(
      mobile,
      watchersBefore.filter((id) => !afterSet.has(id)),
    );
  }

  /** Jugadores (los únicos que reciben mensajes) que ven a este mobile. */
  watchers(mobile: Mobile): EntityId[] {
    return this.world
      .mobilesNear(mobile.position)
      .filter((m): m is Player => m instanceof Player)
      .map((p) => p.id);
  }
}
