import type { ModuleFactory } from '../../kernel/game-module';
import { SendChat } from './send-chat';

/** Hablar: en voz alta, al grupo o al gremio. Avisa `spoke` cuando es en voz alta. */
export const chatModule: ModuleFactory = (kernel) => {
  const sendChat = new SendChat(kernel.world, kernel.notifier);
  return {
    name: 'chat',
    handles: {
      chat: (playerId, m) => {
        sendChat.execute(playerId, m.text, m.channel);
        const player = kernel.world.get(playerId);
        if (player && (m.channel ?? 'say') === 'say')
          kernel.events.emit('spoke', { player, text: m.text });
      },
    },
  };
};
