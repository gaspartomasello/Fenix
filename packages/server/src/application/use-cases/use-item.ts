import { ITEMS, describeItem, type EntityId, type ItemKind } from '@fenix/shared';
import { startBandage } from '../../domain/healing/bandage';
import { consume } from '../../domain/items/consumables';
import type { World } from '../../domain/world';
import type { ItemNotifications } from '../item-notifications';
import type { MobileNotifications } from '../mobile-notifications';
import type { Clock, IdGenerator, Notifier, RandomSource } from '../ports';
import type { EconomyActions } from './economy-actions';

/** Lo que suena al tocar un instrumento. */
const TUNES: readonly string[] = [
  'una melodía alegre que invita a bailar.',
  'una canción triste de marineros.',
  'una balada sobre un dragón y un caballero.',
  'un ritmo rápido que hace golpear los pies.',
  'una tonada antigua que nadie recuerda dónde nació.',
];

/** Doble clic sobre un objeto, o usarlo sobre alguien (vendas). */
export class UseItem {
  /** Lo arma la aplicación: abrir una bolsa o una caja. */
  openContainer: (playerId: EntityId, containerId: string) => void = () => {};
  /** Lo arma la aplicación: abrir un libro para leer o escribir. */
  openBook: (playerId: EntityId, itemId: EntityId) => void = () => {};
  /** Lo arma la aplicación: leer un mapa del tesoro. */
  openTreasureMap: (playerId: EntityId, itemId: EntityId) => void = () => {};
  /** Lo arma la aplicación: botar el barco de una maqueta. */
  launchShip: (playerId: EntityId, itemId: EntityId) => void = () => {};

  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly random: RandomSource,
    private readonly notifications: ItemNotifications,
    private readonly notifier: Notifier,
    private readonly mobiles: MobileNotifications,
    private readonly economy: EconomyActions,
  ) {}

  /** Tocar un instrumento: lo escuchan todos los que están cerca. */
  private play(playerId: EntityId, kind: ItemKind): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const tune = TUNES[Math.floor(this.random.next() * TUNES.length)] ?? TUNES[0];
    const text = `${player.name} toca ${ITEMS[kind].article === 'una' ? 'la' : 'el'} ${ITEMS[kind].name}: ${tune}`;
    for (const id of this.mobiles.watchers(player))
      this.notifier.send(id, { type: 'system', text });
  }

  execute(playerId: EntityId, itemId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player) return;
    if (player.combat.isDead) {
      this.notifier.send(playerId, {
        type: 'system',
        text: 'Los fantasmas no pueden tocar objetos.',
      });
      return;
    }
    // Doble clic sobre el mineral: fundirlo en una forja cercana.
    const item = this.world.items.get(itemId);
    if (item?.kind === 'iron-ore' && item.ownerId() === playerId) {
      this.economy.smelt(playerId);
      return;
    }
    // Doble clic sobre una bolsa: se abre.
    if (item && ITEMS[item.kind].capacity) {
      this.openContainer(playerId, itemId);
      return;
    }
    if (item && ITEMS[item.kind].use === 'music' && item.ownerId() === playerId) {
      this.play(playerId, item.kind);
      return;
    }
    if (item && ITEMS[item.kind].use === 'book') {
      this.openBook(playerId, itemId);
      return;
    }
    if (item && ITEMS[item.kind].use === 'ship') {
      this.launchShip(playerId, itemId);
      return;
    }
    if (item && ITEMS[item.kind].use === 'map') {
      this.openTreasureMap(playerId, itemId);
      return;
    }
    const result = this.world.items.use(player, itemId);
    if (!result.ok) {
      this.notifier.send(playerId, { type: 'system', text: result.reason });
      return;
    }
    const changes = result.changes;
    const consumed = changes.consumed;
    if (consumed) {
      const effect = consume(player, consumed, this.clock.now(), () => this.random.next());
      changes.message = effect.message;
      // La botella vacía vuelve a la mochila, como en UO.
      if (ITEMS[consumed].potion)
        this.world.items.addToBackpack(playerId, 'empty-bottle', 1, () => this.ids.next(), changes);
      this.mobiles.sendVitals(player);
      this.mobiles.broadcastHealth(player);
      if (effect.effectsChanged) this.mobiles.sendEffects(player);
    }
    this.notifications.publish(changes, playerId);
  }

  /** Usar un objeto sobre alguien: por ahora, vendarlo. */
  useOn(playerId: EntityId, itemId: EntityId, targetId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const item = this.world.items.get(itemId);
    if (item?.kind !== 'bandage') {
      this.notifier.send(playerId, {
        type: 'system',
        text: item
          ? `No podés usar ${describeItem(item.kind)} sobre alguien.`
          : 'Ese objeto ya no está.',
      });
      return;
    }
    const result = startBandage(player, itemId, targetId, this.world, this.clock.now());
    if (!result.ok) {
      this.notifier.send(playerId, { type: 'system', text: result.reason });
      return;
    }
    const self = result.target.id === playerId;
    result.changes.message = self
      ? 'Empezás a vendarte.'
      : `Empezás a vendar a ${result.target.name}.`;
    this.notifications.publish(result.changes, playerId);
    if (!self)
      this.notifier.send(result.target.id, {
        type: 'system',
        text: `${player.name} empieza a vendarte.`,
      });
  }
}
