import { describeItem } from '@fenix/shared/items/item-catalog';
import { withinReach } from '@fenix/shared/items/item-rules';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { Creature, EMPTY_CORPSE_MS } from '../../../domain/creatures/creature';
import { emptyChanges, type CorpseDrop } from '../../../domain/items/items';
import type { Position } from '@fenix/shared/geometry/position';
import type { Item } from '../../../domain/items/item';
import type { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { ItemNotifications } from '../../kernel/item-notifications';
import type { SocialNotifications } from '../../kernel/social-notifications';
import type { Clock, IdGenerator, Notifier } from '../../ports';

/** Cuánto queda un cuerpo con botín antes de deshacerse (y lo que tenga, con él). */
export const LOOTED_CORPSE_MS = 120_000;

/**
 * El cuerpo de un jugador dura 7 minutos; después se vuelve un montón de
 * huesos, con lo que quedaba adentro, que dura otros 7 (como en UO).
 */
export const PLAYER_CORPSE_MS = 7 * 60_000;
export const PLAYER_BONES_MS = 7 * 60_000;

/**
 * Cuerpos que se revisan, como en UO: el botín de una criatura queda dentro
 * de su cuerpo. Con doble clic se abre y se ve qué tiene; los objetos se
 * arrastran a la mochila (o "Tomar todo"). Cuando se vacía o pasa el
 * tiempo, el cuerpo desaparece.
 */
export class Corpses {
  /** Qué cuerpo tiene abierto cada jugador. */
  private readonly viewers = new Map<EntityId, EntityId>();
  /** Cuerpos y huesos de jugadores (objetos en el suelo): cuándo se deshacen. */
  private readonly playerCorpses = new Map<EntityId, number>();

  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly items: ItemNotifications,
    private readonly notifier: Notifier,
    private readonly social: SocialNotifications,
  ) {
    items.watchCorpses((corpseId, actorId) => {
      this.looted(corpseId, actorId);
      this.refresh(corpseId);
    });
  }

  /**
   * Murió un jugador: queda su cuerpo donde cayó, con todo lo que llevaba
   * (menos el equipo inicial). Lo revisa cualquiera, de a un objeto.
   */
  playerDied(player: Player): void {
    const at = { ...player.position };
    const corpse = this.world.items.add(this.ids.next(), 'player-corpse', 1, {
      type: 'ground',
      position: at,
    });
    corpse.corpse = {
      name: player.name,
      ownerId: player.id,
      innocent: player.reputation.notoriety === 'innocent',
    };
    const changes = this.world.items.strip(player.id, corpse.id, at);
    changes.groundAdded.push(corpse);
    this.items.publish(changes, player.id);
    this.playerCorpses.set(corpse.id, this.clock.now() + PLAYER_CORPSE_MS);
  }

  /** Doble clic sobre el cuerpo (o los huesos) de un jugador. */
  openPlayerCorpse(playerId: EntityId, itemId: EntityId): void {
    const item = this.world.items.get(itemId);
    if (!item?.corpse || item.location.type !== 'ground') return;
    this.open(playerId, itemId);
  }

  /**
   * Sacar algo del cuerpo de un inocente es un crimen (salvo que sea el
   * propio): quien lo hace queda criminal un rato.
   */
  private looted(corpseId: EntityId, actorId: EntityId): void {
    const corpse = this.world.items.get(corpseId)?.corpse;
    if (!corpse || !corpse.innocent || actorId === corpse.ownerId) return;
    const looter = this.world.get(actorId);
    if (!looter || !looter.reputation.markCriminal(this.clock.now())) return;
    this.say(
      actorId,
      `Saqueaste el cuerpo de ${corpse.name}, que era inocente: ahora sos criminal.`,
    );
    this.social.statusChanged(looter);
  }

  /** Los cuerpos de los jugadores se vuelven huesos, y los huesos se deshacen. */
  tick(now: number): void {
    for (const [id, until] of this.playerCorpses) {
      if (now < until) continue;
      this.playerCorpses.delete(id);
      const item = this.world.items.get(id);
      if (!item?.corpse || item.location.type !== 'ground') continue;
      const changes = emptyChanges();
      if (item.kind === 'player-corpse') {
        const bones = this.world.items.add(this.ids.next(), 'player-bones', 1, {
          type: 'ground',
          position: item.location.position,
        });
        bones.corpse = item.corpse;
        this.world.items.moveCorpse(id, bones.id);
        changes.groundAdded.push(bones);
        this.playerCorpses.set(bones.id, now + PLAYER_BONES_MS);
        this.close(id);
      } else {
        this.close(id);
        this.world.items.removeCorpse(id);
      }
      this.world.items.destroy(id, changes);
      this.items.publish(changes, item.corpse.ownerId);
    }
  }

  /** Guarda el botín en el cuerpo y decide cuánto dura. Devuelve si quedó algo adentro. */
  fill(creature: Creature, drops: readonly CorpseDrop[]): boolean {
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

  /** "Tomar todo": pasa a la mochila todo lo que entre (no en el cuerpo de un jugador). */
  lootAll(playerId: EntityId, corpseId: EntityId): void {
    const player = this.world.get(playerId);
    const corpse = this.corpse(corpseId);
    if (!player || !corpse || player.combat.isDead || this.playerCorpse(corpseId)) return;
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
    this.close(corpseId);
    this.world.items.removeCorpse(corpseId);
  }

  /** Se cierran las ventanas de un cuerpo. */
  private close(corpseId: EntityId): void {
    for (const [playerId, open] of this.viewers) {
      if (open !== corpseId) continue;
      this.viewers.delete(playerId);
      this.notifier.send(playerId, { type: 'corpseClosed', corpseId });
    }
  }

  /** El jugador salió del mundo. */
  forget(playerId: EntityId): void {
    this.viewers.delete(playerId);
  }

  /** Cambió lo que hay adentro: se avisa a quienes lo tienen abierto. */
  private refresh(corpseId: EntityId): void {
    const corpse = this.corpse(corpseId);
    if (!corpse) return;
    if (
      corpse instanceof Creature &&
      this.world.items.corpseOf(corpseId).length === 0 &&
      corpse.despawnAt !== null
    ) {
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

  /** Un cuerpo: el de una criatura muerta o el de un jugador (un objeto en el suelo). */
  private corpse(
    corpseId: EntityId,
  ): { id: EntityId; name: string; position: Position } | undefined {
    const player = this.playerCorpse(corpseId);
    if (player?.corpse && player.location.type === 'ground')
      return {
        id: player.id,
        name: `${player.kind === 'player-bones' ? 'restos' : 'cuerpo'} de ${player.corpse.name}`,
        position: player.location.position,
      };
    const mobile = this.world.getMobile(corpseId);
    return mobile instanceof Creature && mobile.combat.isDead && !mobile.gone ? mobile : undefined;
  }

  private playerCorpse(corpseId: EntityId): Item | undefined {
    const item = this.world.items.get(corpseId);
    return item?.corpse ? item : undefined;
  }

  private send(playerId: EntityId, corpse: { id: EntityId; name: string }): void {
    this.notifier.send(playerId, {
      type: 'corpse',
      corpseId: corpse.id,
      name: corpse.name,
      items: this.world.items.corpseOf(corpse.id).flatMap((i) => i.toBackpackSnapshot() ?? []),
      ...(this.playerCorpse(corpse.id) ? { noTakeAll: true as const } : {}),
    });
  }

  private say(playerId: EntityId, text: string): void {
    this.notifier.send(playerId, { type: 'system', text });
  }
}
