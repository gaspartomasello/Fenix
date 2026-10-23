import { ITEMS, dyeName, isDyeHue, isDyeable, type EntityId } from '@fenix/shared';
import { emptyChanges } from '../../domain/items/items';
import type { World } from '../../domain/world';
import type { ItemNotifications } from '../item-notifications';
import type { Notifier } from '../ports';

/**
 * Teñir, como en UO: primero se elige el color de la tina en su panel de
 * colores (el agua de la tina queda de ese color); después, con tinturas en
 * la mochila (cada teñida gasta una), la ropa de tela, las piezas de cuero y
 * las bolsas toman el color de la tina. Se tiñe lo que uno lleva: en la
 * mochila o puesto (y entonces los demás lo ven con el color nuevo).
 */
export class Dyeing {
  constructor(
    private readonly world: World,
    private readonly notifications: ItemNotifications,
    private readonly notifier: Notifier,
  ) {}

  dye(playerId: EntityId, itemId: EntityId, hue: number): void {
    const player = this.world.get(playerId);
    const item = this.world.items.get(itemId);
    if (!player || !item || player.combat.isDead || !isDyeHue(hue)) return;
    const at = item.location;
    const mine = (at.type === 'backpack' || at.type === 'equipment') && at.ownerId === playerId;
    if (!mine) return this.say(playerId, 'Solo podés teñir lo que llevás encima.');
    if (!isDyeable(item.kind))
      return this.say(playerId, `${capitalize(ITEMS[item.kind].name)} no se puede teñir.`);
    const tubs = this.world.items.backpackOf(playerId).filter((i) => i.kind === 'dye-tub');
    if (tubs.length === 0) return this.say(playerId, 'Necesitás una tina de tintura.');
    // Se tiñe del color que tiene el agua de una de las tinas.
    if (!tubs.some((t) => t.hue === hue))
      return this.say(playerId, 'Primero elegí ese color en la tina de tintura.');
    const changes = emptyChanges();
    if (!this.world.items.consumeFromBackpack(playerId, 'dyes', 1, changes))
      return this.say(playerId, 'No te quedan tinturas.');
    item.hue = hue;
    changes.inventories.add(playerId);
    if (at.type === 'equipment') changes.looks.add(playerId);
    this.notifications.publish(changes, playerId);
    this.say(
      playerId,
      `Teñiste ${ITEMS[item.kind].article} ${ITEMS[item.kind].name} de ${dyeName(hue)}.`,
    );
  }

  /** Cambiar el color del agua de la tina (no gasta nada). */
  tint(playerId: EntityId, tubId: EntityId, hue: number): void {
    const player = this.world.get(playerId);
    const tub = this.world.items.get(tubId);
    if (!player || !tub || tub.kind !== 'dye-tub' || player.combat.isDead || !isDyeHue(hue)) return;
    const at = tub.location;
    if (at.type !== 'backpack' || at.ownerId !== playerId)
      return this.say(playerId, 'La tina tiene que estar en tu mochila.');
    tub.hue = hue;
    const changes = emptyChanges();
    changes.inventories.add(playerId);
    this.notifications.publish(changes, playerId);
    this.say(playerId, `La tina ahora tiñe de ${dyeName(hue)}.`);
  }

  private say(playerId: EntityId, text: string): void {
    this.notifier.send(playerId, { type: 'system', text });
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
