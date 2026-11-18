import { FURNITURE_REACH, furnitureItemOf, turned } from '@fenix/shared/housing/furniture';
import { tileDistance, type Position } from '@fenix/shared/geometry/position';
import { ITEMS, describeItem } from '@fenix/shared/items/item-catalog';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { STATICS } from '@fenix/shared/world/statics';
import { emptyChanges } from '../../../domain/items/items';
import type { World } from '../../../domain/world';
import type { ItemNotifications } from '../../kernel/item-notifications';
import type { GameServices } from '../../kernel/services';
import type { IdGenerator, Notifier } from '../../ports';

const same = (a: Position, b: Position): boolean => a.x === b.x && a.y === b.y;
const SIDES: readonly Position[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * Amueblar la casa, como en UO: un mueble de la mochila (hecho por un
 * carpintero) se pone en un lugar libre del piso de adentro de la casa propia
 * y queda ahí: ocupa su tile, no se roba y se guarda con la casa. El dueño o
 * un copropietario lo gira o lo vuelve a guardar en la mochila.
 */
export class Furniture {
  constructor(
    private readonly world: World,
    private readonly ids: IdGenerator,
    private readonly items: ItemNotifications,
    private readonly notifier: Notifier,
    private readonly houses: GameServices['houses'],
  ) {}

  place(playerId: EntityId, itemId: EntityId, at: Position): void {
    const player = this.world.get(playerId);
    const item = this.world.items.get(itemId);
    if (!player || player.combat.isDead || !item) return;
    const piece = ITEMS[item.kind].furniture;
    if (!piece || item.ownerId() !== playerId || item.location.type !== 'backpack') return;
    const say = (text: string): void => this.say(playerId, text);
    const house = this.houses.at(at);
    if (!house) return say('Los muebles se ponen adentro de tu casa.');
    if (!house.canFurnish(player.name))
      return say(`Solo el dueño o un copropietario puede amueblar «${house.name}».`);
    if (!house.indoors(at)) return say('Ponelo adentro de la casa, no en el patio.');
    if (tileDistance(player.position, at) > FURNITURE_REACH)
      return say('Acercate más al lugar donde lo querés poner.');
    if (house.furniture.length >= house.limit)
      return say(`Ya no entran más muebles en «${house.name}» (hasta ${house.limit}).`);
    const problem = this.spotProblem(at);
    if (problem) return say(problem);

    const changes = emptyChanges();
    this.world.items.destroy(item.id, changes);
    changes.message = `Pusiste ${describeItem(item.kind)}.`;
    this.items.publish(changes, playerId);
    this.houses.setFurniture(house.id, [...house.furniture, { kind: piece, ...at }]);
  }

  /** Girar un mueble puesto o volver a guardarlo en la mochila. */
  act(playerId: EntityId, at: Position, action: 'turn' | 'pickUp'): void {
    const player = this.world.get(playerId);
    if (!player || player.combat.isDead) return;
    const say = (text: string): void => this.say(playerId, text);
    const house = this.houses.at(at);
    const piece = house?.furniture.find((p) => same(p, at));
    if (!house || !piece) return say('Ahí no hay un mueble de una casa.');
    if (!house.canFurnish(player.name))
      return say(`Solo el dueño o un copropietario puede tocar los muebles de «${house.name}».`);
    if (tileDistance(player.position, at) > FURNITURE_REACH) return say('Acercate más al mueble.');
    const others = house.furniture.filter((p) => p !== piece);
    if (action === 'turn') {
      const kind = turned(piece.kind);
      if (kind === piece.kind) return say(`${capitalize(STATICS[piece.kind].name)}: no se gira.`);
      this.houses.setFurniture(house.id, [...others, { ...piece, kind }]);
      return;
    }
    const kind = furnitureItemOf(piece.kind);
    if (!kind) return;
    const changes = emptyChanges();
    if (!this.world.items.addToBackpack(playerId, kind, 1, () => this.ids.next(), changes))
      return say('No te entra en la mochila.');
    changes.message = `Guardaste ${describeItem(kind)} en la mochila.`;
    this.items.publish(changes, playerId);
    this.houses.setFurniture(house.id, others);
  }

  /** ¿Por qué no se puede poner un mueble ahí? (null: se puede). */
  private spotProblem(at: Position): string | null {
    const map = this.world.map;
    if (!map.isWalkable(at) || map.hasStaticAt(at) || map.teleportAt(at))
      return 'Ahí no entra: tiene que ser un lugar libre del piso.';
    if (SIDES.some((d) => map.doorAt({ x: at.x + d.x, y: at.y + d.y })))
      return 'Ahí tapa una puerta.';
    if (
      this.world.items
        .groundNear(at)
        .some((i) => i.location.type === 'ground' && same(i.location.position, at))
    )
      return 'Hay algo en el piso: levantalo primero.';
    if (this.world.mobilesNear(at).some((m) => !m.combat.isDead && same(m.position, at)))
      return 'Hay alguien parado ahí.';
    return null;
  }

  private say(playerId: EntityId, text: string): void {
    this.notifier.send(playerId, { type: 'system', text });
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
