import {
  ITEMS,
  MAX_QUESTS,
  QUEST_GOODS,
  QUEST_PREY,
  QUEST_TALK_RANGE,
  describeGoal,
  describeReward,
  goalCount,
  tileDistance,
  type CreatureKind,
  type EntityId,
  type ItemKind,
  type Quest,
  type QuestGoal,
  type QuestProgress,
  type QuestReward,
} from '@fenix/shared';
import type { Creature } from '../../domain/creatures/creature';
import { emptyChanges } from '../../domain/items/items';
import type { Npc } from '../../domain/npcs/npc';
import type { Player } from '../../domain/player';
import type { World } from '../../domain/world';
import type { ItemNotifications } from '../item-notifications';
import type { Clock, IdGenerator, Notifier } from '../ports';

/** Después de terminar una misión, el vecino tarda en pedir otra. */
const REST_MS = 3 * 60 * 1000;

/** Premios de más que a veces da un vecino agradecido. */
const BONUS: readonly [ItemKind, number][] = [
  ['healing-potion', 2],
  ['bandage', 10],
  ['bag', 1],
  ['cure-potion', 2],
  ['book', 1],
  ['refresh-potion', 2],
];

const SLAY_STORIES: readonly ((plural: string, n: number) => string)[] = [
  (p, n) =>
    `No puedo dormir tranquilo: hay ${p} rondando cerca del pueblo y cada noche se acercan más. Si matás ${n}, te pago bien.`,
  (p, n) =>
    `Mi hermano se cruzó con unos ${p} en el camino y casi no la cuenta. ¿Podrías encargarte de ${n}? Alguien tiene que hacerlo.`,
  (p, n) =>
    `Los viajeros ya no se animan a venir por culpa de los ${p}. Matá ${n} y el pueblo te lo va a agradecer.`,
];

const GATHER_STORIES: readonly ((plural: string, n: number) => string)[] = [
  (p, n) =>
    `Tengo que arreglar la casa antes de que lleguen las lluvias y me faltan ${p}. ¿Me conseguirías ${n}?`,
  (p, n) =>
    `El taller de mi familia se quedó sin ${p}. Si me traés ${n}, te pago lo justo y un poco más.`,
  (p, n) =>
    `Prometí ${n} ${p} para la feria y no llego. ¿Me darías una mano? Te lo voy a recompensar.`,
];

const DELIVER_STORIES: readonly ((to: string, town: string) => string)[] = [
  (to, town) =>
    `Tengo una carta para ${to}, que vive en ${town}. Yo no puedo dejar el pueblo... ¿se la llevarías? ${to} te va a pagar el viaje.`,
  (to, town) =>
    `Hace mucho que no sé nada de ${to}, en ${town}. Le escribí esta carta: ¿se la harías llegar?`,
  (to, town) =>
    `Es urgente: esta carta tiene que llegar a manos de ${to}, en ${town}. No la abras, por favor.`,
];

/**
 * Misiones de los vecinos, como en UO: al hablarle, un vecino cuenta lo que
 * le pasa y pide algo — cazar criaturas que molestan, traer materiales, o
 * llevar una carta a alguien de otro pueblo. Se pueden llevar hasta
 * MAX_QUESTS a la vez; al volver con lo pedido, el vecino paga en oro (y a
 * veces con algo más) y da fama. Cada vecino pide siempre algo parecido
 * (sale de su nombre) y, después de una misión, descansa un rato.
 */
