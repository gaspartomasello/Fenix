import {
  CRAFT_RANGE,
  ITEMS,
  RESOURCE_SOURCES,
  VENDORS,
  VENDOR_RANGE,
  craftChance,
  describeItem,
  gatherChance,
  recipeByKey,
  tileDistance,
  type EntityId,
  type ItemKind,
  type Position,
  type SkillKey,
  type StaticKind,
} from '@fenix/shared';
import { emptyChanges, type ItemChanges } from '../items/items';
import type { Npc } from '../npcs/npc';
import type { Player } from '../player';
import type { World } from '../world';
import type { ResourceSpots } from './resource-spots';

export type EconomyResult =
  | { ok: true; message: string; changes: ItemChanges; gained?: SkillKey }
  | { ok: false; reason: string };

const fail = (reason: string): EconomyResult => ({ ok: false, reason });

/** ¿Hay un objeto fijo de este tipo cerca? (forja, yunque…) */
function near(world: World, position: Position, kind: StaticKind, range: number): boolean {
  return world.map.statics.some((s) => s.kind === kind && tileDistance(s, position) <= range);
}

/** Talar o minar el árbol o roca en `position` con la herramienta `toolId`. */
export function gather(
  player: Player,
  toolId: EntityId,
  position: Position,
  world: World,
  spots: ResourceSpots,
  ids: () => EntityId,
  now: number,
  random: () => number,
): EconomyResult {
  if (player.combat.isDead) return fail('Los fantasmas no pueden trabajar.');
  if (now < player.nextActionAt) return fail('Esperá a terminar lo que estás haciendo.');
  const tool = world.items.get(toolId);
  if (!tool || tool.ownerId() !== player.id) return fail('Necesitás tener la herramienta.');

  const placed = world.map.statics.find(
    (s) => s.x === position.x && s.y === position.y && RESOURCE_SOURCES[s.kind],
  );
  const source = placed ? RESOURCE_SOURCES[placed.kind] : undefined;
  if (!placed || !source) return fail('Ahí no hay nada para sacar. Probá con un árbol o una roca.');
  if (source.tool !== tool.kind) return fail(`Para eso necesitás ${describeItem(source.tool)}.`);
  if (tileDistance(player.position, placed) > 1) return fail('Acercate más.');

  player.nextActionAt = now + 1500;
  const gained = player.skills.tryGain(source.skill, random) ? source.skill : undefined;
  if (random() >= gatherChance(player.skills.get(source.skill))) {
    return {
      ok: true,
      message: 'No conseguiste nada esta vez.',
      changes: emptyChanges(),
      ...(gained ? { gained } : {}),
    };
  }
  if (!spots.take(position, now)) return fail('Este lugar está agotado por ahora.');
  const amount = 1 + Math.floor(random() * 2) + Math.floor(player.skills.get(source.skill) / 500);
  const changes = emptyChanges();
  if (!world.items.addToBackpack(player.id, source.resource, amount, ids, changes))
    return fail('Tu mochila está llena.');
  return {
    ok: true,
    message: `Conseguiste ${describeItem(source.resource, amount)}.`,
    changes,
    ...(gained ? { gained } : {}),
  };
}

/** Fundir todo el mineral en lingotes (uno por uno) cerca de una forja. */
export function smelt(player: Player, world: World, ids: () => EntityId): EconomyResult {
  if (!near(world, player.position, 'forge', CRAFT_RANGE))
    return fail('Necesitás estar al lado de una forja.');
  const ore = world.items.countInBackpack(player.id, 'iron-ore');
  if (ore === 0) return fail('No tenés mineral para fundir.');
  const changes = emptyChanges();
  world.items.consumeFromBackpack(player.id, 'iron-ore', ore, changes);
  world.items.addToBackpack(player.id, 'iron-ingot', ore, ids, changes);
  return { ok: true, message: `Fundiste ${describeItem('iron-ingot', ore)}.`, changes };
}

