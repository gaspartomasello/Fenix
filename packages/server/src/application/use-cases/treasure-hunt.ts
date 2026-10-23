import { ACTION_COOLDOWN_MS } from '@fenix/shared/economy/crafting';
import { tileDistance, type Position } from '@fenix/shared/geometry/position';
import { ITEMS, type ItemKind } from '@fenix/shared/items/item-catalog';
import type { EntityId } from '@fenix/shared/protocol/messages';
import {
  DIG_RANGE,
  TREASURE_CHEST_MS,
  TREASURE_GEMS,
  TREASURE_LEVELS,
  digChance,
  treasureMapName,
  type TreasureLevel,
} from '@fenix/shared/treasure/treasure';
import { isWater } from '@fenix/shared/world/terrain';
import { Creature } from '../../domain/creatures/creature';
import { emptyChanges, type ItemChanges } from '../../domain/items/items';
import type { Item } from '../../domain/items/item';
import type { Player } from '../../domain/player';
import { chartTreasure, hintFor } from '../../domain/treasure/chart';
import type { World } from '../../domain/world';
import type { ItemNotifications } from '../item-notifications';
import type { MobileNotifications } from '../mobile-notifications';
import type { Clock, IdGenerator, Notifier, RandomSource } from '../ports';

interface OpenChest {
  readonly id: EntityId;
  readonly endsAt: number;
}

/**
 * Búsqueda de tesoros, como en UO: algunas criaturas llevan un mapa del tesoro
 * que marca dónde hay un cofre enterrado. Se lee con doble clic (muestra la
 * zona y una pista), se va hasta la marca y se cava con una pala. Con suerte y
 * minería sale el cofre, lleno de oro y gemas… y sus guardianes. El cofre
 * queda un rato en el suelo y después se deshace.
 */
