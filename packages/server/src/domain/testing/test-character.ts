import {
  ITEMS,
  MAX_STACK,
  REAGENTS,
  SKILL_KEYS,
  SKILL_MAX,
  STAT_CAP,
  type EntityId,
  type ItemKind,
} from '@fenix/shared';
import { emptyChanges, type ItemChanges } from '../items/items';
import { bagReagents } from '../items/reagent-bag';
import type { Player } from '../player';
import type { World } from '../world';

/** Lo que tiene en la mochila un personaje de prueba, cada vez que entra. */
const TEST_SUPPLIES: readonly { kind: ItemKind; amount: number }[] = [
  { kind: 'spellbook', amount: 1 },
  { kind: 'black-pearl', amount: 1000 },
  { kind: 'blood-moss', amount: 1000 },
  { kind: 'garlic', amount: 1000 },
  { kind: 'ginseng', amount: 1000 },
  { kind: 'mandrake-root', amount: 1000 },
  { kind: 'nightshade', amount: 1000 },
  { kind: 'spiders-silk', amount: 1000 },
  { kind: 'sulfurous-ash', amount: 1000 },
  { kind: 'rune', amount: 3 },
  { kind: 'dye-tub', amount: 1 },
  { kind: 'dyes', amount: 50 },
  { kind: 'pouch', amount: 1 },
];

/**
 * Versión del kit de prueba. La 2 le saca todo el oro que tenía (las de
 * antes le daban casi un millón): ahora lo tiene que ganar como cualquiera.
 */
const TEST_KIT_VERSION = 2;

/**
 * Personaje de prueba (solo para probar el juego): todas las habilidades y
 * atributos al máximo, vitales llenos, y la mochila con reactivos de sobra
 * (en su bolsa) y una tina de tintura. Se aplica cada vez que entra,
 * completando lo que haya gastado. Oro no trae.
 */
export function equipTestCharacter(player: Player, world: World, ids: () => EntityId): ItemChanges {
  for (const key of SKILL_KEYS) player.skills.set(key, SKILL_MAX);
  // Como un administrador del juego: lleva lo que quiera, sin límite de carga.
  player.unburdened = true;
  player.combat.setBaseAttributes({
    strength: STAT_CAP,
    dexterity: STAT_CAP,
    intelligence: STAT_CAP,
  });
  const { maxHits, maxMana, maxStamina } = player.combat.current;
  if (!player.combat.isDead)
    player.combat.restore({ hits: maxHits, mana: maxMana, stamina: maxStamina }, false);

  const changes = emptyChanges();
  if (player.testKit < TEST_KIT_VERSION) {
    // Una sola vez: se le saca el oro que le daban las versiones de antes.
    for (const item of [...world.items.carried(player.id), ...world.items.bankOf(player.id)])
      if (item.kind === 'gold') world.items.remove(item.id);
    changes.inventories.add(player.id);
    player.testKit = TEST_KIT_VERSION;
  }
  // Primero los reactivos, que van a su bolsa (así no ocupan la mochila), y después lo demás.
  const reagents = TEST_SUPPLIES.filter((s) => REAGENTS.includes(s.kind));
  const rest = TEST_SUPPLIES.filter((s) => !REAGENTS.includes(s.kind));
  restock(player, world, ids, reagents, changes);
  bagReagents(player, world, ids, changes);
  restock(player, world, ids, rest, changes);
  return changes;
}

/** Completa en la mochila lo que falte de cada cosa. */
function restock(
  player: Player,
  world: World,
  ids: () => EntityId,
  supplies: readonly { kind: ItemKind; amount: number }[],
  changes: ItemChanges,
): void {
  for (const { kind, amount } of supplies) {
    // El oro no entra en una sola pila: se reparte en pilas de hasta MAX_STACK.
    let missing = amount - world.items.countInBackpack(player.id, kind);
    while (missing > 0) {
      // Lo que no se apila (las runas) va de a uno.
      const pile = ITEMS[kind].stackable ? Math.min(missing, MAX_STACK) : 1;
      if (!world.items.addToBackpack(player.id, kind, pile, ids, changes)) break;
      missing -= pile;
    }
  }
}

/** ¿Es uno de los personajes de prueba configurados? (sin distinguir mayúsculas) */
export function isTestCharacter(name: string, testCharacters: readonly string[]): boolean {
  const lower = name.toLocaleLowerCase();
  return testCharacters.some((n) => n.toLocaleLowerCase() === lower);
}