/** Fabricar en la herrería: martillo, yunque y forja cerca, y lingotes. */
export function craft(
  player: Player,
  recipeKey: string,
  world: World,
  ids: () => EntityId,
  now: number,
  random: () => number,
): EconomyResult {
  const recipe = recipeByKey(recipeKey);
  if (!recipe) return fail('No conocés esa receta.');
  if (player.combat.isDead) return fail('Los fantasmas no pueden trabajar.');
  if (now < player.nextActionAt) return fail('Esperá a terminar lo que estás haciendo.');
  if (world.items.countInBackpack(player.id, 'smith-hammer') === 0)
    return fail('Necesitás un martillo de herrero.');
  if (
    !near(world, player.position, 'anvil', CRAFT_RANGE) ||
    !near(world, player.position, 'forge', CRAFT_RANGE)
  ) {
    return fail('Necesitás estar al lado de un yunque y una forja.');
  }
  const skill = player.skills.get('blacksmithy');
  if (skill < recipe.minSkill)
    return fail(`Tu Herrería no alcanza para ${describeItem(recipe.result)}.`);
  if (world.items.countInBackpack(player.id, 'iron-ingot') < recipe.ingots) {
    return fail(`Necesitás ${describeItem('iron-ingot', recipe.ingots)}.`);
  }

  player.nextActionAt = now + 1500;
  const gained = player.skills.tryGain('blacksmithy', random)
    ? ('blacksmithy' as const)
    : undefined;
  const changes = emptyChanges();
  if (random() >= craftChance(recipe, skill)) {
    // Si sale mal se pierde la mitad del material.
    world.items.consumeFromBackpack(player.id, 'iron-ingot', Math.ceil(recipe.ingots / 2), changes);
    return {
      ok: true,
      message: 'Se te arruinó la pieza y perdiste parte del material.',
      changes,
      ...(gained ? { gained } : {}),
    };
  }
  world.items.consumeFromBackpack(player.id, 'iron-ingot', recipe.ingots, changes);
  if (!world.items.addToBackpack(player.id, recipe.result, 1, ids, changes))
    return fail('Tu mochila está llena.');
  return {
    ok: true,
    message: `Fabricaste ${describeItem(recipe.result)}.`,
    changes,
    ...(gained ? { gained } : {}),
  };
}

function checkVendor(player: Player, vendor: Npc | undefined): string | null {
  if (!vendor) return 'No hay nadie para atenderte.';
  if (player.combat.isDead) return 'Los fantasmas no pueden comerciar.';
  if (tileDistance(player.position, vendor.position) > VENDOR_RANGE)
    return `Acercate a ${vendor.name}.`;
  return null;
}

/** Comprar `amount` unidades (o piezas) de lo que vende un comerciante. */
export function buy(
  player: Player,
  vendor: Npc | undefined,
  kind: ItemKind,
  amount: number,
  world: World,
  ids: () => EntityId,
): EconomyResult {
  const problem = checkVendor(player, vendor);
  if (problem || !vendor) return fail(problem ?? '');
  const offer = VENDORS[vendor.role].sells.find((o) => o.kind === kind);
  if (!offer) return fail(`${vendor.name} no vende eso.`);
  const units = ITEMS[kind].stackable ? amount : Math.min(amount, 10);
  const total = offer.price * units;
  if (world.items.countInBackpack(player.id, 'gold') < total)
    return fail(`No te alcanza: cuesta ${total} monedas.`);

  const changes = emptyChanges();
  world.items.consumeFromBackpack(player.id, 'gold', total, changes);
  for (let i = 0; i < (ITEMS[kind].stackable ? 1 : units); i++) {
    if (
      !world.items.addToBackpack(player.id, kind, ITEMS[kind].stackable ? units : 1, ids, changes)
    ) {
      return fail('Tu mochila está llena.');
    }
  }
  return {
    ok: true,
    message: `Compraste ${describeItem(kind, units)} por ${total} monedas.`,
    changes,
  };
}

/** Vender una pila entera de la mochila a un comerciante que la compre. */
export function sell(
  player: Player,
  vendor: Npc | undefined,
  itemId: EntityId,
  world: World,
  ids: () => EntityId,
): EconomyResult {
  const problem = checkVendor(player, vendor);
  if (problem || !vendor) return fail(problem ?? '');
  const item = world.items.get(itemId);
  if (!item || item.location.type !== 'backpack' || item.location.ownerId !== player.id) {
    return fail('Solo podés vender lo que tenés en la mochila.');
  }
  const offer = VENDORS[vendor.role].buys.find((o) => o.kind === item.kind);
  if (!offer) return fail(`${vendor.name} no compra eso.`);
  const total = offer.price * item.amount;
  const changes = emptyChanges();
  const label = describeItem(item.kind, item.amount);
  world.items.consumeFromBackpack(player.id, item.kind, item.amount, changes);
  world.items.addToBackpack(player.id, 'gold', total, ids, changes);
  return { ok: true, message: `Vendiste ${label} por ${total} monedas.`, changes };
}
