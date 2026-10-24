import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import type { QuestOfferMessage, QuestsMessage } from '@fenix/shared/protocol/messages';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { Creature } from '../domain/creatures/creature';
import { Npc } from '../domain/npcs/npc';
import { captureCharacter, parseSavedCharacter } from '../domain/persistence/saved-character';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
// <módulos>
import { gameWith } from '../test-support/game';
import { combatModule } from './features/combat/combat.module';
import { questsModule } from './features/quests/quests.module';
// </módulos>

const newGame = gameWith([combatModule, questsModule]);

function createTowns() {
  const map = new TileMap({
    width: 40,
    height: 20,
    terrain: new Array<Terrain>(800).fill(Terrain.Grass),
    statics: [],
    regions: [
      { name: 'Pueblo Alto', x: 0, y: 0, width: 20, height: 20 },
      { name: 'Pueblo Bajo', x: 20, y: 0, width: 20, height: 20 },
    ],
  });
  const world = new World(map, { x: 5, y: 5 });
  // Muchos vecinos en el primer pueblo (cada uno pide algo distinto) y una vecina lejos.
  for (let i = 0; i < 40; i++)
    world.addNpc(new Npc(`v${i}`, 'townsfolk', { x: 6, y: 5 }, `Vecino ${i}`));
  world.addNpc(new Npc('lejos', 'townsfolk', { x: 30, y: 5 }, 'Lejana'));
  const notifier = new RecordingNotifier();
  const app = newGame({
    world,
    worldClock: new WorldClock(0),
    clock: new FakeClock(0),
    ids: new SequentialIds(),
    random: new FixedRandom(0.1),
    notifier,
  });
  const result = app.join({ type: 'join', name: 'Ana', appearance: DEFAULT_APPEARANCE });
  if (!result.ok) throw new Error(result.reason);
  app.announceJoin(result.playerId);
  const ana = result.playerId;
  const player = world.get(ana);
  if (!player) throw new Error('sin jugador');
  /** Habla con los vecinos hasta encontrar uno que pida algo de este tipo. */
  const findOffer = (kind: 'slay' | 'gather' | 'deliver') => {
    for (let i = 0; i < 40; i++) {
      notifier.clear();
      app.handle(ana, { type: 'talkNpc', npcId: `v${i}` });
      const offer = notifier.ofType('questOffer').at(-1)?.message as QuestOfferMessage | undefined;
      if (offer?.quest.goal.kind === kind) return offer;
    }
    throw new Error(`nadie pide ${kind}`);
  };
  const journal = () =>
    (notifier.ofType('quests').at(-1)?.message as QuestsMessage | undefined)?.quests ?? [];
  const gold = () => world.items.countInBackpack(ana, 'gold');
  return { world, app, ana, player, findOffer, journal, gold };
}

describe('misiones de los vecinos', () => {
  it('traer materiales: se acepta, se entrega lo pedido y se cobra', () => {
    const { world, app, ana, findOffer, journal, gold } = createTowns();
    const offer = findOffer('gather');
    const goal = offer.quest.goal;
    if (goal.kind !== 'gather') throw new Error('tipo');
    app.handle(ana, { type: 'acceptQuest', npcId: offer.npcId });
    expect(journal()).toHaveLength(1);
    // Sin lo pedido (se tira lo que ya tenía de eso), no paga.
    for (const item of world.items.backpackOf(ana).filter((i) => i.kind === goal.item))
      world.items.remove(item.id);
    const before = gold();
    app.handle(ana, { type: 'talkNpc', npcId: offer.npcId });
    expect(journal()).toHaveLength(1);
    world.items.add('pedido', goal.item, goal.count, {
      type: 'backpack',
      ownerId: ana,
      position: { x: 10, y: 10 },
    });
    const had = world.items.countInBackpack(ana, goal.item);
    app.handle(ana, { type: 'talkNpc', npcId: offer.npcId });
    expect(journal()).toHaveLength(0);
    expect(gold()).toBe(before + offer.quest.reward.gold);
    expect(world.items.countInBackpack(ana, goal.item)).toBe(
      had -
        goal.count +
        (offer.quest.reward.item === goal.item ? (offer.quest.reward.amount ?? 1) : 0),
    );
  });

  it('cazar: cuentan las criaturas que mata el jugador', () => {
    const { world, app, ana, player, findOffer, journal, gold } = createTowns();
    const offer = findOffer('slay');
    const goal = offer.quest.goal;
    if (goal.kind !== 'slay') throw new Error('tipo');
    app.handle(ana, { type: 'acceptQuest', npcId: offer.npcId });
    const combat = app.kernel.services.get('combat');
    for (let i = 0; i < goal.count; i++) {
      const creature = new Creature(`presa-${i}`, goal.creature, { x: 10, y: 10 }, null);
      world.addCreature(creature);
      combat.slay(creature, player, 0);
    }
    expect(journal()[0]?.progress).toBe(goal.count);
    const before = gold();
    app.handle(ana, { type: 'talkNpc', npcId: offer.npcId });
    expect(journal()).toHaveLength(0);
    expect(gold()).toBe(before + offer.quest.reward.gold);
  });

  it('llevar una carta a otro pueblo, y las misiones se guardan con el personaje', () => {
    const { world, app, ana, player, findOffer, journal, gold } = createTowns();
    const offer = findOffer('deliver');
    expect(offer.quest.goal).toMatchObject({ to: 'Lejana', town: 'Pueblo Bajo' });
    app.handle(ana, { type: 'acceptQuest', npcId: offer.npcId });
    expect(world.items.countInBackpack(ana, 'letter')).toBe(1);

    const saved = parseSavedCharacter(
      JSON.parse(JSON.stringify(captureCharacter(player, world, null))),
    );
    expect(saved?.quests?.[0]?.goal).toEqual(offer.quest.goal);

    player.teleport({ x: 29, y: 5 });
    const before = gold();
    app.handle(ana, { type: 'talkNpc', npcId: 'lejos' });
    expect(journal()).toHaveLength(0);
    expect(world.items.countInBackpack(ana, 'letter')).toBe(0);
    expect(gold()).toBe(before + offer.quest.reward.gold);
  });
});
