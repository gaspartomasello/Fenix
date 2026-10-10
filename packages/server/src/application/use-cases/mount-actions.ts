import {
  MOUNTS,
  MOUNT_RANGE,
  VENDOR_RANGE,
  isMountKind,
  tileDistance,
  type EntityId,
  type MountKind,
} from '@fenix/shared';
import { Creature } from '../../domain/creatures/creature';
import { emptyChanges } from '../../domain/items/items';
import { freeSpotNear } from '../../domain/persistence/saved-character';
import type { Player } from '../../domain/player';
import type { World } from '../../domain/world';
import type { ItemNotifications } from '../item-notifications';
import type { MobileNotifications } from '../mobile-notifications';
import type { IdGenerator, Notifier } from '../ports';

/**
 * Monturas, como en UO: se compran en la caballeriza, la montura suelta
 * sigue a su dueño, con doble clic se monta (y desaparece del mundo: va
 * debajo del jinete) y al desmontar vuelve a aparecer al lado. Cada jugador
 * tiene una sola. Al morir se cae de la montura. Suelta, pelea para su
 * dueño y la pueden matar; con `/liberar` se la deja ir.
 */
export class MountActions {
  constructor(
    private readonly world: World,
    private readonly ids: IdGenerator,
    private readonly items: ItemNotifications,
    private readonly mobiles: MobileNotifications,
    private readonly notifier: Notifier,
  ) {}

  buy(playerId: EntityId, vendorId: EntityId, kind: MountKind): void {
    const player = this.world.get(playerId);
    const vendor = this.world.getNpc(vendorId);
    if (!player || player.combat.isDead) return;
    if (!vendor || vendor.role !== 'stablemaster')
      return this.say(playerId, 'Las monturas se compran en la caballeriza.');
    if (tileDistance(vendor.position, player.position) > VENDOR_RANGE)
      return this.say(playerId, `Acercate a ${vendor.name} para comprar.`);
    if (player.mount || this.world.petOf(playerId))
      return this.say(playerId, 'Ya tenés una montura. Cuidala bien.');
    const { price, name, article } = MOUNTS[kind];
    const changes = emptyChanges();
    if (!this.world.items.consumeFromBackpack(playerId, 'gold', price, changes))
      return this.say(
        playerId,
        `No te alcanza: ${article} ${name} cuesta ${price} monedas de oro.`,
      );
    this.items.publish(changes, playerId);
    this.place(player, kind);
    this.say(
      playerId,
      `Compraste ${article} ${name}. Te sigue a todos lados; hacé doble clic sobre ${article === 'una' ? 'ella' : 'él'} para montar.`,
    );
  }

  /** Subirse a la montura propia, si está al lado. */
  mount(playerId: EntityId, petId: EntityId): void {
    const player = this.world.get(playerId);
    const pet = this.world.getMobile(petId);
    if (!player || !(pet instanceof Creature) || !pet.isPet || pet.ownerId !== playerId) return;
    if (player.combat.isDead) return this.say(playerId, 'Los fantasmas no pueden montar.');
    if (player.mount) return this.say(playerId, 'Ya estás montado.');
    if (tileDistance(pet.position, player.position) > MOUNT_RANGE)
      return this.say(playerId, 'Acercate a tu montura para subirte.');
    if (!isMountKind(pet.body)) return;
    this.mobiles.disappear(pet);
    pet.gone = true;
    this.world.removeCreature(pet.id);
    player.mount = pet.body;
    this.announce(player);
  }

  /** Bajarse: la montura aparece al lado y sigue al jinete otra vez. */
  dismount(playerId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player?.mount) return;
    const kind = player.mount;
    player.mount = null;
    this.announce(player);
    this.place(player, kind);
  }

  /** Al morir se cae de la montura, que queda al lado (como en UO). */
  dismountOnDeath(player: Player): void {
    if (player.mount) this.dismount(player.id);
  }

  /**
   * `/liberar`: la montura deja de ser del jugador y se va (si estaba
   * montado, se baja primero). No hay vuelta atrás.
   */
  releasePet(playerId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player) return;
    if (player.combat.isDead)
      return this.say(playerId, 'Los fantasmas no pueden liberar monturas.');
    let name: string;
    if (player.mount) {
      name = MOUNTS[player.mount].name;
      player.mount = null;
      this.announce(player);
    } else {
      const pet = this.world.petOf(playerId);
      if (!pet) return this.say(playerId, 'No tenés ninguna montura para liberar.');
      name = pet.name;
      this.mobiles.disappear(pet);
      pet.gone = true;
      this.world.removeCreature(pet.id);
    }
    this.say(playerId, `Liberaste a tu ${name}. Se aleja al trote y se pierde de vista.`);
  }

  /** Pone la montura suelta en el mundo, al lado de su dueño. */
  private place(player: Player, kind: MountKind): void {
    const pet = new Creature(this.ids.next(), kind, freeSpotNear(this.world, player.position), {
      ownerId: player.id,
      expiresAt: null,
    });
    pet.direction = player.direction;
    this.world.addCreature(pet);
    this.mobiles.appear(pet);
  }

  /** Quienes lo ven (y él mismo) se enteran de que montó o desmontó. */
  private announce(player: Player): void {
    const watchers = new Set([...this.mobiles.watchers(player), player.id]);
    this.notifier.sendMany(watchers, { type: 'mountChanged', id: player.id, mount: player.mount });
  }

  private say(playerId: EntityId, text: string): void {
    this.notifier.send(playerId, { type: 'system', text });
  }
}
