import type { CreatureKind } from '../creatures/creature-catalog';
import { ITEMS, type ItemKind } from '../items/item-catalog';

/** Lo que pide una misión. */
export type QuestGoal =
  | { readonly kind: 'slay'; readonly creature: CreatureKind; readonly count: number }
  | { readonly kind: 'gather'; readonly item: ItemKind; readonly count: number }
  /** Llevar una carta a otro vecino (`to`), que vive en `town`. */
  | { readonly kind: 'deliver'; readonly to: string; readonly town: string };

export interface QuestReward {
  readonly gold: number;
  readonly item?: ItemKind;
  readonly amount?: number;
}

/** Una misión: quién la da, qué cuenta, qué pide y qué paga. */
export interface Quest {
  /** El nombre de quien la da: cada vecino da una por vez. */
  readonly giver: string;
  /** Pueblo de quien la da. */
  readonly town: string;
  readonly title: string;
  /** Lo que cuenta el vecino al pedirla. */
  readonly story: string;
  readonly goal: QuestGoal;
  readonly reward: QuestReward;
}

/** Una misión aceptada y cuánto se avanzó (criaturas muertas; en las otras, 0). */
export interface QuestProgress extends Quest {
  readonly progress: number;
}

/** Cuántas misiones se pueden llevar a la vez. */
export const MAX_QUESTS = 5;
/** A qué distancia se habla con un vecino. */
export const QUEST_TALK_RANGE = 4;

/** Criaturas que se piden cazar: nombre en plural y cuánto paga cada una. */
export const QUEST_PREY: Readonly<
  Partial<Record<CreatureKind, { readonly plural: string; readonly bounty: number }>>
> = {
  rat: { plural: 'ratas gigantes', bounty: 6 },
  wolf: { plural: 'lobos grises', bounty: 14 },
  skeleton: { plural: 'esqueletos', bounty: 20 },
  zombie: { plural: 'zombis', bounty: 22 },
  'giant-spider': { plural: 'arañas gigantes', bounty: 18 },
  orc: { plural: 'orcos', bounty: 30 },
  ghoul: { plural: 'necrófagos', bounty: 32 },
};

/** Objetos que se piden traer y cuánto paga cada uno. */
export const QUEST_GOODS: Readonly<Partial<Record<ItemKind, number>>> = {
  logs: 3,
  boards: 4,
  'raw-fish': 5,
  'iron-ore': 6,
  'iron-ingot': 9,
  hides: 7,
  cloth: 4,
  apple: 2,
  bandage: 3,
};

/** "Matá 5 ratas gigantes", "Traé 10 troncos", "Llevá la carta a Lucía (Villa del Junco)". */
export function describeGoal(goal: QuestGoal): string {
  switch (goal.kind) {
    case 'slay': {
      const prey = QUEST_PREY[goal.creature];
      return `Matá ${goal.count} ${prey?.plural ?? goal.creature}`;
    }
    case 'gather': {
      const item = ITEMS[goal.item];
      return `Traé ${goal.count} ${goal.count === 1 ? item.name : item.plural}`;
    }
    case 'deliver':
      return `Llevá la carta a ${goal.to} (${goal.town})`;
  }
}

/** Cuánto se lleva hecho, para mostrar: "3/5". */
export function goalCount(goal: QuestGoal): number {
  return goal.kind === 'deliver' ? 1 : goal.count;
}

export function describeReward(reward: QuestReward): string {
  const parts = [`${reward.gold} monedas de oro`];
  if (reward.item) {
    const item = ITEMS[reward.item];
    const amount = reward.amount ?? 1;
    parts.push(amount === 1 ? `${item.article} ${item.name}` : `${amount} ${item.plural}`);
  }
  return parts.join(' y ');
}
