import { describeItem, step, tileDistance, type Position } from '@fenix/shared';
import { trySwing, type SwingResult } from '../domain/combat/combat';
import { CORPSE_MS, RESPAWN_MS, type Creature } from '../domain/creatures/creature';
import { canMoveTo, chooseStep, updateTarget } from '../domain/creatures/creature-ai';
import { rollLoot } from '../domain/creatures/loot';
import { Player } from '../domain/player';
import type { World } from '../domain/world';
import type { ItemNotifications } from './item-notifications';
import type { MobileNotifications } from './mobile-notifications';
import type { IdGenerator, Notifier, RandomSource } from './ports';

/** Distancia al santuario para que un fantasma vuelva a la vida. */
export const SHRINE_RANGE = 2;
/** Vida con la que se resucita. */
export const RESURRECT_HEALTH = 0.5;

/**
 * El pulso del mundo: cada tick hace actuar a las criaturas, resuelve los
 * golpes automáticos de los jugadores, regenera vitales y resucita a los
 * fantasmas que llegan al santuario.
 */
export class GameLoop {
  private readonly shrines: readonly Position[];

  constructor(
    private readonly world: World,
    private readonly mobiles: MobileNotifications,
    private readonly items: ItemNotifications,
    private readonly notifier: Notifier,
    private readonly ids: IdGenerator,
    private readonly random: RandomSource,
  ) {
    this.shrines = world.map.statics.filter((s) => s.kind === 'shrine');
  }

  tick(now: number): void {
    for (const player of this.world.allPlayers()) this.tickPlayer(player, now);
    for (const creature of this.world.allCreatures()) this.tickCreature(creature, now);
  }

  private tickPlayer(player: Player, now: number): void {
    if (player.combat.isDead) {
      this.tryResurrect(player, now);
      return;
    }
    const targetId = player.combat.targetId;
    if (targetId) {
      const target = this.world.getMobile(targetId);
      if (!target || target.combat.isDead) {
        player.combat.targetId = null;
        this.mobiles.sendTarget(player);
      } else {
        const result = trySwing(player, target, this.world, now, () => this.random.next());
        if (result) this.resolve(result, now);
      }
    }
    if (player.combat.regenerate(now)) {
      this.mobiles.sendVitals(player);
      this.mobiles.broadcastHealth(player);
    }
  }

  private tickCreature(creature: Creature, now: number): void {
    if (creature.gone) {
      if (creature.respawnAt !== null && now >= creature.respawnAt) {
        creature.respawn();
        this.mobiles.appear(creature);
      }
      return;
    }
    if (creature.combat.isDead) {
      if (creature.despawnAt !== null && now >= creature.despawnAt) {
        this.mobiles.disappear(creature);
        creature.gone = true;
        creature.respawnAt = now + RESPAWN_MS;
      }
      return;
    }

    const target = updateTarget(creature, this.world);
    if (target) {
      const result = trySwing(creature, target, this.world, now, () => this.random.next());
      if (result) this.resolve(result, now);
    }
    if (now >= creature.nextMoveAt) {
      const direction = chooseStep(creature, target, this.world, () => this.random.next());
      creature.nextMoveAt =
        now + creature.definition.moveMs * (direction === null && !target ? 3 : 1);
      if (direction !== null && canMoveTo(creature, direction, this.world)) {
        const watchersBefore = this.mobiles.watchers(creature);
        creature.position = step(creature.position, direction);
        creature.direction = direction;
        this.mobiles.moved(creature, watchersBefore);
      }
    }
    if (creature.combat.regenerate(now) && !target) this.mobiles.broadcastHealth(creature);
  }

  private resolve(result: SwingResult, now: number): void {
    this.mobiles.swing(result);
    if (!result.killed) return;
    const { attacker, target } = result;

    if (target instanceof Player) {
      this.mobiles.broadcastHealth(target);
      this.notifier.send(target.id, {
        type: 'system',
        text: 'Moriste. Caminá hasta el santuario de Puerto Ceniza para volver a la vida.',
      });
      return;
    }

    const creature = target as Creature;
    creature.despawnAt = now + CORPSE_MS;
    if (attacker instanceof Player) {
      this.notifier.send(attacker.id, {
        type: 'system',
        text: `Mataste ${creature.definition.article} ${creature.name}.`,
      });
      attacker.combat.targetId = null;
      this.mobiles.sendTarget(attacker);
    }
    this.dropLoot(creature);
  }

  private dropLoot(creature: Creature): void {
    const drops = rollLoot(creature.definition, () => this.random.next());
    for (const drop of drops) {
      const item = this.world.items.add(this.ids.next(), drop.kind, drop.amount, {
        type: 'ground',
        position: creature.position,
      });
      this.items.publish(
        { groundRemoved: [], groundAdded: [item], inventories: new Set(), looks: new Set() },
        creature.id,
      );
    }
    const names = drops.map((d) => describeItem(d.kind, d.amount));
    if (names.length > 0) {
      for (const id of this.mobiles.watchers(creature)) {
        this.notifier.send(id, {
          type: 'system',
          text: `${capitalize(creature.definition.article)} ${creature.name} dejó: ${names.join(', ')}.`,
        });
      }
    }
  }

  private tryResurrect(player: Player, now: number): void {
    const nearShrine = this.shrines.some((s) => tileDistance(s, player.position) <= SHRINE_RANGE);
    if (!nearShrine) return;
    player.combat.resurrect(RESURRECT_HEALTH, now);
    this.mobiles.sendVitals(player);
    this.mobiles.broadcastHealth(player);
    this.notifier.send(player.id, { type: 'system', text: '¡Volviste a la vida!' });
  }
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
