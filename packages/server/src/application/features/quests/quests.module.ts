import type { ModuleFactory } from '../../kernel/game-module';
import { Quests } from './quests';

/** Las misiones de los vecinos: pedirlas, cumplirlas (cazar criaturas) y cobrarlas. */
export const questsModule: ModuleFactory = (kernel) => {
  const quests = new Quests(kernel.world, kernel.clock, kernel.ids, kernel.items, kernel.notifier);
  kernel.events.on('creatureKilled', ({ killer, creature }) =>
    quests.creatureKilled(killer, creature),
  );
  return {
    name: 'quests',
    handles: {
      talkNpc: (playerId, m) => quests.talk(playerId, m.npcId),
      acceptQuest: (playerId, m) => quests.accept(playerId, m.npcId),
      abandonQuest: (playerId, m) => quests.abandon(playerId, m.giver),
    },
    joined: (player) => quests.sendJournal(player),
  };
};
