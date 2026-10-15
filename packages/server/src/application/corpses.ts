import { describeItem, withinReach, type EntityId, type ItemKind } from '@fenix/shared';
import { Creature } from '../domain/creatures/creature';
import type { World } from '../domain/world';
import type { ItemNotifications } from './item-notifications';
import type { Clock, IdGenerator, Notifier } from './ports';

/** Cuánto queda un cuerpo con botín antes de deshacerse (y lo que tenga, con él). */
export const LOOTED_CORPSE_MS = 120_000;
/** Un cuerpo vacío (sin botín, o ya revisado) queda tirado un rato y se deshace. */
export const EMPTY_CORPSE_MS = 20_000;

/**
 * Cuerpos que se revisan, como en UO: el botín de una criatura queda dentro
 * de su cuerpo. Con doble clic se abre y se ve qué tiene; los objetos se
 * arrastran a la mochila (o "Tomar todo"). Cuando se vacía o pasa el
 * tiempo, el cuerpo desaparece.
 */
export class Corpses {
  /** Qué cuerpo tiene abierto cada jugador. */
  private readonly viewers = new Map<EntityId, EntityId>();

  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly items: ItemNotifications,
    private readonly notifier: Notifier,
  ) {
    items.onCorpseChanged = (corpseId) => this.refresh(corpseId);
  }

  /** Guarda el botín en el cuerpo y decide cuánto dura. Devuelve si quedó algo adentro. */
  fill(creature: Creature, drops: readonly { kind: ItemKind; amount: number }[]): boolean {
    const now = this.clock.now();
    if (drops.length === 0) {
      creature.despawnAt = now + EMPTY_CORPSE_MS;
      return false;
    }
    this.world.items.fillCorpse(creature.id, creature.position, drops, () => this.ids.next());
    creature.despawnAt = now + LOOTED_CORPSE_MS;
    return true;
  }

  /** Doble clic sobre un cuerpo: se abre su ventana si está cerca. */
  open(playerId: EntityId, corpseId: EntityId): void {
    const player = this.world.get(playerId);
    const corpse = this.corpse(corpseId);
    if (!player || !corpse) return;
    if (player.combat.isDead) {
      this.say(playerId, 'Los fantasmas no pueden revisar cuerpos.');
      return;
    }
    if (!withinReach(player.position, corpse.position)) {
      this.say(playerId, 'Acercate al cuerpo para revisarlo.');
      return;
    }
    this.viewers.set(playerId, corpseId);
    this.send(playerId, corpse);
  }

  /** "Tomar todo": pasa a la mochila todo lo que entre. */
  lootAll(playerId: EntityId, corpseId: EntityId): void {
    const player = this.world.get(playerId);
    const corpse = this.corpse(corpseId);
    if (!player || !corpse || player.combat.isDead) return;
    const taken: string[] = [];
    for (const item of this.world.items.corpseOf(corpseId)) {
      const description = describeItem(item.kind, item.amount);
      const result = this.world.items.move(player, item.id, { type: 'backpack' }, this.world.map);
      if (!result.ok) {
        this.say(playerId, result.reason);
        break;
      }
      taken.push(description);
      // Un solo aviso al final, en vez de uno por objeto.
      delete result.changes.message;
      this.items.publish(result.changes, playerId);
    }
    if (taken.length > 0) this.say(playerId, `Tomaste: ${taken.join(', ')}.`);
  }

  /** El cuerpo se deshizo: se cierran sus ventanas y lo que quedaba se pierde. */
  remove(corpseId: EntityId): void {
    for (const [playerId, open] of this.viewers) {
      if (open !== corpseId) continue;
      this.viewers.delete(playerId);
      this.notifier.send(playerId, { type: 'corpseClosed', corpseId });
    }
    this.world.items.removeCorpse(corpseId);
  }

  /** El jugador salió del mundo. */
  forget(playerId: EntityId): void {
    this.viewers.delete(playerId);
  }

  /** Cambió lo que hay adentro: se avisa a quienes lo tienen abierto. */
  private refresh(corpseId: EntityId): void {
    const corpse = this.corpse(corpseId);
    if (!corpse) return;
    if (this.world.items.corpseOf(corpseId).length === 0 && corpse.despawnAt !== null) {
      corpse.despawnAt = Math.min(corpse.despawnAt, this.clock.now() + EMPTY_CORPSE_MS);
    }
    for (const [playerId, open] of this.viewers) {
      if (open !== corpseId) continue;
      const player = this.world.get(playerId);
      if (player && withinReach(player.position, corpse.position)) {
        this.send(playerId, corpse);
      } else {
        this.viewers.delete(playerId);
        this.notifier.send(playerId, { type: 'corpseClosed', corpseId });
      }
    }
  }

  private corpse(corpseId: EntityId): Creature | undefined {
    const mobile = this.world.getMobile(corpseId);
    return mobile instanceof Creature && mobile.combat.isDead && !mobile.gone ? mobile : undefined;
  }

  private send(playerId: EntityId, corpse: Creature): void {
    this.notifier.send(playerId, {
      type: 'corpse',
      corpseId: corpse.id,
      name: corpse.name,
      items: this.world.items.corpseOf(corpse.id).flatMap((i) => i.toBackpackSnapshot() ?? []),
    });
  }

  private say(playerId: EntityId, text: string): void {
    this.notifier.send(playerId, { type: 'system', text });
  }
}