export class TreasureHunt {
  private chests: OpenChest[] = [];

  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly random: RandomSource,
    private readonly items: ItemNotifications,
    private readonly mobiles: MobileNotifications,
    private readonly notifier: Notifier,
    /** Los administradores ven además las coordenadas de la marca. */
    private readonly isAdmin: (name: string) => boolean = () => false,
  ) {}

  /** A los mapas que dejó una criatura en su cuerpo les marca un lugar. */
  chartCorpse(corpseId: EntityId, level: TreasureLevel): void {
    for (const item of this.world.items.corpseOf(corpseId))
      if (item.kind === 'treasure-map' && !item.treasure) this.chart(item, level);
  }

  /** Doble clic sobre el mapa: se ve dónde está marcado el tesoro. */
  read(playerId: EntityId, itemId: EntityId): void {
    const player = this.world.get(playerId);
    const item = this.world.items.get(itemId);
    if (!player || item?.kind !== 'treasure-map') return;
    if (player.combat.isDead) return this.say(playerId, 'Los fantasmas no pueden leer mapas.');
    const denied = this.world.items.reach(player, itemId);
    if (denied) return this.say(playerId, denied);
    // Un mapa sin marcar (creado por un administrador): se marca al leerlo.
    const mark = item.treasure ?? this.chart(item, 1);
    if (!mark) return this.say(playerId, 'El mapa está tan borroso que no se entiende nada.');
    this.notifier.send(playerId, {
      type: 'treasureMap',
      itemId,
      name: treasureMapName(mark.level),
      mark,
      hint: hintFor(this.world.map, mark),
    });
    if (this.isAdmin(player.name))
      this.say(playerId, `[Administrador del juego] La marca está en ${mark.x} ${mark.y}.`);
  }

  /** Cavar con la pala en `position` (al lado o debajo de uno). */
  dig(playerId: EntityId, toolId: EntityId, position: Position): void {
    const player = this.world.get(playerId);
    if (!player) return;
    if (player.combat.isDead) return this.say(playerId, 'Los fantasmas no pueden cavar.');
    const now = this.clock.now();
    if (now < player.nextActionAt)
      return this.say(playerId, 'Esperá a terminar lo que estás haciendo.');
    const tool = this.world.items.get(toolId);
    if (tool?.kind !== 'shovel' || tool.ownerId() !== playerId)
      return this.say(playerId, 'Necesitás tener la pala en la mochila.');
    if (tileDistance(player.position, position) > 1) return this.say(playerId, 'Acercate más.');
    const terrain = this.world.map.terrainAt(position);
    if (terrain === undefined || isWater(terrain) || !this.world.map.isWalkable(position))
      return this.say(playerId, 'Ahí no se puede cavar.');
    player.nextActionAt = now + ACTION_COOLDOWN_MS;

    const gained = player.skills.tryGain('mining', () => this.random.next());
    if (gained) this.mobiles.skillGains([{ player, skill: 'mining' }]);
    const map = this.mapsOf(playerId).find(
      (m) => m.treasure && tileDistance(m.treasure, position) <= DIG_RANGE,
    );
    const mark = map?.treasure;
    if (!map || !mark) return this.say(playerId, 'Cavás un rato, pero acá no hay nada enterrado.');
    const { minMining } = TREASURE_LEVELS[mark.level];
    const mining = player.skills.get('mining');
    if (mining < minMining)
      return this.say(
        playerId,
        `Das con algo duro, pero no sabés cómo sacarlo: hace falta ${minMining / 10} de minería.`,
      );
    if (this.random.next() >= digChance(mining, mark.level))
      return this.say(playerId, 'Cavás y cavás… la tierra se pone más blanda. Seguí cavando.');
    this.unearth(player, map, { x: mark.x, y: mark.y }, mark.level, now);
  }

  /** Deshace los cofres que ya estuvieron mucho tiempo afuera. */
  tick(now: number): void {
    const due = this.chests.filter((c) => now >= c.endsAt);
    if (due.length === 0) return;
    this.chests = this.chests.filter((c) => now < c.endsAt);
    const changes = emptyChanges();
    for (const chest of due) {
      for (const inner of this.world.items.descendantsOf(chest.id))
        this.world.items.destroy(inner.id, changes);
      this.world.items.destroy(chest.id, changes);
      changes.containers.add(chest.id);
    }
    this.items.publish(changes, '');
  }

  private chart(item: Item, level: TreasureLevel): Item['treasure'] {
    item.treasure = chartTreasure(this.world.map, level, () => this.random.next());
    return item.treasure;
  }

  /** Mapas que lleva encima (en la mochila o en una bolsa adentro de ella). */
  private mapsOf(playerId: EntityId): Item[] {
    const carried = this.world.items.backpackOf(playerId);
    const nested = carried
      .filter((i) => ITEMS[i.kind].capacity)
      .flatMap((bag) => this.world.items.descendantsOf(bag.id));
    return [...carried, ...nested].filter((i) => i.kind === 'treasure-map');
  }

  /** ¡Apareció! El cofre sale a la superficie y sus guardianes con él. */
  private unearth(
    player: Player,
    map: Item,
    at: Position,
    level: TreasureLevel,
    now: number,
  ): void {
    const changes = emptyChanges();
    this.world.items.destroy(map.id, changes);
    const chest = this.world.items.add(this.ids.next(), 'treasure-chest', 1, {
      type: 'ground',
      position: at,
    });
    changes.groundAdded.push(chest);
    this.fill(chest.id, level, changes);
    this.chests.push({ id: chest.id, endsAt: now + TREASURE_CHEST_MS });
    this.items.publish(changes, player.id);

    const guardians = TREASURE_LEVELS[level].guardians;
    for (const [index, kind] of guardians.entries()) {
      const spot = this.spotAround(at, index);
      const guardian = new Creature(this.ids.next(), kind, spot);
      guardian.temporary = true;
      this.world.addCreature(guardian);
      this.mobiles.appear(guardian);
    }
    this.say(
      player.id,
      '¡La pala golpea madera! Desenterrás un cofre del tesoro… y algo se levanta a defenderlo.',
    );
    for (const id of this.mobiles.watchers(player))
      if (id !== player.id) this.say(id, `${player.name} desentierra un cofre del tesoro.`);
  }

  private fill(chestId: EntityId, level: TreasureLevel, changes: ItemChanges): void {
    const definition = TREASURE_LEVELS[level];
    const between = ([min, max]: readonly [number, number]): number =>
      min + Math.floor(this.random.next() * (max - min + 1));
    const put = (kind: ItemKind, amount: number): void => {
      this.world.items.add(this.ids.next(), kind, amount, {
        type: 'container',
        containerId: chestId,
        position: this.world.items.gridSpot(
          this.world.items.contentsOf(chestId).map((i) => i.location),
        ),
      });
    };
    put('gold', between(definition.gold));
    const gems = new Map<ItemKind, number>();
    for (let i = between(definition.gems); i > 0; i--) {
      // Las gemas más finas salen más en los tesoros más valiosos.
      const reach = Math.min(TREASURE_GEMS.length, level + 1);
      const gem = TREASURE_GEMS[Math.floor(this.random.next() * reach)] ?? 'amethyst';
      gems.set(gem, (gems.get(gem) ?? 0) + 1);
    }
    for (const [gem, amount] of gems) put(gem, amount);
    for (const [kind, min, max, chance] of definition.extras) {
      if (this.random.next() >= chance) continue;
      const amount = between([min, max]);
      if (ITEMS[kind].stackable) put(kind, amount);
      else for (let i = 0; i < amount; i++) put(kind, 1);
    }
    changes.containers.add(chestId);
  }

  /** Lugar libre alrededor del cofre para cada guardián. */
  private spotAround(at: Position, index: number): Position {
    const ring: readonly (readonly [number, number])[] = [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
      [2, 2],
      [-2, -2],
      [2, -2],
      [-2, 2],
      [1, 0],
      [0, 1],
    ];
    for (let k = 0; k < ring.length; k++) {
      const [dx, dy] = ring[(index + k) % ring.length] ?? [1, 0];
      const spot = { x: at.x + dx, y: at.y + dy };
      if (this.world.map.isWalkable(spot) && !this.world.isOccupied(spot)) return spot;
    }
    return at;
  }

  private say(playerId: EntityId, text: string): void {
    this.notifier.send(playerId, { type: 'system', text });
  }
}
