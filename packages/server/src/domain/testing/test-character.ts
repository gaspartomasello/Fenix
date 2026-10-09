import {
  MAX_STACK,
  SKILL_KEYS,
  SKILL_MAX,
  STAT_CAP,
  type EntityId,
  type ItemKind,
} from '@fenix/shared';
import { emptyChanges, type ItemChanges } from '../items/items';
import type { Player } from '../player';
import type { World } from '../world';

/** Lo que tiene en la mochila un personaje de prueba, cada vez que entra. */
const TEST_SUPPLIES: readonly { kind: ItemKind; amount: number }[] = [
  { kind: 'gold', amount: 999_999 },
  { kind: 'spellbook', amount: 1 },
  { kind: 'black-pearl', amount: 1000 },
  { kind: 'blood-moss', amount: 1000 },
  { kind: 'garlic', amount: 1000 },
  { kind: 'ginseng', amount: 1000 },
  { kind: 'mandrake-root', amount: 1000 },
  { kind: 'nightshade', amount: 1000 },
  { kind: 'spiders-silk', amount: 1000 },
  { kind: 'sulfurous-ash', amount: 1000 },
];

/**
 * Personaje de prueba (solo para probar el juego): todas las habilidades y
 * atributos al máximo, vitales llenos, y la mochila con oro y reactivos de
 * sobra. Se aplica cada vez que entra, completando lo que haya gastado.
 */
export function equipTestCharacter(player: Player, world: World, ids: () => EntityId): ItemChanges {
  for (const key of SKILL_KEYS) player.skills.set(key, SKILL_MAX);
  player.combat.setBaseAttributes({
    strength: STAT_CAP,
    dexterity: STAT_CAP,
    intelligence: STAT_CAP,
  });
  const { maxHits, maxMana, maxStamina } = player.combat.current;
  if (!player.combat.isDead)
    player.combat.restore({ hits: maxHits, mana: maxMana, stamina: maxStamina }, false);

  const changes = emptyChanges();
  for (const { kind, amount } of TEST_SUPPLIES) {
    // El oro no entra en una sola pila: se reparte en pilas de hasta MAX_STACK.
    let missing = amount - world.items.countInBackpack(player.id, kind);
    while (missing > 0) {
      const pile = Math.min(missing, MAX_STACK);
      if (!world.items.addToBackpack(player.id, kind, pile, ids, changes)) break;
      missing -= pile;
    }
  }
  return changes;
}

/** ¿Es uno de los personajes de prueba configurados? (sin distinguir mayúsculas) */
export function isTestCharacter(name: string, testCharacters: readonly string[]): boolean {
  const lower = name.toLocaleLowerCase();
  return testCharacters.some((n) => n.toLocaleLowerCase() === lower);
}
