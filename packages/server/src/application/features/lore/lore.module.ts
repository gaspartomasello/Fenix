import type { ModuleFactory } from '../../kernel/game-module';
import { Legends } from './legends';
import { NpcTalk } from './npc-talk';

/** Las leyendas (rumores, jefes, pergaminos de maestría) y la charla con los vecinos. */
export const loreModule: ModuleFactory = (kernel) => {
  const legends = new Legends(
    kernel.world,
    kernel.clock,
    kernel.ids,
    kernel.items,
    kernel.mobiles,
    kernel.notifier,
  );
  const npcTalk = new NpcTalk(kernel.world, legends, kernel.notifier, kernel.random, () =>
    kernel.clock.now(),
  );
  // Los vecinos cercanos escuchan y contestan.
  kernel.events.on('spoke', ({ player, text }) => npcTalk.hear(player.id, text));
  kernel.events.on('creatureSlain', ({ killer, creature }) => legends.slain(killer, creature));
  kernel.itemUses.on('mastery', (playerId, itemId) => legends.readMastery(playerId, itemId), {
    ownedOnly: true,
  });
  return {
    name: 'lore',
    tick: (now) => legends.tick(now),
    joined: (player) => {
      if (player.legends.size > 0) legends.send(player);
    },
  };
};