export class Quests {
  /** Cuántas misiones terminó cada jugador con cada vecino (para variar lo que piden). */
  private readonly done = new Map<string, number>();
  /** Hasta cuándo descansa cada vecino con cada jugador. */
  private readonly resting = new Map<string, number>();

  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly items: ItemNotifications,
    private readonly notifier: Notifier,
  ) {}

  /** Hablar con un vecino: entregar, cobrar, recordar lo que falta u ofrecer algo nuevo. */
  talk(playerId: EntityId, npcId: EntityId): void {
    const player = this.world.get(playerId);
    const npc = this.npc(npcId);
    if (!player || !npc || player.combat.isDead) return;
    if (tileDistance(player.position, npc.position) > QUEST_TALK_RANGE)
      return this.say(playerId, `Acercate a ${npc.name} para hablar.`);

    // ¿Le traen una carta?
    const letter = player.quests.find((q) => q.goal.kind === 'deliver' && q.goal.to === npc.name);
    if (letter) {
      if (!this.takeLetter(player, letter))
        return this.speak(player, npc, '¿Una carta para mí? No veo ninguna en tu mochila.');
      return this.complete(player, npc, letter, 'Una carta... ¡por fin noticias! Gracias.');
    }

    const mine = player.quests.find((q) => q.giver === npc.name);
    if (mine) {
      if (this.ready(player, mine)) {
        if (mine.goal.kind === 'gather') this.takeGoods(player, mine.goal.item, mine.goal.count);
        return this.complete(player, npc, mine, '¡Justo lo que necesitaba! Muchas gracias.');
      }
      const left =
        mine.goal.kind === 'slay'
          ? ` (llevás ${mine.progress} de ${mine.goal.count})`
          : mine.goal.kind === 'gather'
            ? ` (tenés ${this.world.items.countInBackpack(playerId, mine.goal.item)} de ${mine.goal.count})`
            : '';
      return this.speak(player, npc, `¿Cómo va eso? ${describeGoal(mine.goal)}${left}.`);
    }

    if ((this.resting.get(this.key(player, npc)) ?? 0) > this.clock.now())
      return this.speak(
        player,
        npc,
        'Gracias otra vez por la ayuda. Volvé más tarde, quizás necesite algo.',
      );
    if (player.quests.length >= MAX_QUESTS)
      return this.speak(player, npc, 'Ya tenés muchas misiones. Terminá alguna y volvé a verme.');
    const quest = this.offerFrom(player, npc);
    if (!quest) return this.speak(player, npc, 'Por ahora no necesito nada, gracias.');
    this.notifier.send(playerId, { type: 'questOffer', npcId, quest });
  }

  accept(playerId: EntityId, npcId: EntityId): void {
    const player = this.world.get(playerId);
    const npc = this.npc(npcId);
    if (!player || !npc || player.combat.isDead) return;
    if (tileDistance(player.position, npc.position) > QUEST_TALK_RANGE) return;
    if (player.quests.some((q) => q.giver === npc.name)) return;
    if (player.quests.length >= MAX_QUESTS)
      return this.say(playerId, `No podés llevar más de ${MAX_QUESTS} misiones a la vez.`);
    if ((this.resting.get(this.key(player, npc)) ?? 0) > this.clock.now()) return;
    const quest = this.offerFrom(player, npc);
    if (!quest) return;
    if (quest.goal.kind === 'deliver') {
      const changes = emptyChanges();
      const goal = quest.goal;
      const ok = this.world.items.addToBackpack(
        playerId,
        'letter',
        1,
        () => this.ids.next(),
        changes,
      );
      if (!ok) return this.say(playerId, 'No tenés lugar en la mochila para la carta.');
      const letter = this.world.items
        .backpackOf(playerId)
        .find((i) => i.kind === 'letter' && !i.book);
      if (letter)
        letter.book = {
          title: `Carta para ${goal.to}`,
          author: npc.name,
          pages: [
            `Hola, ${goal.to}:\n\nTe escribo desde ${quest.town}. Acá todo sigue igual: el trabajo, el mercado, la gente de siempre. Te extraño y espero que estés bien.\n\nCon cariño,\n${npc.name}`,
          ],
          sealed: true,
        };
      this.items.publish(changes, playerId);
    }
    player.quests = [...player.quests, { ...quest, progress: 0 }];
    this.say(playerId, `Aceptaste la misión de ${npc.name}: ${describeGoal(quest.goal)}.`);
    this.sendJournal(player);
  }

  abandon(playerId: EntityId, giver: string): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const quest = player.quests.find((q) => q.giver === giver);
    if (!quest) return;
    player.quests = player.quests.filter((q) => q !== quest);
    this.say(playerId, `Dejaste la misión de ${giver}.`);
    this.sendJournal(player);
  }

  /** Una criatura murió a manos de un jugador: cuenta para sus misiones de caza. */
  creatureKilled(player: Player, creature: Creature): void {
    let changed = false;
    player.quests = player.quests.map((q) => {
      if (q.goal.kind !== 'slay' || q.goal.creature !== creature.definition.kind) return q;
      if (q.progress >= q.goal.count) return q;
      changed = true;
      const progress = q.progress + 1;
      if (progress === q.goal.count)
        this.say(player.id, `Misión de ${q.giver}: ¡listo! Volvé a ver a ${q.giver} para cobrar.`);
      return { ...q, progress };
    });
    if (changed) this.sendJournal(player);
  }

  sendJournal(player: Player): void {
    this.notifier.send(player.id, { type: 'quests', quests: player.quests });
  }

  // ── Lo que ofrece cada vecino ──

  /** La misión que ofrece un vecino a un jugador (siempre la misma hasta terminarla). */
  private offerFrom(player: Player, npc: Npc): Quest | null {
    const town = this.world.map.regionAt(npc.home)?.name ?? 'el pueblo';
    const random = seeded(hash(npc.name) + (this.done.get(this.key(player, npc)) ?? 0) * 7919);
    const roll = random();
    const goal =
      roll < 0.4
        ? this.slayGoal(random)
        : roll < 0.75
          ? this.gatherGoal(random)
          : (this.deliverGoal(npc, town, random) ?? this.gatherGoal(random));
    return {
      giver: npc.name,
      town,
      title: titleOf(goal),
      story: storyOf(goal, random),
      goal,
      reward: this.rewardFor(goal, npc, random),
    };
  }

  private slayGoal(random: () => number): QuestGoal {
    const kinds = Object.keys(QUEST_PREY) as CreatureKind[];
    // Las más fáciles salen más seguido.
    const creature = kinds[Math.floor(random() ** 1.6 * kinds.length)] ?? 'rat';
    const count = creature === 'rat' ? 5 + Math.floor(random() * 6) : 3 + Math.floor(random() * 3);
    return { kind: 'slay', creature, count };
  }

  private gatherGoal(random: () => number): QuestGoal {
    const kinds = Object.keys(QUEST_GOODS) as ItemKind[];
    const item = kinds[Math.floor(random() * kinds.length)] ?? 'logs';
    return { kind: 'gather', item, count: 5 + Math.floor(random() * 4) * 5 };
  }

  /** Alguien de otro pueblo a quien llevarle una carta. */
  private deliverGoal(npc: Npc, town: string, random: () => number): QuestGoal | null {
    const others = this.world
      .allNpcs()
      .filter((n) => n.role === 'townsfolk' && n.name !== npc.name)
      .map((n) => ({ n, town: this.world.map.regionAt(n.home)?.name }))
      .filter((o): o is { n: Npc; town: string } => !!o.town && o.town !== town);
    if (others.length === 0) return null;
    const chosen = others[Math.floor(random() * others.length)];
    return chosen ? { kind: 'deliver', to: chosen.n.name, town: chosen.town } : null;
  }

  private rewardFor(goal: QuestGoal, npc: Npc, random: () => number): QuestReward {
    let gold: number;
    if (goal.kind === 'slay') gold = (QUEST_PREY[goal.creature]?.bounty ?? 5) * goal.count;
    else if (goal.kind === 'gather') gold = (QUEST_GOODS[goal.item] ?? 3) * goal.count * 2;
    else {
      const target = this.world.allNpcs().find((n) => n.name === goal.to);
      const far = target ? tileDistance(npc.home, target.home) : 100;
      gold = 40 + Math.round(far / 3);
    }
    gold = Math.round(gold * (1.2 + random() * 0.4));
    if (random() < 0.35) {
      const [item, amount] = BONUS[Math.floor(random() * BONUS.length)] ??
        BONUS[0] ?? ['bandage', 5];
      return { gold, item, amount };
    }
    return { gold };
  }

  // ── Entregar y cobrar ──

  private ready(player: Player, quest: QuestProgress): boolean {
    if (quest.goal.kind === 'slay') return quest.progress >= quest.goal.count;
    if (quest.goal.kind === 'gather')
      return this.world.items.countInBackpack(player.id, quest.goal.item) >= quest.goal.count;
    return false;
  }

  private complete(player: Player, npc: Npc, quest: QuestProgress, line: string): void {
    const changes = emptyChanges();
    const giver = this.world.allNpcs().find((n) => n.name === quest.giver) ?? npc;
    player.quests = player.quests.filter((q) => q !== quest);
    this.world.items.addToBackpack(
      player.id,
      'gold',
      quest.reward.gold,
      () => this.ids.next(),
      changes,
    );
    if (quest.reward.item)
      for (
        let i = 0;
        i < (ITEMS[quest.reward.item].stackable ? 1 : (quest.reward.amount ?? 1));
        i++
      )
        this.world.items.addToBackpack(
          player.id,
          quest.reward.item,
          ITEMS[quest.reward.item].stackable ? (quest.reward.amount ?? 1) : 1,
          () => this.ids.next(),
          changes,
        );
    this.items.publish(changes, player.id);
    player.reputation.award(goalCount(quest.goal) * 15, 40);
    const key = this.key(player, giver);
    this.done.set(key, (this.done.get(key) ?? 0) + 1);
    this.resting.set(key, this.clock.now() + REST_MS);
    this.speak(player, npc, line);
    this.say(player.id, `Misión cumplida. Recibiste ${describeReward(quest.reward)}.`);
    this.sendJournal(player);
  }

  private takeGoods(player: Player, kind: ItemKind, count: number): void {
    const changes = emptyChanges();
    this.world.items.consumeFromBackpack(player.id, kind, count, changes);
    this.items.publish(changes, player.id);
  }

  private takeLetter(player: Player, quest: QuestProgress): boolean {
    if (quest.goal.kind !== 'deliver') return false;
    const goal = quest.goal;
    const letter = this.world.items
      .backpackOf(player.id)
      .find((i) => i.kind === 'letter' && i.book?.title === `Carta para ${goal.to}`);
    if (!letter) return false;
    const changes = emptyChanges();
    this.world.items.remove(letter.id);
    changes.inventories.add(player.id);
    this.items.publish(changes, player.id);
    return true;
  }

  private npc(npcId: EntityId): Npc | undefined {
    return this.world.allNpcs().find((n) => n.id === npcId && n.role === 'townsfolk');
  }

  private key(player: Player, npc: Npc): string {
    return `${player.name}\u0000${npc.name}`;
  }

  private speak(player: Player, npc: Npc, text: string): void {
    this.say(player.id, `${npc.name}: ${text}`);
  }

  private say(playerId: EntityId, text: string): void {
    this.notifier.send(playerId, { type: 'system', text });
  }
}

function titleOf(goal: QuestGoal): string {
  switch (goal.kind) {
    case 'slay':
      return `Cacería: ${QUEST_PREY[goal.creature]?.plural ?? goal.creature}`;
    case 'gather':
      return `Encargo: ${ITEMS[goal.item].plural}`;
    case 'deliver':
      return `Una carta para ${goal.to}`;
  }
}

function storyOf(goal: QuestGoal, random: () => number): string {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  switch (goal.kind) {
    case 'slay':
      return pick(SLAY_STORIES)(QUEST_PREY[goal.creature]?.plural ?? goal.creature, goal.count);
    case 'gather':
      return pick(GATHER_STORIES)(ITEMS[goal.item].plural, goal.count);
    case 'deliver':
      return pick(DELIVER_STORIES)(goal.to, goal.town);
  }
}

function hash(text: string): number {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Números al azar repetibles a partir de una semilla (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
