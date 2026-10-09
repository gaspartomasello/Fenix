import {
  CURE_POTION_POWER,
  HEALING_POTION,
  ITEMS,
  POTION_BOOST,
  REFRESH_POTION,
  cureChance,
  describeItem,
  type ItemKind,
} from '@fenix/shared';
import type { Player } from '../player';

export interface ConsumeResult {
  readonly message: string;
  /** Cambiaron los efectos activos (fuerza, agilidad, veneno). */
  readonly effectsChanged: boolean;
}

/** Aplica lo que hace comer o tomar algo. */
export function consume(
  player: Player,
  kind: ItemKind,
  now: number,
  random: () => number,
): ConsumeResult {
  const definition = ITEMS[kind];
  const combat = player.combat;
  if (definition.food !== undefined) {
    combat.heal(definition.food);
    combat.restoreStamina(10);
    return { message: `Comiste ${describeItem(kind)}.`, effectsChanged: false };
  }
  const drank = `Tomaste ${describeItem(kind)}`;
  switch (definition.potion) {
    case 'heal': {
      const [min, max] = HEALING_POTION;
      combat.heal(min + Math.floor(random() * (max - min + 1)));
      return { message: `${drank}. Tus heridas se cierran.`, effectsChanged: false };
    }
    case 'cure': {
      const poison = combat.effect('poison');
      if (!poison) return { message: `${drank}. No tenías veneno.`, effectsChanged: false };
      if (random() >= cureChance(CURE_POTION_POWER, poison.amount))
        return { message: `${drank}, pero el veneno sigue.`, effectsChanged: false };
      combat.removeEffect('poison');
      return { message: `${drank}. El veneno desapareció.`, effectsChanged: true };
    }
    case 'refresh':
      combat.restoreStamina(REFRESH_POTION);
      return { message: `${drank}. Recuperás el aliento.`, effectsChanged: false };
    case 'strength':
    case 'agility':
      combat.applyEffect(
        definition.potion === 'strength' ? 'strength' : 'dexterity',
        POTION_BOOST.amount,
        POTION_BOOST.durationMs,
        now,
      );
      return {
        message: `${drank}. Te sentís ${definition.potion === 'strength' ? 'más fuerte' : 'más ágil'}.`,
        effectsChanged: true,
      };
    default:
      return { message: `${drank}.`, effectsChanged: false };
  }
}
