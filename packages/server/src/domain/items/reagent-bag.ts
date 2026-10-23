import { REAGENTS } from '@fenix/shared/character/creation';
import type { EntityId } from '@fenix/shared/protocol/messages';
import type { Player } from '../player';
import type { World } from '../world';
import type { ItemChanges } from './items';

/**
 * Como en UO, los reactivos van en su bolsa dentro de la mochila: junta los
 * que están sueltos en la bolsa que ya tiene reactivos (o en una bolsa nueva).
 * La bolsa es de cuero común: se puede teñir. `newbie`: equipo inicial.
 */
export function bagReagents(
  player: Player,
  world: World,
  ids: () => EntityId,
  changes: ItemChanges,
  newbie = false,
): void {
  const items = world.items;
  const loose = items
    .backpackOf(player.id)
    .filter((i) => REAGENTS.includes(i.kind) && i.newbie === newbie);
  if (loose.length === 0) return;
  const bags = items.backpackOf(player.id).filter((i) => i.kind === 'bag');
  let bag = bags.find((b) => items.contentsOf(b.id).some((i) => REAGENTS.includes(i.kind)));
  if (!bag) {
    bag = items.add(ids(), 'bag', 1, {
      type: 'backpack',
      ownerId: player.id,
      position: items.freeSpot(player.id),
    });
    bag.newbie = newbie;
    changes.inventories.add(player.id);
  }
  for (const reagent of loose) {
    const moved = items.move(
      player,
      reagent.id,
      { type: 'container', containerId: bag.id },
      world.map,
    );
    if (moved.ok) {
      for (const id of moved.changes.inventories) changes.inventories.add(id);
      for (const id of moved.changes.containers) changes.containers.add(id);
    }
  }
}
